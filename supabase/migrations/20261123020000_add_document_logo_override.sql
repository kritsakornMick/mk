ALTER TABLE public.quotations
ADD COLUMN IF NOT EXISTS logo_url text;

DROP POLICY IF EXISTS "Can upload company logo" ON storage.objects;
CREATE POLICY "Can upload company logo"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'company-assets'
  AND (
    name = 'company-logo/current'
    OR name LIKE 'document-logos/%'
  )
);

DROP POLICY IF EXISTS "Can update company logo" ON storage.objects;
CREATE POLICY "Can update company logo"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'company-assets'
  AND (
    name = 'company-logo/current'
    OR name LIKE 'document-logos/%'
  )
)
WITH CHECK (
  bucket_id = 'company-assets'
  AND (
    name = 'company-logo/current'
    OR name LIKE 'document-logos/%'
  )
);
