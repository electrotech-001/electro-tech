-- Billing quotations and the approved copies that become projects in process.
-- Browser roles cannot read these tables. The Express API uses the service role.

CREATE TABLE IF NOT EXISTS public.billing_quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial TEXT NOT NULL UNIQUE,
    serial_number INTEGER NOT NULL UNIQUE CHECK (serial_number > 0),
    quotation_date DATE NOT NULL,
    customer_name TEXT NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 120),
    cnic TEXT NOT NULL CHECK (cnic ~ '^\d{5}-\d{7}-\d$'),
    address TEXT NOT NULL CHECK (char_length(btrim(address)) BETWEEN 1 AND 400),
    contact_no TEXT NOT NULL CHECK (contact_no ~ '^\d{4}-\d{7}$'),
    whatsapp_no TEXT NOT NULL CHECK (whatsapp_no ~ '^\d{4}-\d{7}$'),
    customer_package TEXT NOT NULL CHECK (char_length(btrim(customer_package)) BETWEEN 1 AND 4000),
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('installments', 'direct')),
    down_payment NUMERIC(14, 2),
    installment_count INTEGER,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT billing_quotations_plan_check CHECK (
        (
            payment_mode = 'direct'
            AND down_payment IS NULL
            AND installment_count IS NULL
        )
        OR (
            payment_mode = 'installments'
            AND down_payment IS NOT NULL
            AND down_payment >= 0
            AND installment_count IS NOT NULL
            AND installment_count BETWEEN 1 AND 120
        )
    )
);

CREATE TABLE IF NOT EXISTS public.billing_quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.billing_quotations (id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL CHECK (line_no > 0),
    description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
    qty NUMERIC(14, 2) NOT NULL CHECK (qty > 0),
    unit TEXT NOT NULL CHECK (char_length(btrim(unit)) BETWEEN 1 AND 40),
    price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
    tax_percent NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100),
    UNIQUE (quotation_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.billing_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_quotation_id UUID NOT NULL UNIQUE REFERENCES public.billing_quotations (id),
    serial TEXT NOT NULL,
    serial_number INTEGER NOT NULL CHECK (serial_number > 0),
    quotation_date DATE NOT NULL,
    customer_name TEXT NOT NULL,
    cnic TEXT NOT NULL,
    address TEXT NOT NULL,
    contact_no TEXT NOT NULL,
    whatsapp_no TEXT NOT NULL,
    customer_package TEXT NOT NULL,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('installments', 'direct')),
    down_payment NUMERIC(14, 2),
    installment_count INTEGER,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_project_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.billing_projects (id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL CHECK (line_no > 0),
    description TEXT NOT NULL,
    qty NUMERIC(14, 2) NOT NULL CHECK (qty > 0),
    unit TEXT NOT NULL,
    price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
    tax_percent NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100),
    UNIQUE (project_id, line_no)
);

CREATE INDEX IF NOT EXISTS billing_quotation_items_quotation_id_idx
    ON public.billing_quotation_items (quotation_id);
CREATE INDEX IF NOT EXISTS billing_project_items_project_id_idx
    ON public.billing_project_items (project_id);

ALTER TABLE public.billing_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_project_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_quotations FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_quotation_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_projects FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_project_items FROM anon, authenticated;

GRANT ALL ON TABLE public.billing_quotations TO service_role;
GRANT ALL ON TABLE public.billing_quotation_items TO service_role;
GRANT ALL ON TABLE public.billing_projects TO service_role;
GRANT ALL ON TABLE public.billing_project_items TO service_role;
