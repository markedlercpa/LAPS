# LAPS — Sales Cycle Management

Internal web app for Edler Zain to run the sales cycle end-to-end:
**L**ead Generation → **A**ppointments → **P**roposals → **S**ales Closed,
with a unified activity audit trail, in-app email, and LAPS reporting.

Built to eventually **replace Ignition** — Phase 1 (this codebase) ships the
core app; e-sign, Stripe payments, and QBO invoicing land in later phases.

## Stack

- **Next.js** (App Router, TypeScript) + Server Actions
- **Postgres** via **Prisma**
- **Tailwind** + hand-rolled shadcn-style UI, **react-big-calendar**, **Recharts**
- **Auth.js (NextAuth)** with **Microsoft Entra ID** (M365) — one sign-in that
  also grants delegated **Graph** scopes for sending email and syncing calendars
  as the signed-in rep. A password-less **dev login** fallback is available locally.

## Features (Phase 1)

| Section | What it does |
| --- | --- |
| **Lead Generation** | Leads table (name, company, source, email, phone, created, owner, stage) + lead detail with a full **activity timeline** (emails, calls, texts, notes). Send email via M365 Graph; sync inbound replies into the timeline. |
| **Appointments** | Table + **calendar** view, status (booked/completed/no-show), **action items**, and one-click **M365 calendar sync**. |
| **Proposals** | Table of open proposals + editor with **line items** and internal **delivery-budget → estimated margin**. Status workflow drives the pipeline. |
| **Sales Closed** | Closed-won table + **delivery handoff** status + templated **onboarding checklist** (surprise gift, onboarding, activation, case study, Google review). |
| **Reporting** | Weekly / monthly / quarterly LAPS throughput, open pipeline by stage, and per-rep volume / close rate / avg sales cycle. |

## Getting started

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, Entra creds
npx prisma db push          # or: npx prisma migrate dev
npm run db:seed             # demo data
npm run dev                 # http://localhost:3000
```

### Auth

- **Production:** set the `AUTH_MICROSOFT_ENTRA_ID_*` vars from an Azure app
  registration with delegated scopes `Mail.Send`, `Mail.Read`, `Calendars.Read`,
  `User.Read`, `offline_access`. Reps click **Sign in with Microsoft 365**.
- **Local dev:** with `ALLOW_DEV_LOGIN="true"`, sign in as any seeded user
  (`mark@edlerzain.com`, `jordan@edlerzain.com`, `sam@edlerzain.com`) with no password.

When M365 is not configured the app runs in **offline mode**: email is logged to
the timeline (not actually sent) and calendar sync reports "not connected"
instead of failing.

## Roadmap

- **Phase 2** — proposal document rendering + native click-to-sign e-sign (audit trail).
- **Phase 3** — Stripe payment collection + payment schedules.
- **Phase 4** — QBO invoice generation.
