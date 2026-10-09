-- Agreements, guarantors, invoices, and received payments for projects in process.

ALTER TABLE public.billing_projects
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_process';

ALTER TABLE public.billing_projects
    DROP CONSTRAINT IF EXISTS billing_projects_status_check;

ALTER TABLE public.billing_projects
    ADD CONSTRAINT billing_projects_status_check CHECK (status IN ('in_process', 'completed'));

ALTER TABLE public.billing_projects
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.billing_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES public.billing_projects (id) ON DELETE CASCADE,
    serial TEXT NOT NULL UNIQUE,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('installments', 'direct')),
    schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_guarantors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id UUID NOT NULL REFERENCES public.billing_agreements (id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.billing_projects (id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
    full_name TEXT NOT NULL,
    designation TEXT NOT NULL,
    occupation TEXT NOT NULL,
    sector TEXT NOT NULL CHECK (sector IN ('private', 'government')),
    cnic_front TEXT NOT NULL,
    cnic_back TEXT NOT NULL,
    UNIQUE (agreement_id, slot)
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.billing_projects (id) ON DELETE CASCADE,
    serial TEXT NOT NULL UNIQUE,
    serial_number INTEGER NOT NULL UNIQUE CHECK (serial_number > 0),
    kind TEXT NOT NULL CHECK (kind IN ('advance', 'settlement', 'installment')),
    status TEXT NOT NULL CHECK (status IN ('partial', 'paid', 'due')),
    invoice_date DATE NOT NULL,
    due_date DATE,
    payment_date DATE,
    payment_mode TEXT CHECK (payment_mode IS NULL OR payment_mode IN ('bank_transfer', 'cash')),
    advance_paid NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (advance_paid >= 0),
    balance_due NUMERIC(14, 2) NOT NULL CHECK (balance_due >= 0),
    grand_total NUMERIC(14, 2) NOT NULL CHECK (grand_total >= 0),
    installment_number INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.billing_projects (id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.billing_invoices (id) ON DELETE SET NULL,
    installment_number INTEGER,
    expected_amount NUMERIC(14, 2) NOT NULL CHECK (expected_amount >= 0),
    paid_amount NUMERIC(14, 2) NOT NULL CHECK (paid_amount > 0),
    payment_date DATE NOT NULL,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('bank_transfer', 'cash')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_guarantors_customer_idx ON public.billing_guarantors (customer_name);
CREATE INDEX IF NOT EXISTS billing_invoices_project_idx ON public.billing_invoices (project_id);
CREATE INDEX IF NOT EXISTS billing_payments_project_idx ON public.billing_payments (project_id);

ALTER TABLE public.billing_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_guarantors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_agreements FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_guarantors FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_invoices FROM anon, authenticated;
REVOKE ALL ON TABLE public.billing_payments FROM anon, authenticated;

GRANT ALL ON TABLE public.billing_agreements TO service_role;
GRANT ALL ON TABLE public.billing_guarantors TO service_role;
GRANT ALL ON TABLE public.billing_invoices TO service_role;
GRANT ALL ON TABLE public.billing_payments TO service_role;
