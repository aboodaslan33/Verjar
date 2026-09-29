-- بيانات حساب التحويل للدفع اليدوي (بنك الاتحاد — طارق — CliQ 0780192930)
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
  ('paymentBankName', '"بنك الاتحاد"'::jsonb, NOW()),
  ('paymentAccountName', '"طارق"'::jsonb, NOW()),
  ('paymentCliq', '"0780192930"'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();
