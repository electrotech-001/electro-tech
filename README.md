# Electrotech

Electrotech is organized as a single repository with independently installable frontend and backend applications.

```text
frontend/  React/Vinext website for Vercel
backend/   Express/TypeScript API for independent Belmo deployment
```

The frontend includes `/solar-bill-analyzer` and a quote form, both of which use the standalone backend through `NEXT_PUBLIC_API_ORIGIN`. Gemini is limited to structured bill-data extraction; PV, inverter, battery, generation, and architecture recommendations are deterministic application calculations. Quote requests are delivered through Resend and retain a WhatsApp fallback. The application has no persistence layer: uploaded bills, extraction output, recommendations, and quote details are not stored.

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

See `frontend/README.md` for frontend environment and validation details.

## Backend

```bash
cd backend
npm ci
npm run typecheck
npm run build
npm test
npm start
```

See `backend/README.md` for backend environment, proxy and deployment details.

## Production backend environment

Belmo must provide `NODE_ENV`, its platform-injected `PORT`, the exact Vercel `FRONTEND_ORIGIN`, server-only `GEMINI_API_KEY` and `GEMINI_MODEL`, plus `RESEND_API_KEY`, `QUOTE_TO_EMAIL`, and `QUOTE_FROM_EMAIL`. The Resend sender must use a domain or subdomain verified in the Resend dashboard. No database or migration setup is required.
