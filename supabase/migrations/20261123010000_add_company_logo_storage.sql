ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can read company logos" ON storage.objects;
CREATE POLICY "Public can read company logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Can upload company logo" ON storage.objects;
CREATE POLICY "Can upload company logo"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'company-assets'
  AND name = 'company-logo/current'
);

DROP POLICY IF EXISTS "Can update company logo" ON storage.objects;
CREATE POLICY "Can update company logo"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'company-assets'
  AND name = 'company-logo/current'
)
WITH CHECK (
  bucket_id = 'company-assets'
  AND name = 'company-logo/current'
);
