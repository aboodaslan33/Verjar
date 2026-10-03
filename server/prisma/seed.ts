/**
 * بيانات أولية: حساب الأدمن، التصنيفات، خدمات الشركات، منتجات تجريبية، فنيين، وحجوزات/طلبات تجريبية
 * آمن للتشغيل أكثر من مرة (upsert).
 * لتخطي البيانات التجريبية: SEED_DEMO=false npm run seed
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const CATEGORIES = [
  { slug: 'indoor-furniture', name: 'أثاث داخلي', sortOrder: 1 },
  { slug: 'outdoor-furniture', name: 'أثاث خارجي', sortOrder: 2 },
  { slug: 'decor', name: 'تحف وتشكيلات', sortOrder: 3 },
  { slug: 'industrial', name: 'منتجات صناعية', sortOrder: 4 },
];

const ANNUAL_SERVICES = [
  ['foundation-water', 'صيانة تأسيسية (ماء وتمديدات)'],
  ['facilities', 'صيانة مرافق'],
  ['walls', 'صيانة جدران'],
  ['gmp', 'مطابقة GMP'],
  ['iso', 'مطابقة مواصفات ISO'],
  ['epoxy-floors', 'صيانة أرضيات إيبوكسي'],
  ['electrical', 'صيانة كهرباء'],
  ['production-lines', 'صيانة خطوط إنتاج'],
  ['signage', 'لوحات إرشادية وأرضية'],
  ['pest-control', 'مكافحة الآفات'],
  ['efficiency', 'رفع كفاءة المنشأة التشغيلية'],
];

const URGENT_SERVICES = [
  ['u-walls', 'صيانة جدران'],
  ['u-facilities', 'صيانة مرافق'],
  ['u-electrical', 'صيانة كهرباء'],
  ['u-plumbing', 'سباكة'],
  ['u-argon', 'لحام آرغون'],
  ['u-epoxy', 'صيانة إيبوكسي'],
  ['u-roof', 'عزل الأسطح'],
  ['pest-control-urgent', 'مكافحة الآفات (طارئ)'],
];

const PRODUCTS: {
  slug: string;
  name: string;
  category: string;
  price: number;
  discount: number;
  stock: number;
  featured: boolean;
  image: string;
  description: string;
}[] = [
  {
    slug: 'garden-chair-iron',
    name: 'كرسي حديقة حديد مشغول',
    category: 'outdoor-furniture',
    price: 50,
    discount: 10,
    stock: 24,
    featured: true,
    image: '/seed/garden-chair.svg',
    description:
      'هيكل حديد مربع 20×20 ملم، مدهون بطبقة أساس ضد الصدأ وطبقتين دهان فرن. المقعد خشب بلوط معالج للاستخدام الخارجي.\nالأبعاد: 55 × 60 × 85 سم. يتحمل حتى 130 كغ.',
  },
  {
    slug: 'outdoor-table-set',
    name: 'طاولة جلسة خارجية مع 4 كراسي',
    category: 'outdoor-furniture',
    price: 320,
    discount: 15,
    stock: 6,
    featured: true,
    image: '/seed/outdoor-table.svg',
    description:
      'طاولة بسطح خشب تيك 140 × 80 سم وقاعدة حديد، مع أربعة كراسي من نفس الخط.\nمناسبة للبرندات والحدائق. التركيب مجاني داخل عمّان.',
  },
  {
    slug: 'wooden-bookshelf',
    name: 'مكتبة خشب وحديد',
    category: 'indoor-furniture',
    price: 145,
    discount: 0,
    stock: 10,
    featured: true,
    image: '/seed/bookshelf.svg',
    description: 'خمسة رفوف خشب زان بسماكة 25 ملم على إطار حديد أسود مطفي.\nالأبعاد: 90 × 35 × 180 سم. تُثبّت على الجدار للأمان.',
  },
  {
    slug: 'coffee-table',
    name: 'طاولة قهوة بسطح رخام',
    category: 'indoor-furniture',
    price: 185,
    discount: 20,
    stock: 4,
    featured: true,
    image: '/seed/coffee-table.svg',
    description: 'سطح رخام صناعي أبيض بعروق رمادية، وأرجل حديد مدهونة ذهبي مطفي.\nالقطر 80 سم، الارتفاع 42 سم.',
  },
  {
    slug: 'tv-unit',
    name: 'وحدة تلفزيون معلقة',
    category: 'indoor-furniture',
    price: 210,
    discount: 0,
    stock: 7,
    featured: false,
    image: '/seed/tv-unit.svg',
    description: 'وحدة MDF مقاوم للرطوبة بقشرة خشب جوز، درجين بإغلاق هادئ وفتحة خلفية للأسلاك.\nالطول 180 سم.',
  },
  {
    slug: 'metal-wall-art',
    name: 'لوحة جدارية معدنية — خط عربي',
    category: 'decor',
    price: 75,
    discount: 0,
    stock: 15,
    featured: true,
    image: '/seed/wall-art.svg',
    description: 'قص ليزر على صاج 2 ملم، دهان إلكتروستاتيك. يمكن تخصيص النص والمقاس عند الطلب.\nالمقاس القياسي 100 × 50 سم.',
  },
  {
    slug: 'planter-set',
    name: 'أحواض زراعة كورتن (3 قطع)',
    category: 'decor',
    price: 95,
    discount: 5,
    stock: 12,
    featured: false,
    image: '/seed/planters.svg',
    description: 'ثلاثة أحواض من حديد الكورتن بمقاسات 30 و40 و50 سم، مع فتحات تصريف.\nتكتسب لون الصدأ الطبيعي مع الوقت دون أن تتآكل.',
  },
  {
    slug: 'lantern',
    name: 'فانوس نحاس مشغول',
    category: 'decor',
    price: 38,
    discount: 0,
    stock: 30,
    featured: false,
    image: '/seed/lantern.svg',
    description: 'فانوس نحاس بزجاج ملون، شغل يدوي. الارتفاع 45 سم، يعمل بشمعة أو لمبة LED.',
  },
  {
    slug: 'steel-workbench',
    name: 'طاولة عمل صناعية',
    category: 'industrial',
    price: 260,
    discount: 0,
    stock: 5,
    featured: false,
    image: '/seed/workbench.svg',
    description: 'هيكل حديد 50×50 ملم، سطح صاج 3 ملم مع طبقة خشب، ودرج بقفل.\nالأبعاد: 180 × 75 × 90 سم. حمولة 500 كغ.',
  },
  {
    slug: 'storage-rack',
    name: 'رف تخزين معدني قابل للتعديل',
    category: 'industrial',
    price: 120,
    discount: 10,
    stock: 18,
    featured: false,
    image: '/seed/rack.svg',
    description: 'خمسة رفوف قابلة لتغيير الارتفاع، حمولة الرف 200 كغ. مناسب للمستودعات والمحلات.\nالأبعاد: 100 × 50 × 200 سم.',
  },
  {
    slug: 'safety-floor-signs',
    name: 'ملصقات أرضية إرشادية (عبوة 20)',
    category: 'industrial',
    price: 45,
    discount: 0,
    stock: 40,
    featured: false,
    image: '/seed/floor-signs.svg',
    description: 'ملصقات فينيل مقاومة للاحتكاك لتحديد المسارات ومناطق الخطر في المصانع، متوافقة مع متطلبات السلامة.',
  },
];

const DEFAULT_ADMIN_EMAIL = 'farjarweb@gmail.com';
const DEV_ADMIN_PASSWORD = 'FarjarGroup@2026';

/**
 * حساب الأدمن من متغيرات البيئة عند كل تشغيل:
 * - غير موجود ← يُنشأ
 * - موجود وكلمة المرور في البيئة مختلفة عن المحفوظة ← تُحدَّث
 *   (ملاحظة: تغيير كلمة المرور من لوحة التحكم يُستبدل بقيمة ADMIN_PASSWORD عند إعادة التشغيل — غيّرها في Render)
 * في الإنتاج لا تُستخدم كلمة مرور افتراضية: بدون ADMIN_PASSWORD لا يُنشأ الحساب ولا يُعدَّل.
 */
async function syncAdmin() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';
  const password = process.env.ADMIN_PASSWORD || (isProd ? '' : DEV_ADMIN_PASSWORD);
  if (!password) {
    console.warn(`! ADMIN_PASSWORD غير مضبوط — لم يُنشأ/يُحدَّث حساب الأدمن (${email}). أضفه في متغيرات البيئة.`);
    return;
  }
  if (password.length < 8) {
    console.warn('! ADMIN_PASSWORD أقصر من 8 أحرف — لم يُحدَّث حساب الأدمن.');
    return;
  }
  // كلمات المرور المنشورة في ملفات المثال والتوثيق لا تُقبل في الإنتاج
  const PUBLISHED = ['Verjar@2026', 'FarjaGroup@2026', 'FarjarGroup@2026', 'change-me', 'change-me-strong-password'];
  if (isProd && PUBLISHED.some((p) => p.toLowerCase() === password.toLowerCase())) {
    console.warn('! ADMIN_PASSWORD يطابق كلمة مرور منشورة في ملفات المثال — لم يُنشأ/يُحدَّث حساب الأدمن. اختر كلمة مرور خاصة.');
    return;
  }
  const name = process.env.ADMIN_NAME || 'إدارة مجموعة فرجار';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 11), role: 'ADMIN' } });
    console.log(`✓ أُنشئ حساب الأدمن: ${email}`);
    return;
  }
  if (existing.name !== name) {
    await prisma.user.update({ where: { id: existing.id }, data: { name } });
  }
  if (!(await bcrypt.compare(password, existing.passwordHash))) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await bcrypt.hash(password, 11) } });
    console.log(`✓ حُدّثت كلمة مرور الأدمن من متغيرات البيئة: ${email}`);
  } else if (!existing.active) {
    // لا يُعاد تفعيل حساب أوقفه أحد عمدًا
    console.warn(`! حساب الأدمن ${email} موقوف — لم يُعَد تفعيله تلقائيًا`);
  } else {
    console.log(`• حساب الأدمن جاهز: ${email}`);
  }
}

/** إعدادات محفوظة بالقيم القديمة للاسم/البريد تُحدَّث للهوية الجديدة (ولا تُلمس إن عدّلها الأدمن لقيمة أخرى) */
async function migrateBrandSettings() {
  const updates: [string, string, string][] = [
    ['email', 'info@verjar.jo', 'farjarweb@gmail.com'],
    ['aboutTitle', 'فيرجار للمقاولات والصيانة', 'مجموعة فرجار للتصميم والمقاولات والصيانة'],
    ['aboutTitle', 'مجموعة فرجار للمقاولات والصيانة', 'مجموعة فرجار للتصميم والمقاولات والصيانة'],
    ['aboutTitle', 'فرجار قروب للمقاولات والصيانة', 'مجموعة فرجار للتصميم والمقاولات والصيانة'],
  ];
  for (const [key, from, to] of updates) {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row && row.value === from) {
      await prisma.setting.update({ where: { key }, data: { value: to } });
      console.log(`✓ حُدّث إعداد ${key} للهوية الجديدة`);
    }
  }
}

async function main() {
  await syncAdmin();
  await migrateBrandSettings();

  for (const c of CATEGORIES) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: {} });
  }
  console.log('✓ التصنيفات');

  for (const [i, [key, name]] of ANNUAL_SERVICES.entries()) {
    await prisma.corporateService.upsert({
      where: { key },
      create: { key, name, kind: 'ANNUAL', sortOrder: i },
      update: { name, kind: 'ANNUAL', sortOrder: i },
    });
  }
  for (const [i, [key, name]] of URGENT_SERVICES.entries()) {
    await prisma.corporateService.upsert({
      where: { key },
      create: { key, name, kind: 'URGENT', sortOrder: i },
      update: { name, kind: 'URGENT', sortOrder: i },
    });
  }
  console.log('✓ خدمات الشركات');

  if (process.env.SEED_DEMO === 'false') return;

  // المورد الافتراضي (الشركة) — منتجات الورشة تُنسب له
  const house = await prisma.vendor.upsert({
    where: { id: 'house_vendor' },
    create: {
      id: 'house_vendor',
      name: 'مجموعة فرجار',
      slug: 'farja-group',
      description: 'منتجات من ورشة مجموعة فرجار.',
      commissionPercent: new Prisma.Decimal(100),
      isHouse: true,
    },
    update: {},
  });

  const cats = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  for (const p of PRODUCTS) {
    const exists = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        price: new Prisma.Decimal(p.price),
        // منتجات فرجار نفسها: بلا نسبة، سعر المورد = سعر العميل
        supplierPrice: new Prisma.Decimal(p.price),
        platformFeePercent: new Prisma.Decimal(0),
        discountPercent: p.discount,
        finalPrice: new Prisma.Decimal(round3(p.price * (1 - p.discount / 100))),
        stock: p.stock,
        featured: p.featured,
        categoryId: cats[p.category],
        vendorId: house.id,
        approvalStatus: 'APPROVED',
        media: { create: [{ kind: 'IMAGE', url: p.image, sortOrder: 0 }] },
      },
    });
  }
  console.log('✓ المنتجات التجريبية');

  if ((await prisma.technician.count()) === 0) {
    await prisma.technician.createMany({
      data: [
        { name: 'أبو خالد', phone: '0791111111', specialty: 'دهان وديكور' },
        { name: 'محمد العمري', phone: '0792222222', specialty: 'بناء وتشطيب' },
        { name: 'سامر حداد', phone: '0793333333', specialty: 'حدادة ولحام' },
      ],
    });
    console.log('✓ الفنيون');
  }

  // عميل وحجز وطلب تجريبي
  if ((await prisma.booking.count()) === 0) {
    const customer = await prisma.customer.upsert({
      where: { phone: '962791234567' },
      create: {
        phone: '962791234567',
        name: 'أحمد السعدي',
        passwordHash: await bcrypt.hash('Demo@12345', 11),
        registeredAt: new Date(),
      },
      update: {},
    });
    const in3days = new Date(Date.now() + 3 * 86400_000);
    in3days.setUTCHours(7, 0, 0, 0); // 10:00 بتوقيت عمّان
    await prisma.booking.create({
      data: {
        ref: 'B-DEMO01',
        type: 'INSPECTION',
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        locationText: 'عمّان — خلدا، شارع وصفي التل، عمارة 14',
        lat: 31.9994,
        lng: 35.8331,
        floor: '3',
        scheduledAt: in3days,
        urgency: 'NORMAL',
        inspectionFee: new Prisma.Decimal(25),
        details: { faultType: 'تسريب مياه', description: 'رطوبة في سقف الحمام وتقشر في الدهان تحت خزان السطح.' },
        whatsappText: 'حجز تجريبي',
      },
    });
    const chair = await prisma.product.findUnique({ where: { slug: 'garden-chair-iron' } });
    if (chair) {
      const order = await prisma.order.create({
        data: {
          ref: 'O-DEMO01',
          customerId: customer.id,
          customerName: customer.name,
          phone: customer.phone,
          address: 'عمّان — خلدا',
          subtotal: new Prisma.Decimal(100),
          discountTotal: new Prisma.Decimal(10),
          total: new Prisma.Decimal(90),
          whatsappText: 'طلب تجريبي',
        },
      });
      await prisma.vendorOrder.create({
        data: {
          orderId: order.id,
          vendorId: house.id,
          subtotal: new Prisma.Decimal(100),
          total: new Prisma.Decimal(90),
          commissionTotal: new Prisma.Decimal(90),
          vendorNet: new Prisma.Decimal(0),
          items: {
            create: [
              {
                orderId: order.id,
                vendorId: house.id,
                productId: chair.id,
                name: chair.name,
                unitPrice: chair.price,
                discountPercent: chair.discountPercent,
                unitFinalPrice: chair.finalPrice,
                quantity: 2,
                lineTotal: new Prisma.Decimal(90),
                commissionPercent: new Prisma.Decimal(100),
                commissionAmount: new Prisma.Decimal(90),
                vendorNet: new Prisma.Decimal(0),
              },
            ],
          },
        },
      });
    }
    console.log('✓ حجز وطلب تجريبي (دخول العميل: 0791234567 / Demo@12345)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
