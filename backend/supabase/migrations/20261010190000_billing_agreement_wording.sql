-- Agreement letter text the admin can edit for each customer.

ALTER TABLE public.billing_agreements
    ADD COLUMN IF NOT EXISTS body TEXT;

ALTER TABLE public.billing_agreements
    DROP CONSTRAINT IF EXISTS billing_agreements_body_length;

ALTER TABLE public.billing_agreements
    ADD CONSTRAINT billing_agreements_body_length
    CHECK (body IS NULL OR char_length(btrim(body)) BETWEEN 1 AND 8000);
