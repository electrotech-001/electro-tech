ALTER TABLE public.billing_payments DROP CONSTRAINT IF EXISTS billing_payments_paid_amount_check;

ALTER TABLE public.billing_payments
  ADD CONSTRAINT billing_payments_paid_amount_check CHECK (paid_amount >= 0);
