-- صفحات التواصل الاجتماعي لمجموعة فرجار
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
  ('instagram', '"https://www.instagram.com/farjargroup"'::jsonb, NOW()),
  ('facebook', '"https://www.facebook.com/share/1JXBPKT9dz/"'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();
