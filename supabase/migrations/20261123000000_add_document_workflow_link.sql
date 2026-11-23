ALTER TABLE public.quotations
ADD COLUMN IF NOT EXISTS source_document_id text;

CREATE INDEX IF NOT EXISTS quotations_source_document_id_idx
ON public.quotations (source_document_id);
