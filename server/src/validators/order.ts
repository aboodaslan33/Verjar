import { z } from 'zod';
import { nameField, optionalText, phoneField, requiredText } from './common';

export const orderSchema = z.object({
  name: nameField,
  phone: phoneField,
  address: requiredText('العنوان', 300),
  notes: optionalText(1000),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1, 'الكمية يجب أن تكون 1 على الأقل').max(100, 'الكمية كبيرة جدًا'),
      }),
    )
    .min(1, 'السلة فارغة')
    .max(50),
});

export type OrderInput = z.infer<typeof orderSchema>;
