/** صور من أعمال مجموعة فرجار (WebP مضغوطة في public/images/work) */
export type Work = {
  src: string;
  width: number;
  height: number;
  title: string;
  category: string;
  text: string;
};

export const WORKS: Work[] = [
  {
    src: '/images/work/kitchen-luxury.webp',
    width: 580,
    height: 570,
    title: 'مطبخ فاخر بخزائن زجاجية',
    category: 'مطابخ',
    text: 'خزائن بلون أخضر هادئ، واجهات زجاجية بإطار ذهبي وإضاءة مخفية، وجزيرة رخامية للجلوس.',
  },
  {
    src: '/images/work/kitchen-wall.webp',
    width: 520,
    height: 692,
    title: 'خزائن ممتدة حتى السقف',
    category: 'تصميم داخلي',
    text: 'خزائن رمادية مطفية بمقابض طولية، رف مفتوح من خشب الجوز، وركن مطبخ مدمج بإضاءة.',
  },
  {
    src: '/images/work/villa.webp',
    width: 634,
    height: 685,
    title: 'فيلا من الهيكل حتى التشطيب',
    category: 'بناء وتشطيب',
    text: 'قبل وبعد: من الهيكل الخرساني إلى واجهة حجر وخشب بإضاءة خطية وحديقة أمامية.',
  },
  {
    src: '/images/work/kitchen-line.webp',
    width: 246,
    height: 347,
    title: 'مطبخ خطي بواجهات مضلّعة',
    category: 'مطابخ',
    text: 'خزائن علوية مضلّعة، سطح عمل داكن، وإضاءة أسفل الخزائن.',
  },
  {
    src: '/images/work/kitchen-open.webp',
    width: 246,
    height: 345,
    title: 'تخزين علوي وأجهزة مدمجة',
    category: 'مطابخ',
    text: 'أبواب علوية بفتح رأسي، فرن وميكروويف مدمجان، وخلفية رخامية فاتحة.',
  },
];

/** التخصصات كما في بطاقة الشركة */
export const SPECIALTIES = [
  'ديكورات داخلية',
  'منازل ذكية',
  'جدران ثلاثية الأبعاد',
  'طين ديكوري',
  'أرضيات إيبوكسي',
  'تصميم هندسي',
  'أحواض ديكور',
];
