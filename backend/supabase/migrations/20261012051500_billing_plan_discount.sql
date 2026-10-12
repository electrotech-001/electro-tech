-- A discount taken after the down payment, before the balance is divided into installments.

ALTER TABLE public.billing_quotations
    ADD COLUMN IF NOT EXISTS plan_discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (plan_discount >= 0);

ALTER TABLE public.billing_projects
    ADD COLUMN IF NOT EXISTS plan_discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (plan_discount >= 0);
