import { z } from 'zod';
import {
  boolField,
  dateField,
  latField,
  lngField,
  nameField,
  optionalText,
  phoneField,
  positiveInt,
  positiveNumber,
  requiredText,
  timeField,
} from './common';

/** الحقول المشتركة لكل أنواع الحجز */
const common = {
  name: nameField,
  phone: phoneField,
  locationText: requiredText('مكان الموقع', 300),
  lat: latField,
  lng: lngField,
  floor: optionalText(30),
  date: dateField,
  time: timeField,
  notes: optionalText(2000),
};

export const inspectionSchema = z.object({
  type: z.literal('INSPECTION'),
  ...common,
  zone: z.enum(['INSIDE_AMMAN', 'OUTSIDE_AMMAN'], { required_error: 'حدد إن كان الموقع داخل عمّان أو خارجها' }),
  urgency: z.enum(['NORMAL', 'EMERGENCY']).default('NORMAL'),
  details: z.object({
    faultType: requiredText('نوع العطل', 100),
    description: requiredText('وصف العطل', 2000),
  }),
});

export const paintingSchema = z.object({
  type: z.literal('PAINTING'),
  ...common,
  details: z.object({
    paintType: requiredText('نوعية الدهان', 100),
    jobKind: z.enum(['NEW', 'RENEW'], { required_error: 'اختر دهان جديد أم تجديد' }),
    rooms: positiveInt('عدد الغرف', 100),
    area: positiveNumber('المساحة'),
    colors: optionalText(300),
    decorations: boolField,
  }),
});

export const constructionSchema = z.object({
  type: z.literal('CONSTRUCTION'),
  ...common,
  details: z.object({
    tiles: boolField,
    buildingType: z.enum(['HOUSE', 'APARTMENT', 'VILLA', 'COMMERCIAL'], { required_error: 'اختر نوع البناء' }),
    landArea: positiveNumber('مساحة الأرض'),
    buildArea: positiveNumber('مساحة البناء'),
    floors: positiveInt('عدد الطوابق', 50),
    hasDesign: boolField,
  }),
});

export const metalworkSchema = z.object({
  type: z.literal('METALWORK'),
  ...common,
  details: z.object({
    workType: requiredText('نوع العمل', 100),
    hasDesign: boolField,
    dimensions: requiredText('المساحات والقياسات', 500),
    quantity: positiveInt('العدد المطلوب', 10000),
  }),
});

export const generalSchema = z.object({
  type: z.literal('GENERAL'),
  ...common,
  details: z.object({
    description: requiredText('وصف الطلب', 2000),
  }),
});

export const bookingSchema = z.discriminatedUnion('type', [
  inspectionSchema,
  paintingSchema,
  constructionSchema,
  metalworkSchema,
  generalSchema,
]);

export type BookingInput = z.infer<typeof bookingSchema>;

/** عدد الصور المسموح لكل نوع */
export const MAX_PHOTOS = 5;
export const MAX_DESIGN_FILES = 5;
