-- Official Billing CMS WhatsApp session.
-- The Baileys credentials and Signal keys never leave the API process.
-- Browser roles have no access; the Express service role is the only reader and writer.

CREATE TABLE IF NOT EXISTS public.whatsapp_auth (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.whatsapp_auth IS
    'Baileys authentication state for the Electro Tech official WhatsApp number.';

CREATE TABLE IF NOT EXISTS public.whatsapp_connection (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'disconnected',
    phone TEXT,
    push_name TEXT,
    connected_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT whatsapp_connection_id_check CHECK (id = 'official'),
    CONSTRAINT whatsapp_connection_status_check CHECK (
        status IN ('disconnected', 'connecting', 'qr', 'connected')
    ),
    CONSTRAINT whatsapp_connection_phone_check CHECK (
        phone IS NULL OR phone ~ '^[0-9]{8,15}$'
    )
);

COMMENT ON TABLE public.whatsapp_connection IS
    'Latest official WhatsApp link status. Session secrets stay in whatsapp_auth.';

INSERT INTO public.whatsapp_connection (id, status)
VALUES ('official', 'disconnected')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connection ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_auth FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_connection FROM anon, authenticated;

GRANT ALL ON TABLE public.whatsapp_auth TO service_role;
GRANT ALL ON TABLE public.whatsapp_connection TO service_role;
