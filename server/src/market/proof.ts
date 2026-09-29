import { badRequest } from '../lib/http';
import { POLICIES, validateAndStore } from '../services/upload.service';

/**
 * إيصال الدفع اليدوي (صورة أو PDF) — إلزامي لأي طلب مدفوع (باقة أو إعلان)،
 * فلا يصل الإدارةَ طلبٌ مدفوع بدون دفع. يُتحقق من الملف ويُخزَّن قبل إنشاء الطلب والفاتورة.
 */
export async function storePaymentProof(file: Express.Multer.File | undefined, meta: { reference?: string | null; note?: string | null }) {
  if (!file) throw badRequest('أرفق صورة أو ملف PDF لإيصال الدفع', { fields: { paymentProof: 'أرفق إيصال الدفع', file: 'أرفق إثبات الدفع' } });
  const [stored] = await validateAndStore([file], POLICIES.documents, 'payments');
  return {
    proofUrl: stored.url,
    proofPublicId: stored.publicId,
    proofName: stored.originalName.slice(0, 120),
    proofKind: stored.kind,
    proofStatus: 'SUBMITTED',
    proofSubmittedAt: new Date(),
    payerReference: meta.reference || null,
    payerNote: meta.note || null,
  };
}
