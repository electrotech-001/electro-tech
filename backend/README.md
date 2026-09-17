# Electrotech backend

Standalone Express API for the Electrotech quote form and Solar Bill Analyzer.

## Commands

- Install: `npm install`
- Development: `npm run dev`
- Type check: `npm run typecheck`
- Build: `npm run build`
- Production start: `npm run start`
- Tests: `npm test`

The production process reads `PORT` and listens on `0.0.0.0`. The local fallback is port `3001`.

## Environment

Copy `.env.example` to an ignored local environment file or provide the values through the hosting platform. `FRONTEND_ORIGIN` is required when `NODE_ENV=production`; it must be the exact HTTPS origin of the Vercel frontend. The health endpoint and deterministic calculator do not require Gemini or Resend configuration.

Quote delivery requires `RESEND_API_KEY`, `QUOTE_TO_EMAIL`, and `QUOTE_FROM_EMAIL`. The recipient and sender are server-controlled; a validated visitor email is used only as `replyTo`. Verify the sender domain in Resend and ensure `QUOTE_FROM_EMAIL` uses that exact domain or verified subdomain. The backend waits for Resend to accept the request before returning success. Quote details are not written to a database, filesystem, queue, or application log.

The Solar Bill Analyzer extraction route requires the server-only `GEMINI_API_KEY` and a stable `GEMINI_MODEL` identifier (`gemini-3.6-flash`). Gemini extracts non-PII bill fields only; all sizing and recommendations run through deterministic application code. Uploaded bills are held in memory only and are discarded after the request. Bill files, extraction output, calculations, and quote details are not persisted.

Analyzer routes:

- `POST /api/solar-analyzer/extract`: one in-memory PDF/JPEG/PNG bill, maximum 10 MB.
- `POST /api/solar-analyzer/calculate`: verified non-PII consumption and location JSON.
- `POST /api/quote`: validates project details, delivers them to the configured Electrotech inbox through Resend, and returns an optional WhatsApp handoff. It stores nothing.

## Proxy handling

Belmo documents one regional edge load balancer between the client and the application container. Express therefore trusts exactly one proxy hop (`app.set("trust proxy", 1)`) before using `req.ip` for rate limiting. It does not trust arbitrary proxy chains.

The API uses process-local in-memory limits per IP: 3 bill extractions, 20 calculations, and 5 quote handoffs per 30 minutes. Counters reset whenever the application process restarts and are not shared across multiple instances. This is intentional for the current low-volume, storage-free architecture.
