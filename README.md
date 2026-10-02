# مجموعة فرجا (Farja Group)

منصة مجموعة فرجا: حجوزات خدمات البناء والصيانة والدهان والأعمال المعدنية، طلبات وعقود صيانة الشركات، متجر منتجات، صفحة للعميل، ولوحة تحكم كاملة للإدارة.
الواجهة بالعربية (RTL) بالكامل، والمشروع جاهز للنشر على Render.

- **Backend:** Node.js 20+ · Express · TypeScript · Prisma · PostgreSQL
- **Frontend:** React 18 · Vite · TypeScript · Tailwind CSS · خط IBM Plex Sans Arabic
- **الملفات:** Cloudinary (صور، فيديو، PDF)
- **واتساب:** روابط `wa.me` جاهزة افتراضيًا + إرسال تلقائي اختياري عبر WhatsApp Cloud API
- **المصادقة:** جلسة JWT موحّدة داخل httpOnly cookie (`vj_session`، 30 يومًا مع تجديد تلقائي) — دور `ADMIN` (و`STAFF`) للوحة التحكم ودور `CUSTOMER` للعملاء، وحماية CSRF بفحص الـ Origin

---

## المحتويات

1. [التشغيل محليًا](#التشغيل-محليًا)
2. [متغيرات البيئة](#متغيرات-البيئة)
3. [النشر على Render خطوة بخطوة](#النشر-على-render-خطوة-بخطوة)
4. [واتساب](#واتساب)
5. [النشرة البريدية](#النشرة-البريدية)
6. [السوق متعدد الموردين](#السوق-متعدد-الموردين)
7. [قواعد العمل](#قواعد-العمل)
8. [توثيق الـ API](#توثيق-الـ-api)
9. [الاختبارات](#الاختبارات)
10. [هيكل المشروع](#هيكل-المشروع)

---

## التشغيل محليًا

المتطلبات: Node.js 20 أو أحدث، و PostgreSQL 14 أو أحدث.

```bash
# 1) تثبيت الحزم
npm install            # يثبّت concurrently في الجذر
npm run install:all    # يثبّت server و client

# 2) قاعدة البيانات
createdb verjar
createdb verjar_test   # للاختبارات فقط

# 3) إعداد البيئة
cp server/.env.example server/.env    # عدّل DATABASE_URL و JWT_SECRET

# 4) إنشاء الجداول والبيانات الأولية
cd server
npx prisma migrate dev     # يطبّق الـ migrations
npm run seed               # أدمن + تصنيفات + خدمات الشركات + منتجات وحجز تجريبي
cd ..

# 5) التشغيل (السيرفر على 4000 والواجهة على 5173)
npm run dev
```

- الموقع: http://localhost:5173
- لوحة التحكم: http://localhost:5173/admin/login (أو من `/login` بنفس البريد) — الدخول بـ `ADMIN_EMAIL` / `ADMIN_PASSWORD` من `server/.env`
- حساب عميل: أنشئه من http://localhost:5173/register ثم ادخل من http://localhost:5173/login (بالهاتف أو البريد + كلمة المرور)
- عميل تجريبي (من `npm run seed`): الهاتف `0791234567` وكلمة المرور `Demo@12345`

في التطوير يمرر Vite الطلبات من `/api` و `/uploads` إلى السيرفر (راجع `client/vite.config.ts`)، ولا حاجة لإعداد `VITE_API_URL`.
بدون `CLOUDINARY_URL` تُحفظ الملفات المرفوعة في `server/uploads`، وهذا للتطوير فقط.

### أوامر مفيدة

| الأمر | المكان | الوصف |
|---|---|---|
| `npm run dev` | الجذر | تشغيل السيرفر والواجهة معًا |
| `npm run build` | الجذر | بناء السيرفر والواجهة |
| `npm test` | الجذر أو `server/` | اختبارات الـ API |
| `npm run prisma:migrate` | `server/` | إنشاء migration جديدة بعد تعديل `schema.prisma` |
| `npm run seed` | `server/` | البيانات الأولية (آمن للتكرار) |
| `npm run typecheck` | `server/` أو `client/` | فحص الأنواع |

---

## متغيرات البيئة

### السيرفر (`server/.env`)

| المتغير | مطلوب | الوصف |
|---|---|---|
| `DATABASE_URL` | ✔ | رابط PostgreSQL |
| `JWT_SECRET` | ✔ | نص عشوائي طويل (16 حرفًا على الأقل) لتوقيع الجلسات |
| `NODE_ENV` | | `development` أو `production` |
| `PORT` | | منفذ السيرفر (Render يضبطه تلقائيًا) |
| `CLIENT_URL` | ✔ إنتاج | رابط الواجهة للـ CORS، ويمكن وضع أكثر من رابط مفصولة بفاصلة |
| `PUBLIC_API_URL` | | رابط الـ API العام، ويُستخدم لروابط الملفات المحلية فقط |
| `COOKIE_SAMESITE` | | `lax` (الافتراضي، عندما تمرر الواجهة `/api` عبر rewrite)، أو `none` إذا كانت الواجهة والـ API على دومينين مختلفين |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | ✔ في الإنتاج | حساب الأدمن. عند كل تشغيل للـ seed: يُنشأ إن لم يوجد، وتُحدَّث كلمة المرور إن تغيّرت. `ADMIN_EMAIL` افتراضيًا `farjarweb@gmail.com`. في الإنتاج بدون `ADMIN_PASSWORD` لا يُنشأ الحساب |
| `SEED_DEMO` | | `false` لتخطي البيانات التجريبية |
| `TRUST_PROXY` | | عدد البروكسيات أمام السيرفر (افتراضي `1` على Render). إذا ظهرت رسالة "محاولات كثيرة" لكل المستخدمين معًا فالقيمة أقل من اللازم |
| `ADMIN_WHATSAPP` | | رقم واتساب الإدارة الافتراضي بصيغة دولية بدون `+` (`962780192930`)، ويمكن تغييره من الإعدادات |
| `CLOUDINARY_URL` | ✔ إنتاج | `cloudinary://<api_key>:<api_secret>@<cloud_name>` |
| `CLOUDINARY_FOLDER` | | المجلد في Cloudinary (افتراضي `verjar`) |
| `WA_MODE` | | `link` (افتراضي): بعد إرسال الحجز أو الطلب يفتح الموقع واتساب برسالة جاهزة لرقم الإدارة. `cloud`: إرسال تلقائي عبر Cloud API |
| `WA_TOKEN` / `WA_PHONE_ID` | اختياري | مفاتيح WhatsApp Cloud API — تُستخدم فقط مع `WA_MODE=cloud` |
| `BREVO_API_KEY` (أو `RESEND_API_KEY`) + `MAIL_FROM_EMAIL` | للبريد على Render | إرسال البريد عبر HTTPS — **ضروري على Render المجاني لأنه يحجب منافذ SMTP** (يظهر الخطأ `ETIMEDOUT` / `Connection timeout`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM_NAME` | للبريد | SMTP (مثل Gmail) للاستضافات التي تسمح به — يُستخدم فقط إذا لم يُضبط مفتاح Brevo/Resend |
| `WA_API_VERSION` | | إصدار Graph API (افتراضي `v21.0`) |
| `TEST_DATABASE_URL` | اختبارات | قاعدة بيانات الاختبار، ويجب أن يحتوي اسمها على `test` |

### الواجهة (`client/.env`)

| المتغير | الوصف |
|---|---|
| `VITE_API_URL` | اتركه فارغًا عند تمرير `/api` على نفس الدومين (الإعداد الموصى به). ضع رابط السيرفر فقط إذا كانت الواجهة على دومين مختلف، ويلزم حينها `COOKIE_SAMESITE=none` |

---

## النشر على Render خطوة بخطوة

الملف `render.yaml` (Blueprint) يعرّف ثلاث خدمات:

- **verjar-db**: قاعدة PostgreSQL
- **verjar-api**: Web Service للسيرفر
- **verjar-web**: Static Site للواجهة، مع rewrite يمرر `/api/*` إلى السيرفر، فتكون الكوكيز من نفس الدومين وتعمل على كل المتصفحات بما فيها Safari

### 1. تجهيز Cloudinary

1. أنشئ حسابًا مجانيًا على cloudinary.com.
2. من Dashboard انسخ **API Environment variable**، وشكله `cloudinary://123:abc@cloud-name`.
3. (مهم لملفات PDF) من Settings ← Security فعّل **Allow delivery of PDF and ZIP files**.

### 2. رفع المشروع إلى GitHub

```bash
git push origin main
```

### 3. إنشاء الخدمات من الـ Blueprint

1. في Render Dashboard اختر **New ← Blueprint**.
2. اربط المستودع. سيقرأ Render ملف `render.yaml` ويعرض الخدمات الثلاث.
3. سيطلب قيم المتغيرات المعلّمة `sync: false`:
   - `ADMIN_EMAIL`: `farjarweb@gmail.com`
   - `ADMIN_PASSWORD`: كلمة مرور قوية خاصة بك (8 أحرف على الأقل، ولا تستخدم أي مثال منشور في هذا المستودع — يرفضها السيرفر في الإنتاج). لتغييرها لاحقًا عدّلها هنا وأعد النشر؛ تغييرها من لوحة التحكم يُستبدل بهذه القيمة عند إعادة التشغيل
   - `CLOUDINARY_URL`: القيمة من الخطوة 1
   - `WA_TOKEN` و `WA_PHONE_ID`: اتركهما فارغين إذا لم تفعّل Cloud API
4. اضغط **Apply**. سيُنشئ Render قاعدة البيانات ويربط `DATABASE_URL` بالسيرفر تلقائيًا، ويولّد `JWT_SECRET`.

### 4. تشغيل الـ migrations

لا تحتاج لخطوة يدوية. أمر التشغيل `npm run start:render` ينفّذ عند كل نشر:

```
prisma migrate deploy   →  يطبّق أي migration جديدة
tsx prisma/seed.ts      →  ينشئ/يحدّث الأدمن من ADMIN_EMAIL و ADMIN_PASSWORD، والتصنيفات وخدمات الشركات إن لم تكن موجودة
node dist/index.js      →  يشغّل السيرفر
```

لتشغيلها يدويًا من جهازك على قاعدة Render: انسخ **External Database URL** من صفحة verjar-db ثم:

```bash
cd server
DATABASE_URL="<External Database URL>" npx prisma migrate deploy
DATABASE_URL="<External Database URL>" SEED_DEMO=false npm run seed
```

### 5. مطابقة الروابط

إذا أعطاك Render أسماء مختلفة عن `verjar-api` و `verjar-web` (عندما يكون الاسم محجوزًا):

1. في **verjar-web ← Redirects/Rewrites** عدّل وجهة `/api/*` إلى `https://<اسم-خدمة-api>.onrender.com/api/*`.
2. في **verjar-api ← Environment** عدّل `CLIENT_URL` و `PUBLIC_API_URL`.
   مهم: `CLIENT_URL` يجب أن يحتوي رابط الواجهة الفعلي (وأي دومين خاص، مفصولة بفاصلة)، لأن الـ API يرفض طلبات POST/PUT/PATCH/DELETE القادمة من مصدر غير موجود فيه (حماية CSRF). عند الرفض يُطبع في سجل السيرفر سطر يبدأ بـ `[csrf]` ويذكر المصدر المرفوض.
3. أعد النشر (Manual Deploy).

### 6. التحقق

- `https://verjar-api.onrender.com/health` يجب أن يعيد `{"ok":true,...}`.
- افتح `https://verjar-web.onrender.com/admin` وادخل بـ `farjarweb@gmail.com` وكلمة المرور التي اخترتها في `ADMIN_PASSWORD`.
- من **الإعدادات** في لوحة التحكم راجع رقم الواتساب ورسوم الكشف وساعات العمل ومحتوى "نبذة عنا".

### 7. دومين خاص (اختياري)

أضف الدومين في verjar-web ← Settings ← Custom Domains، ثم أضفه إلى `CLIENT_URL` في verjar-api (مثال: `https://your-domain.com,https://verjar-web.onrender.com`).

> **ملاحظات Render:**
> - الخطة المجانية للـ Web Service تتوقف بعد فترة خمول، وأول طلب بعدها يأخذ ~30–50 ثانية. للاستخدام الفعلي اختر خطة Starter.
> - قاعدة Postgres المجانية تنتهي بعد مدة محدودة. للإنتاج اختر خطة مدفوعة واحتفظ بنسخ احتياطية.
> - قرص Render مؤقت، ولهذا تُرفع كل الملفات إلى Cloudinary.

---

## واتساب

الخدمة `server/src/services/whatsapp.service.ts` لها واجهة واحدة (`sendWhatsApp` / `notifyAdmin` / `notifyCustomer`) تعمل بحالتين:

1. **الافتراضي (`WA_MODE=link`):** بعد كل حجز أو طلب أو طلب شركة يولّد السيرفر رسالة مرتبة ويعيد رابط `https://wa.me/<رقم الإدارة>?text=<الرسالة>`، وتفتح الواجهة واتساب تلقائيًا عند العميل برسالة جاهزة (مع زر "إرسال عبر واتساب" احتياطًا). في لوحة التحكم، عند تغيير الحالة أو رفع عرض سعر، يظهر للأدمن زر يفتح واتساب برسالة جاهزة للعميل.
2. **WhatsApp Cloud API (اختياري):** عند ضبط `WA_MODE=cloud` مع `WA_TOKEN` و `WA_PHONE_ID` صالحين يرسل السيرفر الرسالة تلقائيًا للإدارة وللعميل، ويبقى رابط wa.me كنسخة احتياطية.

كل رسالة تُسجّل في جدول `WhatsAppLog` وتظهر في **لوحة التحكم ← السجلات**.

> تنبيه: سياسة Meta لا تسمح بإرسال رسائل نصية حرة لعميل لم يراسلك خلال آخر 24 ساعة، ويلزم حينها **قالب رسالة معتمد (Template)**. التأكيدات والإشعارات الفورية بعد الطلب تعمل غالبًا لأن العميل يبدأ المحادثة بزر wa.me. لرسائل المتابعة المتأخرة (تذكير عقد، عرض سعر بعد أيام) أنشئ قوالب في WhatsApp Manager.

مثال رسالة طلب المتجر:

```
طلب جديد #1042 — مجموعة فرجا
العميل: سارة خليل  الهاتف: 0771234567
العنوان: عمّان — عبدون
المنتجات:
- كرسي حديقة حديد مشغول × 2 = 90 د.أ (بعد خصم 10%)
المجموع قبل الخصم: 100 د.أ
الخصم: 10 د.أ
الإجمالي: 90 د.أ
المرجع: O-7K3M9Q
```

---

## النشرة البريدية

من **لوحة التحكم ← النشرة البريدية** يكتب الأدمن رسالة موحّدة (منتج جديد، خدمة جديدة، إعلان) مع زر اختياري (منتج، الحجوزات، الشركات، المتجر)، ويعاينها ويرسل نسخة تجريبية لبريده، ثم يرسلها لكل العملاء المسجّلين الذين لديهم بريد ووافقوا على الاستلام. الإرسال في الخلفية مع عدادات حيّة وسجل للحملات. من صفحة أي منتج يوجد زر **"أعلن عنه بالبريد"**.

- الإعداد: `SMTP_USER` (مثل farjarweb@gmail.com) و `SMTP_PASS` = **App Password** من حساب Google (يتطلب تفعيل التحقق بخطوتين: myaccount.google.com/apppasswords). `SMTP_HOST=smtp.gmail.com` و `SMTP_PORT=465` افتراضيًا.
- حد Gmail تقريبًا 500 رسالة يوميًا؛ للأعداد الأكبر استخدم مزود SMTP مخصص (Brevo، Mailgun، SES) بنفس المتغيرات.
- كل رسالة فيها رابط إلغاء اشتراك موقّع، وزر إلغاء الاشتراك في Gmail (One-Click). العميل يتحكم بالاشتراك من صفحة حسابه أيضًا.
- نفس الإعداد يفعّل **"نسيت كلمة المرور"**: رابط بالبريد صالح لساعة ولمرة واحدة. العميل بدون بريد يعيّن له الأدمن كلمة مرور مؤقتة من صفحة العميل.

## السوق متعدد الموردين

المتجر سوق يبيع فيه موردون متعددون، والشركة نفسها مورد افتراضي (`house_vendor`، عمولة 100%) تُنسب له منتجات المتجر القديمة وما يضيفه الأدمن.

- **الأقسام:** ديناميكية من `/admin/categories` بمستويين (رئيسي وفرعي). لكل قسم حقول مواصفات (`text`، `number`، `select` مع خيارات، وإلزامي أو اختياري)، والقسم الفرعي يرث حقول القسم الرئيسي. إخفاء القسم الرئيسي يخفي منتجات أقسامه الفرعية.
- **الموردون:** الأدمن يمنح عميلًا مسجّلًا صلاحية مورد من `/admin/vendors` أو من صفحة العميل، ويحدد العمولة (افتراضي 10%). سحب الصلاحية (`active=false`) يوقف لوحة المورد فورًا ويخفي منتجاته، والطلبات والمستحقات تبقى.
- **لوحة المورد `/vendor`:** ملف المتجر (الاسم، الشعار، الوصف)، والمنتجات (صور Cloudinary حتى 8 لكل منتج، سعر، خصم، مخزون، قسم، مواصفات)، والطلبات وتحديث حالتها، والأرباح. صفحة المتجر العامة `/store/vendor/:slug`.
- **المراجعة:** منتج المورد الجديد `PENDING` ولا يظهر قبل موافقة الأدمن. تعديل الاسم أو الوصف أو القسم أو المواصفات أو إضافة صور يعيده للمراجعة، وأي تعديل على منتج مرفوض يعيد إرساله. السعر والمخزون والإظهار لا تحتاج مراجعة.
- **الطلب:** السلة تقبل منتجات من أكثر من مورد، والطلب ينقسم عند الإرسال إلى طلب فرعي (`VendorOrder`) لكل مورد. كل بند يحفظ وقت البيع: السعر، نسبة العمولة، العمولة، وصافي المورد. تغيير عمولة المورد لاحقًا لا يغيّر الطلبات السابقة.
- **الحالات والمخزون:** المورد يحدّث حالة طلبه الفرعي (إعادة تفعيل الملغي للإدارة فقط). الإلغاء يُرجع المخزون، والتراجع عنه يخصمه من جديد. حالة الطلب الرئيسي تُشتق من طلباته الفرعية (كلها ملغاة = ملغي، وإلا أبطأ طلب فرعي نشط)، وتغييرها من الأدمن يُطبَّق على كل الطلبات الفرعية.
- **التسوية:** المستحق للمورد = صافي طلباته الفرعية المكتملة غير المسوّاة. زر "تم الدفع" يسجّل `VendorPayout` ويربط به هذه الطلبات، وبعدها لا تتغير حالتها.
- **العزل:** كل مسارات `/vendor` مقيدة بمتجر صاحب الجلسة، والعنصر الذي يخص موردًا آخر يُعامل كغير موجود (404). المورد لا يستطيع تغيير المورد أو حالة المراجعة أو التمييز.

## قواعد العمل

- **المواعيد:** لا يُقبل حجزان بفارق أقل من `bookingGapHours` (افتراضي 3 ساعات) على مستوى الشركة. الأوقات المحجوزة تظهر معطّلة. التحقق النهائي يتم داخل معاملة مع قفل `pg_advisory_xact_lock`، فلا ينجح حجزان متزامنان لنفس الفترة. أيام وساعات العمل وطول الفترة تُضبط من الإعدادات. التوقيت دائمًا بتوقيت عمّان (`Asia/Amman`).
- **رسوم الكشف:** الكشف الفني ثابت لكل المحافظات: عادي 25، عاجل 50، طارئ 70 دينار. الكشف على أعمال الدهان 15 داخل عمّان و25 خارجها. البناء والأعمال المعدنية والخدمات العامة بدون رسوم كشف. كل المبالغ قابلة للتعديل من الإعدادات، وتُحسب في السيرفر وقت الحجز.
- **الأسعار:** يُحسب السعر النهائي بعد الخصم في السيرفر عند حفظ المنتج (`finalPrice`)، ويُعاد حسابه عند الطلب من قاعدة البيانات وليس من المتصفح. المخزون يُخصم داخل المعاملة ويرجع عند إلغاء الطلب.
- **الملفات:** يُفحص نوع الملف من محتواه الفعلي (magic bytes) وليس من الامتداد. الحدود: صور الحجز حتى 5 صور بحد 5MB لكل صورة، ملفات التصميم والسجل التجاري صور أو PDF حتى 10MB، ملفات عروض الأسعار PDF حتى 15MB، ووسائط المنتجات صور حتى 8MB وفيديو واحد حتى 60MB.
- **العملاء:** الحجز والطلب من المتجر وطلبات الشركات للعملاء المسجّلين فقط (`/register` ثم `/login` بالهاتف أو البريد + كلمة المرور)، وكل حجز أو طلب يُربط بحساب العميل. التصفح (الخدمات، المنتجات، الأسعار، من نحن) مفتوح للجميع. الزائر الذي يفتح صفحة حجز أو السلة يُحوَّل إلى `/login?next=<الصفحة>` ويعود إليها بعد الدخول.
- **العقود:** يرسل السيرفر تذكيرًا واتساب للإدارة قبل انتهاء العقد بعدد الأيام المحدد، مرة واحدة لكل عقد، ويحوّل العقود المنتهية إلى `EXPIRED` تلقائيًا.
- **الحذف:** كل الحذف في لوحة التحكم حذف منطقي (`deletedAt`)، وكل تعديلات الأدمن تُسجل في `AuditLog`.
- **الأمان:** Helmet، CORS مقيد بـ `CLIENT_URL`، rate limiting (20 نموذجًا لكل 15 دقيقة لكل IP، و10 محاولات دخول)، تحقق Zod من كل المدخلات برسائل عربية، كوكيز httpOnly.

---

## توثيق الـ API

الأساس: `/api/v1` (والمسارات نفسها متاحة أيضًا تحت `/api` مباشرة، مثل `/api/auth/me`). كل استجابة بالشكل:

```json
{ "ok": true, "data": { }, "error": null }
{ "ok": false, "data": null, "error": { "code": "VALIDATION", "message": "رقم الهاتف غير صحيح", "fields": { "phone": "..." } } }
```

القوائم المرقّمة تقبل `?page=1&pageSize=20` وتعيد `{ items, total, page, pageSize, pages }`.

### عام

| Method | المسار | الوصف |
|---|---|---|
| GET | `/site/settings` | الإعدادات العامة (التواصل، الرسوم، أيام العمل، المحتوى) |
| GET | `/bookings/slots?date=YYYY-MM-DD` | أوقات اليوم: `{ open, reason, gapHours, slots:[{time, available, reason}] }` |
| POST | `/bookings` | **(عميل مسجّل)** إنشاء حجز. `multipart/form-data`: `data` (JSON) + `photos[]` (حتى 5) + `designFiles[]`، أو JSON بدون ملفات |
| GET | `/store/categories` | شجرة الأقسام الظاهرة `[{ ..., productCount, children: [...] }]` |
| GET | `/store/products?category=&vendor=&q=&featured=&sort=new\|price_asc\|price_desc\|discount` | المنتجات المعتمدة (القسم الرئيسي يشمل فروعه) مع `vendor` و`specs` |
| GET | `/store/products/:slug` | منتج مع `specList` (المواصفات بأسمائها) + منتجات مشابهة |
| GET | `/store/vendors/:slug` | ملف متجر مورد وعدد منتجاته |
| POST | `/store/orders` | **(عميل مسجّل)** `{ name, phone, address, notes?, items:[{productId, quantity}] }` — يعيد أيضًا `vendorOrders` (طلب فرعي لكل مورد) |
| GET | `/corporate/services` | خدمات الشركات (ANNUAL / URGENT) |
| POST | `/corporate/requests` | **(عميل مسجّل)** طلب شركة. `multipart`: `data` (JSON) + `commercialRegister` + `license` |

**جسم الحجز (`data`)**: الحقول المشتركة هي `type, name, phone, locationText, lat?, lng?, floor?, date, time, notes?` إضافة إلى `details` حسب النوع:

| type | حقول إضافية |
|---|---|
| `INSPECTION` | `urgency: NORMAL\|URGENT\|EMERGENCY` (رسوم ثابتة لكل المحافظات)، `details: { faultType, description }` |
| `PAINTING` | `zone: INSIDE_AMMAN\|OUTSIDE_AMMAN` (رسوم الكشف)، `details: { paintType, jobKind: NEW\|RENEW, rooms, area, colors?, decorations }` |
| `CONSTRUCTION` | `lat, lng` مطلوبة، `details: { tiles, buildingType: HOUSE\|APARTMENT\|VILLA\|COMMERCIAL, landArea, buildArea, floors, hasDesign }` + `designFiles` عند `hasDesign` |
| `METALWORK` | `details: { workType, hasDesign, dimensions, quantity }` + `designFiles` عند `hasDesign` |
| `GENERAL` | `details: { description }` |

**جسم طلب الشركة**: `type: ANNUAL|URGENT, companyName, contactName, managerPhone, maintenancePhone, locationText, lat?, lng?, services: [key], notes?`، ويضيف `URGENT` الحقول `workLocation, productionImpact: NO_STOP_NEEDED|CANNOT_STOP|PARTIAL_STOP, productionLineAffected, urgencyLevel: LOW|MEDIUM|HIGH|CRITICAL`.

استجابة الإنشاء (حجز / طلب / طلب شركة): `{ id, number, ref, status, message, whatsapp: { link, sent }, ... }`.

### المصادقة

الجلسة في كوكي واحد `vj_session` (httpOnly، `Secure` في الإنتاج، `SameSite` حسب `COOKIE_SAMESITE`) لمدة 30 يومًا، ويُعاد إصداره تلقائيًا بعد يوم من آخر إصدار. لا يُخزَّن أي توكن في localStorage.
أي طلب يغيّر البيانات من متصفح يجب أن يأتي من `CLIENT_URL` أو من دومين الـ API نفسه (فحص `Origin`/`Referer`).
الجلسة تحمل بصمة كلمة المرور وتُتحقق من قاعدة البيانات مع كل طلب: تغيير كلمة المرور أو إعادة تعيينها أو إيقاف الحساب يُنهي كل الجلسات الأخرى فورًا.
حدود الدخول: 10 محاولات كل 15 دقيقة لكل IP، و10 محاولات فاشلة كل 15 دقيقة لكل حساب (هاتف/بريد).

| Method | المسار | الوصف |
|---|---|---|
| GET | `/auth/me` | المستخدم الحالي `{ role: CUSTOMER\|ADMIN\|STAFF, id, name, ... }` أو 401 |
| POST | `/auth/logout` | يمسح الجلسة |
| POST | `/auth/register` | تسجيل عميل `{ name, phone (07XXXXXXXX), email?, password (8+), ref? }`. إن كان للرقم حجوزات سابقة من قبل التسجيل (بيانات قديمة) يُعاد `409 CLAIM_REQUIRED` ويُطلب `ref` (رقم مرجع أحدها) لإثبات ملكية الرقم |
| POST | `/auth/login` | دخول العميل `{ identifier, password }` حيث `identifier` رقم الهاتف أو البريد |
| PATCH | `/auth/profile` | تعديل `{ name?, email?, emailOptIn? }` للعميل |
| POST | `/auth/password/forgot` | `{ email }` يرسل رابط تعيين كلمة مرور جديدة (صالح لساعة) |
| POST | `/auth/password/reset` | `{ token, password }` |
| POST | `/auth/admin/login` | `{ email, password }` — حسابات الأدمن تُنشأ من الـ seed فقط |
| POST | `/auth/admin/logout` | |
| GET | `/auth/admin/me` | |
| POST | `/auth/admin/password` | `{ current, next }` |
| POST | `/auth/customer/logout` | |
| GET | `/auth/customer/me` | |
| POST | `/auth/customer/password` | `{ current, password }` تغيير كلمة المرور (الحالية مطلوبة) |

### العميل (جلسة بدور `CUSTOMER`)

| Method | المسار | الوصف |
|---|---|---|
| GET | `/account/overview` | الحجوزات، الطلبات، طلبات الشركات، العقود، الملفات (عروض الأسعار/التقييم)، الدفعات، والملخص المالي |

### المورد (عميل بصلاحية مورد فعّالة) — تحت `/vendor`

| المسار | العمليات |
|---|---|
| `/me` | GET: الملف والإجماليات والأعداد، PATCH `{ name?, description? }` |
| `/me/logo` | POST `multipart file` / DELETE |
| `/categories` | GET: الأقسام الظاهرة مع حقول المواصفات الفعلية |
| `/products` | GET (`q, approval`) / POST `{ name, description, price, discountPercent?, stock, visible?, categoryId, specs }`، و `/:id` GET / PATCH / DELETE |
| `/products/:id/media` | POST `multipart files[]` (صور فقط)، و `/:mediaId` DELETE، و `/order` PUT `{ ids }` |
| `/orders` | GET (`status`)، و `/:id` GET / PATCH `{ status: CONFIRMED\|IN_PROGRESS\|COMPLETED\|CANCELLED }` |
| `/earnings` | GET: الإجماليات، الطلبات المستحقة، والتسويات |

### الأدمن (جلسة بدور `ADMIN` أو `STAFF`) — تحت `/admin`

| المسار | العمليات |
|---|---|
| `/dashboard/stats` | GET: إحصائيات اليوم والشهر وآخر النشاطات |
| `/dashboard/events` | GET: بث لحظي SSE (`event: activity`) للطلبات الجديدة |
| `/bookings` | GET: قائمة بفلاتر `status, type, urgency, technicianId, from, to, q` |
| `/bookings/calendar?month=YYYY-MM` | GET: حجوزات الشهر للتقويم |
| `/bookings/slots?date=&exclude=` | GET: أوقات متاحة لإعادة الجدولة |
| `/bookings/:id` | GET / PATCH (`status, technicianId, date+time, overrideHours, quotedAmount, adminNotes, urgency, notify`) / DELETE |
| `/bookings/:id/whatsapp` | POST `{ to: admin\|customer }`: إعادة إرسال |
| `/technicians` | GET / POST، و `/technicians/:id` PATCH |
| `/orders` | GET بفلاتر `status, q, from, to`، و `/orders/:id` GET / PATCH (`status, notify`) / DELETE |
| `/orders/:id/whatsapp` | POST: إعادة إرسال واتساب |
| `/orders/:id/vendor-orders/:voId` | PATCH `{ status }`: حالة طلب فرعي واحد |
| `/store/categories` | GET / POST `{ name, parentId?, specFields?, sortOrder?, visible? }`، و `/:id` PATCH / DELETE |
| `/store/products` | GET (`approval, vendorId, categoryId, …`) / POST (`vendorId?`، افتراضيًا الشركة)، و `/:id` GET / PATCH / DELETE |
| `/store/products/:id/approve`، `/reject` | POST: اعتماد منتج مورد، أو رفضه `{ reason }` |
| `/vendors` | GET، POST `{ customerId, commissionPercent? }` (منح الصلاحية)، و `/:id` GET / PATCH `{ commissionPercent?, name?, active? }` |
| `/vendors/report?from=&to=` | GET: لكل مورد المبيعات، العمولة، صافي المورد، المدفوع، والمستحق |
| `/vendors/:id/payouts` | POST `{ method?, reference?, note?, expectedAmount? }`: "تم الدفع" — تسوية كل المستحق |
| `/store/products/:id/media` | POST `multipart files[]`، و `/:mediaId` DELETE، و `/order` PUT `{ ids }` |
| `/corporate/requests` | GET، و `/:id` GET / PATCH، و `/:id/whatsapp` POST |
| `/corporate/requests/:id/contract` | POST `{ title, startDate, endDate, value, reminderDays?, notes? }`: تحويل إلى عقد نشط |
| `/corporate/contracts` | GET (`status, expiring=true`)، و `/:id` PATCH / DELETE |
| `/files` | POST `multipart`: `file` (PDF) + `kind, title, amount?, notify` + أحد `customerId, bookingId, orderId, corporateRequestId, contractId`. يظهر الملف في صفحة العميل ويُرسل رابطه عبر واتساب |
| `/finance/customers` | GET: لكل عميل المطلوب والمدفوع والمتبقي (`q, due=true`) مع الإجماليات |
| `/finance/customers/:id` | GET: الملخص وسجل الدفعات |
| `/finance/payments` | POST: إضافة دفعة يدويًا، و `/:id` DELETE |
| `/finance/export?kind=customers\|payments` | GET: تصدير CSV (UTF-8 مع BOM ليفتح في Excel) |
| `/customers` | GET، و `/:id` GET (السجل الكامل) / PATCH |
| `/settings` | GET / PUT (الحقول المتغيرة فقط) |
| `/logs/whatsapp`، `/logs/audit` | GET |

---

## الاختبارات

اختبارات Jest + Supertest لمسارات الحجز والطلب والشركات والسوق متعدد الموردين، وتشمل عزل الموردين ومراجعة المنتجات وتقسيم الطلب وتثبيت العمولة والتسوية، وقاعدة الساعات الثلاث والحجز المتزامن وحساب الرسوم ورسالة واتساب وخصم المخزون وإرجاعه والملفات والمالية ودخول العميل.

```bash
createdb verjar_test
cd server
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/verjar_test npm test
```

تطبّق الاختبارات الـ migrations على قاعدة الاختبار وتفرّغ جداولها قبل كل اختبار، ولهذا ترفض أي رابط لا يحتوي اسمه على `test`.

---

## هيكل المشروع

```
verjar/
├── client/
│   ├── public/
│   │   ├── seed/
│   │   ├── _redirects
│   │   ├── favicon.svg
│   │   └── robots.txt
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── AdminLayout.tsx
│   │   │   │   ├── AdminMap.tsx
│   │   │   │   ├── ConfirmDialog.tsx
│   │   │   │   ├── ContractForm.tsx
│   │   │   │   ├── DataTable.tsx
│   │   │   │   ├── FileUploadForm.tsx
│   │   │   │   ├── LeafletMap.tsx
│   │   │   │   ├── MediaGallery.tsx
│   │   │   │   ├── PaymentForm.tsx
│   │   │   │   ├── RecordLists.tsx
│   │   │   │   ├── StatusSelect.tsx
│   │   │   │   ├── WhatsAppFallback.tsx
│   │   │   │   ├── hooks.ts
│   │   │   │   ├── labels.ts
│   │   │   │   ├── live.tsx
│   │   │   │   ├── types.ts
│   │   │   │   └── ui.tsx
│   │   │   ├── forms/
│   │   │   │   ├── FilePicker.tsx
│   │   │   │   ├── FormBits.tsx
│   │   │   │   ├── LocationPicker.tsx
│   │   │   │   ├── MapView.tsx
│   │   │   │   ├── SlotPicker.tsx
│   │   │   │   └── formUtils.ts
│   │   │   ├── layout/
│   │   │   │   ├── Logo.tsx
│   │   │   │   ├── PublicLayout.tsx
│   │   │   │   ├── SiteFooter.tsx
│   │   │   │   └── SiteHeader.tsx
│   │   │   ├── store/
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   └── QtyStepper.tsx
│   │   │   └── ui/
│   │   │       ├── Button.tsx
│   │   │       ├── Feedback.tsx
│   │   │       ├── Field.tsx
│   │   │       ├── Icon.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── PageHeader.tsx
│   │   │       ├── Pagination.tsx
│   │   │       ├── Price.tsx
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── Stepper.tsx
│   │   │       └── index.ts
│   │   ├── context/
│   │   │   ├── AdminAuth.tsx
│   │   │   ├── CartContext.tsx
│   │   │   ├── CustomerAuth.tsx
│   │   │   ├── SiteContext.tsx
│   │   │   ├── ThemeContext.tsx
│   │   │   └── ToastContext.tsx
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── format.ts
│   │   │   ├── types.ts
│   │   │   └── useAsync.ts
│   │   ├── pages/
│   │   │   ├── account/
│   │   │   │   └── Account.tsx
│   │   │   ├── auth/            # Login, Register, ForgotPassword, ResetPassword
│   │   │   ├── admin/
│   │   │   │   ├── AdminApp.tsx
│   │   │   │   ├── BookingDetail.tsx
│   │   │   │   ├── Bookings.tsx
│   │   │   │   ├── Categories.tsx
│   │   │   │   ├── Contracts.tsx
│   │   │   │   ├── Corporate.tsx
│   │   │   │   ├── CorporateDetail.tsx
│   │   │   │   ├── CustomerDetail.tsx
│   │   │   │   ├── Customers.tsx
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Finance.tsx
│   │   │   │   ├── Login.tsx
│   │   │   │   ├── Logs.tsx
│   │   │   │   ├── OrderDetail.tsx
│   │   │   │   ├── Orders.tsx
│   │   │   │   ├── ProductEditor.tsx
│   │   │   │   ├── Products.tsx
│   │   │   │   ├── Settings.tsx
│   │   │   │   └── Technicians.tsx
│   │   │   └── public/
│   │   │       ├── About.tsx
│   │   │       ├── BookingForm.tsx
│   │   │       ├── Bookings.tsx
│   │   │       ├── Cart.tsx
│   │   │       ├── Checkout.tsx
│   │   │       ├── Contact.tsx
│   │   │       ├── Corporate.tsx
│   │   │       ├── CorporateForm.tsx
│   │   │       ├── Home.tsx
│   │   │       ├── NotFound.tsx
│   │   │       ├── ProductPage.tsx
│   │   │       └── Store.tsx
│   │   ├── styles/
│   │   │   └── index.css
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── .env.example
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── tsconfig.tsbuildinfo
│   └── vite.config.ts
├── server/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── jobs/
│   │   │   └── contractReminders.ts
│   │   ├── lib/
│   │   │   ├── audit.ts
│   │   │   ├── events.ts
│   │   │   ├── http.ts
│   │   │   ├── ids.ts
│   │   │   ├── labels.ts
│   │   │   ├── money.ts
│   │   │   ├── pagination.ts
│   │   │   ├── phone.ts
│   │   │   ├── prisma.ts
│   │   │   ├── time.ts
│   │   │   └── zodArabic.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── error.ts
│   │   │   ├── rateLimit.ts
│   │   │   └── upload.ts
│   │   ├── routes/
│   │   │   ├── admin/
│   │   │   │   ├── bookings.ts
│   │   │   │   ├── corporate.ts
│   │   │   │   ├── customers.ts
│   │   │   │   ├── dashboard.ts
│   │   │   │   ├── files.ts
│   │   │   │   ├── finance.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── orders.ts
│   │   │   │   ├── products.ts
│   │   │   │   ├── settings.ts
│   │   │   │   └── shared.ts
│   │   │   ├── customer/
│   │   │   │   └── account.ts
│   │   │   ├── public/
│   │   │   │   ├── bookings.ts
│   │   │   │   ├── corporate.ts
│   │   │   │   ├── site.ts
│   │   │   │   └── store.ts
│   │   │   └── auth.ts
│   │   ├── services/
│   │   │   ├── customer.service.ts
│   │   │   ├── messages.ts
│   │   │   ├── schedule.service.ts
│   │   │   ├── settings.service.ts
│   │   │   ├── upload.service.ts
│   │   │   └── whatsapp.service.ts
│   │   ├── validators/
│   │   │   ├── booking.ts
│   │   │   ├── common.ts
│   │   │   ├── corporate.ts
│   │   │   └── order.ts
│   │   ├── app.ts
│   │   └── index.ts
│   ├── tests/
│   │   ├── bookings.test.ts
│   │   ├── corporate.test.ts
│   │   ├── env.ts
│   │   ├── globalSetup.ts
│   │   ├── helpers.ts
│   │   └── orders.test.ts
│   ├── .env.example
│   ├── jest.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── tsconfig.build.json
│   └── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── package.json
└── render.yaml
```
