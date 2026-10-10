-- Run once in Supabase SQL Editor. Existing names, roles and permissions are preserved.
BEGIN;
ALTER TABLE public.armani_leadership
  DROP CONSTRAINT IF EXISTS armani_leadership_slot_check;
ALTER TABLE public.armani_leadership
  ADD CONSTRAINT armani_leadership_slot_check CHECK (slot BETWEEN 1 AND 4);
ALTER TABLE public.armani_leadership ADD COLUMN IF NOT EXISTS image_path text;
ALTER TABLE public.armani_leadership
  DROP CONSTRAINT IF EXISTS armani_leadership_image_path_check;
ALTER TABLE public.armani_leadership
  ADD CONSTRAINT armani_leadership_image_path_check
  CHECK (image_path IS NULL OR image_path ~ '^media/[a-f0-9-]+\.(png|jpg|webp)$');
INSERT INTO public.armani_leadership(slot,nickname,role,description)
VALUES (4,'Вакантне місце','CURATOR','Куратор складу')
ON CONFLICT (slot) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
