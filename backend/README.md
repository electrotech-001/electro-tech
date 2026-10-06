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

## Project reviews and completion dates

Apply `supabase/migrations/20261006090000_project_reviews_and_completion_dates.sql` after the existing migrations. It preserves projects, media, publication state and legacy completion years, and never invents completion dates. Tests apply the application migrations unchanged to an isolated PostgreSQL engine using PGlite with minimal Supabase platform schemas. Deployment and live migration application remain manual.

Public routes:

- `GET /api/projects/:projectId/reviews?page=1`: 20 visible reviews, newest first, plus `reviewCount`, `averageRating` and `hasMore`. Totals include all visible reviews.
- `POST /api/projects/:projectId/reviews`: `{ reviewerName, rating, reviewText }`; immediately visible on a published project. Names are trimmed and limited to 80 characters, ratings are integers 1–5, and trimmed review text is limited to 10–1000 characters. Unknown fields and unsupported control characters are rejected.

Admin routes use the existing `authenticateAdmin` middleware:

- `GET /api/admin/projects/:projectId/reviews?page=1`: 20 reviews including hidden reviews, plus `hasMore`.
- `PATCH /api/admin/project-reviews/:reviewId`: `{ isVisible: boolean }`.
- `DELETE /api/admin/project-reviews/:reviewId`: permanent deletion; the Admin UI requires confirmation.

Public submissions are limited to 5 attempts per IP per 30 minutes, including invalid requests and retries. Like the existing limits, counters are process-local and reset on restart. PostgreSQL serializes submissions per project and treats identical name/rating/text submitted within 10 minutes as retries. A visible duplicate returns the existing review with HTTP 200; a hidden duplicate returns HTTP 409 without exposing its content. No IP address is persisted. Bodies are capped at 8 KB. Browser table/RPC access is revoked; only the server role can access reviews.

Project create/update payloads accept nullable `completionDate` as a real `YYYY-MM-DD` calendar date. New drafts may omit the date, but publication requires it. Existing year-only projects retain legacy publication eligibility until a real date is entered; once supplied, an exact date is required for subsequent publication. The internal `completion_date_required` flag preserves this distinction without inferring dates. `completionYear` remains a legacy API field during the transition.
