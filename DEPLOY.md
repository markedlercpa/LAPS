# Deploying a shared LAPS test environment (Vercel + Neon)

This gets you a real URL your team can log into. ~5 minutes. Free tiers are fine.

## 1. Create a Postgres database (Neon)

1. Go to <https://neon.tech> → sign up → **New Project**.
2. After it's created, open **Connect** and copy the **Direct connection** string
   (the host **without** `-pooler` in it). It looks like:
   `postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
   > Use the *direct* string, not the pooled one — Prisma migrations need a direct connection.

## 2. Import the repo into Vercel

1. Go to <https://vercel.com> → sign up / log in (use "Continue with GitHub").
2. **Add New… → Project** → import the **LAPS** repo.
3. On the import screen, set **Production Branch** (Settings → Git) to
   `claude/laps-sales-cycle-saas-2twnnv`, or merge that branch to `main` first.
4. Framework preset auto-detects **Next.js**. Leave build settings as-is — the
   repo's build command already runs `prisma migrate deploy` before `next build`.

## 3. Set environment variables (Vercel → Settings → Environment Variables)

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the Neon **direct** connection string from step 1 |
| `AUTH_SECRET` | run `openssl rand -base64 32` and paste the result |
| `ALLOW_DEV_LOGIN` | `true` |

> Keep these in Vercel only — don't commit them. `AUTH_SECRET` can be any random
> 32-byte value; it just signs sessions.

## 4. Deploy

Click **Deploy**. The build will apply the database migration and build the app.
You'll get a URL like `https://laps-xxxx.vercel.app`.

## 5. Load demo data (one time)

From your own machine, seed the Neon database so there's something to look at:

```bash
git clone <the LAPS repo> && cd LAPS
git checkout claude/laps-sales-cycle-saas-2twnnv
npm install
DATABASE_URL="<your Neon direct string>" npm run db:seed
```

(Or skip this and just create your first lead in the UI.)

## 6. Log in

Open `https://<your-app>.vercel.app/signin` and use the **Dev Login** box — no
password. Seeded users:

- `mark@edlerzain.com` (Admin)
- `jordan@edlerzain.com` (Rep)
- `sam@edlerzain.com` (Rep)

## ⚠️ Security note

`ALLOW_DEV_LOGIN=true` lets anyone with the URL sign in as any seeded user with
**no password** — fine for a private test link, not for real data. Before this
holds anything sensitive, either:

- set `ALLOW_DEV_LOGIN=false` and switch to Microsoft 365 sign-in (below), or
- keep the Vercel deployment behind Vercel's password protection / SSO.

## Optional — enable Microsoft 365 sign-in (real email + calendar)

1. In **Azure Portal → App registrations → New registration**.
2. Redirect URI (Web): `https://<your-app>.vercel.app/api/auth/callback/microsoft-entra-id`
3. **API permissions** → Microsoft Graph → *Delegated*: `Mail.Send`, `Mail.Read`,
   `Calendars.Read`, `User.Read`, `offline_access` → grant admin consent.
4. **Certificates & secrets** → new client secret.
5. Add these env vars in Vercel and redeploy:

| Name | Value |
| --- | --- |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | the client secret value |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |

The **Sign in with Microsoft 365** button then works, and email send + calendar
sync go live.
