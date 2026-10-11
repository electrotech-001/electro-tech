-- Discount amounts on invoices and received payments.

ALTER TABLE public.billing_invoices
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.billing_invoices
    DROP CONSTRAINT IF EXISTS billing_invoices_discount_amount_check;

ALTER TABLE public.billing_invoices
    ADD CONSTRAINT billing_invoices_discount_amount_check CHECK (discount_amount >= 0);

ALTER TABLE public.billing_payments
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.billing_payments
    DROP CONSTRAINT IF EXISTS billing_payments_discount_amount_check;

ALTER TABLE public.billing_payments
    ADD CONSTRAINT billing_payments_discount_amount_check CHECK (discount_amount >= 0);
