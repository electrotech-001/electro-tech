ALTER TABLE public.billing_quotations
    DROP CONSTRAINT IF EXISTS billing_quotations_plan_check;

ALTER TABLE public.billing_quotations
    ADD CONSTRAINT billing_quotations_plan_check CHECK (
        (
            payment_mode = 'direct'
            AND installment_count IS NULL
            AND (down_payment IS NULL OR down_payment >= 0)
        )
        OR (
            payment_mode = 'installments'
            AND down_payment IS NOT NULL
            AND down_payment >= 0
            AND installment_count IS NOT NULL
            AND installment_count BETWEEN 1 AND 120
        )
    );
