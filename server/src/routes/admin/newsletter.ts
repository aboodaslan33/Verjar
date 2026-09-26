import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { audit } from '../../lib/audit';
import { HttpError, asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { type CampaignContent, emailReady, recipientsWhere, renderCampaign, runCampaign, sendOne } from '../../services/email.service';

export const newsletterRouter = Router();

const campaignInput = z
  .object({
    subject: z.string({ required_error: 'العنوان مطلوب' }).trim().min(3, 'العنوان قصير جدًا').max(150, 'العنوان طويل جدًا'),
    body: z.string({ required_error: 'نص الرسالة مطلوب' }).trim().min(10, 'نص الرسالة قصير جدًا').max(5000, 'نص الرسالة طويل جدًا'),
    ctaKind: z.enum(['none', 'product', 'bookings', 'corporate', 'store']).default('none'),
    productId: z.string().optional().nullable(),
  })
  .refine((v) => v.ctaKind !== 'product' || Boolean(v.productId), { message: 'اختر المنتج', path: ['productId'] });

type Input = z.infer<typeof campaignInput>;

async function contentOf(input: Input): Promise<CampaignContent> {
  let product: CampaignContent['product'] = null;
  if (input.ctaKind === 'product') {
    const p = await prisma.product.findFirst({
      where: { id: input.productId!, deletedAt: null, visible: true },
      select: {
        name: true,
        slug: true,
        price: true,
        finalPrice: true,
        discountPercent: true,
        media: { where: { kind: 'IMAGE' }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      },
    });
    if (!p) throw badRequest('المنتج غير موجود أو مخفي', { field: 'productId' });
    product = { ...p, price: Number(p.price), finalPrice: Number(p.finalPrice), image: p.media[0]?.url ?? null };
  }
  return { subject: input.subject, body: input.body, ctaKind: input.ctaKind, product };
}

/** حالة البريد وعدد المشتركين وآخر الحملات */
newsletterRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [subscribers, campaigns] = await Promise.all([
      prisma.customer.count({ where: recipientsWhere }),
      prisma.emailCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { createdBy: { select: { name: true } } },
      }),
    ]);
    ok(res, { enabled: emailReady(), from: env.SMTP_USER || null, subscribers, campaigns });
  }),
);

/** معاينة شكل الرسالة (HTML) */
newsletterRouter.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const content = await contentOf(campaignInput.parse(req.body));
    const { html } = renderCampaign(content, { id: 'preview', name: 'اسم العميل' });
    ok(res, { html });
  }),
);

/** إرسال تجربة لبريد الأدمن فقط */
newsletterRouter.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (!emailReady()) throw new HttpError(503, 'البريد غير مفعّل. أضف إعدادات SMTP في متغيرات البيئة.', 'EMAIL_DISABLED');
    const content = await contentOf(campaignInput.parse(req.body));
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
    try {
      await sendOne(admin.email, { ...content, subject: `[تجربة] ${content.subject}` }, { id: 'test', name: admin.name });
    } catch (e) {
      throw new HttpError(502, `تعذر الإرسال: ${e instanceof Error ? e.message.slice(0, 200) : 'خطأ غير معروف'}`, 'EMAIL_FAILED');
    }
    ok(res, { sentTo: admin.email });
  }),
);

/** إرسال للجميع — يبدأ في الخلفية ويُتابع من قائمة الحملات */
newsletterRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!emailReady()) throw new HttpError(503, 'البريد غير مفعّل. أضف إعدادات SMTP في متغيرات البيئة.', 'EMAIL_DISABLED');
    const input = campaignInput.parse(req.body);
    const content = await contentOf(input);
    const running = await prisma.emailCampaign.count({ where: { status: 'SENDING' } });
    if (running) throw new HttpError(409, 'هناك حملة قيد الإرسال الآن، انتظر حتى تنتهي', 'CAMPAIGN_RUNNING');
    const recipients = await prisma.customer.count({ where: recipientsWhere });
    if (!recipients) throw badRequest('لا يوجد مشتركون لديهم بريد إلكتروني بعد');
    const campaign = await prisma.emailCampaign.create({
      data: {
        subject: input.subject,
        body: input.body,
        ctaKind: input.ctaKind,
        productId: input.ctaKind === 'product' ? input.productId : null,
        recipients,
        createdById: req.auth!.sub,
      },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'send', entity: 'emailCampaign', entityId: campaign.id, meta: { recipients } });
    // لا ننتظر الإرسال — الواجهة تتابع العدادات
    void runCampaign(campaign.id, content).catch(async (e) => {
      console.error('campaign failed', e);
      await prisma.emailCampaign
        .update({ where: { id: campaign.id }, data: { status: 'FAILED', lastError: String(e).slice(0, 300), finishedAt: new Date() } })
        .catch(() => undefined);
    });
    ok(res, campaign, 202);
  }),
);

newsletterRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound('الحملة غير موجودة');
    ok(res, c);
  }),
);
