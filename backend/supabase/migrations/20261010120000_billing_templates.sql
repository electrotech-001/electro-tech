-- Editable WhatsApp messages. The API uses the service role.

CREATE TABLE IF NOT EXISTS public.billing_message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
    kind TEXT NOT NULL CHECK (kind IN ('reminder', 'thank_you', 'feedback', 'custom')),
    body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_message_templates_builtin_kind
    ON public.billing_message_templates (kind)
    WHERE kind <> 'custom';

ALTER TABLE public.billing_message_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_message_templates FROM anon, authenticated;
GRANT ALL ON TABLE public.billing_message_templates TO service_role;
