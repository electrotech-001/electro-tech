-- WhatsApp number may be left blank on a quotation, the same way the contact number can.

ALTER TABLE public.billing_quotations
    DROP CONSTRAINT IF EXISTS billing_quotations_whatsapp_no_check;

ALTER TABLE public.billing_quotations
    ADD CONSTRAINT billing_quotations_whatsapp_no_check
    CHECK (whatsapp_no = '' OR whatsapp_no ~ '^\d{4}-\d{7}$');
