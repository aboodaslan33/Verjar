import { z } from 'zod';
import { boolField, latField, lngField, nameField, optionalText, phoneField, requiredText } from './common';

const base = {
  companyName: requiredText('اسم الشركة', 150),
  contactName: nameField,
  managerPhone: phoneField,
  maintenancePhone: phoneField,
  locationText: requiredText('موقع الشركة', 300),
  lat: latField,
  lng: lngField,
  services: z.array(z.string().min(1)).min(1, 'اختر خدمة واحدة على الأقل').max(30),
  notes: optionalText(2000),
};

export const annualSchema = z.object({ type: z.literal('ANNUAL'), ...base });

export const urgentSchema = z.object({
  type: z.literal('URGENT'),
  ...base,
  workLocation: requiredText('موقع العمل داخل المنشأة', 300),
  productionImpact: z.enum(['NO_STOP_NEEDED', 'CANNOT_STOP', 'PARTIAL_STOP'], {
    required_error: 'حدد إمكانية العمل مع الإنتاج',
  }),
  productionLineAffected: boolField,
  urgencyLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], { required_error: 'حدد درجة الاستعجال' }),
});

export const corporateSchema = z.discriminatedUnion('type', [annualSchema, urgentSchema]);
export type CorporateInput = z.infer<typeof corporateSchema>;
