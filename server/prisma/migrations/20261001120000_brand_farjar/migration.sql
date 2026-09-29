-- تصحيح اسم العلامة: "فرجا" ← "فرجار" و"Farja" ← "Farjar" في البيانات المخزّنة (المتجر، أسماء الإدارة، الإعدادات)
UPDATE "Vendor"
SET "name" = regexp_replace("name", 'فرجا(?!ر)', 'فرجار', 'g'),
    "description" = regexp_replace("description", 'فرجا(?!ر)', 'فرجار', 'g')
WHERE "name" ~ 'فرجا(?!ر)' OR "description" ~ 'فرجا(?!ر)';

UPDATE "User"
SET "name" = regexp_replace("name", 'فرجا(?!ر)', 'فرجار', 'g')
WHERE "name" ~ 'فرجا(?!ر)';

UPDATE "Setting"
SET "value" = regexp_replace(regexp_replace("value"::text, 'فرجا(?!ر)', 'فرجار', 'g'), 'Farja(?![rG])', 'Farjar', 'g')::jsonb
WHERE "value"::text ~ 'فرجا(?!ر)|Farja(?![rG])';
