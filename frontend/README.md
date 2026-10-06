# Electro Tech one-page website

Production-oriented one-page lead-generation site for Electro Tech — Electrical & Solar Solutions. It includes an accessible mobile menu, interactive solar-system flow, solar starting-point prefill, no-storage email quote delivery with a WhatsApp fallback, SEO metadata and structured data.

## Requirements

- Node.js 22.13 or newer
- npm
- The standalone backend for bill extraction, calculations, and quote validation

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and add the required values.
3. Run the backend locally on port `3001`.
4. Run `npm run dev`.

## Environment variables

- `NEXT_PUBLIC_SITE_URL`: canonical production URL.
- `NEXT_PUBLIC_API_ORIGIN`: public origin of the standalone Belmo API, without a trailing slash. API requests fall back to `http://localhost:3001` only outside production. Changing this Vercel build variable requires a new frontend deployment.

## Validation and tests

- `npm run lint` checks TypeScript/React quality rules.
- `npm test` runs a production build and server-rendered HTML/security checks.
- `npm run build` creates the Nitro/Vercel production output in `.output`.

## Enquiries and security

The quote form sends project details to the standalone API configured by `NEXT_PUBLIC_API_ORIGIN`. The backend validates each payload with Zod, normalizes phone and email values, rejects a honeypot field, enforces input and rate limits, and delivers the request to Electrotech through Resend. Success is shown only after the provider accepts the email. No quote is stored; WhatsApp remains available as a secondary action and failure fallback.

The dedicated `/solar-bill-analyzer` route calls the standalone backend configured by `NEXT_PUBLIC_API_ORIGIN`. Bill bytes are processed in memory and are not stored by Electrotech; only non-PII verified consumption and location are sent to the deterministic calculation endpoint.

## Content updates

Business details, services, projects and technology names live in `lib/site-config.ts`. Replace representative project photos in `public/images` once verified Electro Tech photography is available; keep dimensions and descriptive alt text. Source/license records are in `docs/image-sources.md`.

## Frontend deployment

- Project root: `frontend`
- Node runtime: 22+
- Build command: `npm run build`
- Add frontend production environment variables in the frontend hosting platform.
- Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS domain and `NEXT_PUBLIC_API_ORIGIN` to the Belmo API origin, then verify `/`, `/robots.txt`, `/sitemap.xml`, the analyzer, and one quote handoff.
- Roll back by redeploying the prior successful build.

The included Sites/vinext runtime also supports Cloudflare-compatible previews and publishing.

## Project reviews and exact completion dates

The `/projects` detail modal loads visible reviews and their summary through Express. It provides paginated cards, a keyboard-operable native radio star control and an anonymous review form. Submission refreshes the first page and resets the form. Admin project editing includes visibility controls and confirmed permanent deletion through authenticated Express endpoints.

Admin forms use a date input, persist `completionDate` in draft storage and leave unknown legacy dates blank. Public cards, the modal, Admin Preview and Admin lists share one UTC date-only formatter; exact dates display as `15 September 2026`, with year-only fallback when needed.

For isolated responsive QA without writes to a live API, run `npx vite --config tests/qa/vite.config.ts` and open `http://127.0.0.1:5174`. This harness uses explicit QA fixtures and actual components/CSS; it is separate from the production build. Evidence and the implementation report are in `../docs/qa` and `../docs/project-reviews-completion-dates.md`.
