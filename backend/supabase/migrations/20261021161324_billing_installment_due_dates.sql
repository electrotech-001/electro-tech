-- Due date chosen on the quotation for each installment. NULL means the dates are chosen later on the agreement.

ALTER TABLE public.billing_quotations
    ADD COLUMN IF NOT EXISTS installment_due_dates DATE[] NULL;

ALTER TABLE public.billing_projects
    ADD COLUMN IF NOT EXISTS installment_due_dates DATE[] NULL;
