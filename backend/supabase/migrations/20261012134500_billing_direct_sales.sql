-- Daily-sale invoices are stored as projects without a quotation, and stay off Projects in Process.

ALTER TABLE public.billing_projects
    ALTER COLUMN source_quotation_id DROP NOT NULL;

ALTER TABLE public.billing_projects
    ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'project';

ALTER TABLE public.billing_projects
    DROP CONSTRAINT IF EXISTS billing_projects_origin_check;

ALTER TABLE public.billing_projects
    ADD CONSTRAINT billing_projects_origin_check CHECK (origin IN ('project', 'direct_sale'));
