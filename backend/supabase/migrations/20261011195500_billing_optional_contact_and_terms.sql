-- CNIC and contact number may be left blank on a quotation.
-- A single editable terms block is printed on quotations and invoices.

ALTER TABLE public.billing_quotations
    DROP CONSTRAINT IF EXISTS billing_quotations_cnic_check;

ALTER TABLE public.billing_quotations
    ADD CONSTRAINT billing_quotations_cnic_check
    CHECK (cnic = '' OR cnic ~ '^\d{5}-\d{7}-\d$');

ALTER TABLE public.billing_quotations
    DROP CONSTRAINT IF EXISTS billing_quotations_contact_no_check;

ALTER TABLE public.billing_quotations
    ADD CONSTRAINT billing_quotations_contact_no_check
    CHECK (contact_no = '' OR contact_no ~ '^\d{4}-\d{7}$');

CREATE TABLE IF NOT EXISTS public.billing_document_terms (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.billing_document_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_document_terms FROM anon, authenticated;
GRANT ALL ON TABLE public.billing_document_terms TO service_role;
