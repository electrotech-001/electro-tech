-- Amounts typed by the admin for each installment. NULL keeps the equal split of the remaining balance.

ALTER TABLE public.billing_quotations
    ADD COLUMN IF NOT EXISTS installment_amounts NUMERIC(14, 2)[] NULL;

ALTER TABLE public.billing_projects
    ADD COLUMN IF NOT EXISTS installment_amounts NUMERIC(14, 2)[] NULL;
