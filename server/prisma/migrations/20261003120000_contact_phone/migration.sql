-- رقم التواصل الجديد للموقع: الهاتف وواتساب الإدارة ورقم CliQ للدفع → 0781400353
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
  ('phone', '"0781400353"'::jsonb, NOW()),
  ('whatsappNumber', '"962781400353"'::jsonb, NOW()),
  ('paymentCliq', '"0781400353"'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();
