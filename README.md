# Avenue Z — Partner Referrals

Internal web app for the Avenue Z sales team to attribute leads to Tier 1 partners in HubSpot.

## What it does

- Looks up an email address against HubSpot contacts in real time
- Resolves the contact's associated company (if any) and both records' owners
- Lets the submitter select one or more Tier 1 partners from a categorized picker
- Writes a `referred_to_partner = Yes` flag + partner name(s) to the HubSpot company record
- Associates the lead company with each selected partner via the custom `Partners` object (object type `2-17260992`, portal `308777`)
- Shows a live log of recent referrals

Access is restricted to `@avenuez.com` Google accounts.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | Auth.js v5 (NextAuth) + Google OAuth |
| UI | shadcn/ui (new-york), Tailwind v4, base-ui |
| HubSpot | `@hubspot/api-client` v12 (Service Key) |
| Deploy | Vercel |

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/Avenue-Z/az-partner-referrals.git
cd az-partner-referrals
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in all four values — see [Environment variables](#environment-variables) below.

### 3. Run

```bash
npm run dev        # starts on http://localhost:3002
```

> The app redirects to `/login` immediately. You must complete the Google OAuth flow with an `@avenuez.com` account before anything else loads.

---

## Environment variables

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Random secret for session encryption — run `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | OAuth 2.0 Client ID from Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot Service Key (see below) |
| `NEXTAUTH_URL` | Full base URL of the app (e.g. `http://localhost:3002`) |

### Google OAuth setup

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add Authorized Redirect URIs:
   - Local: `http://localhost:3002/api/auth/callback/google`
   - Production: `https://<your-vercel-url>/api/auth/callback/google`

### HubSpot Service Key setup

1. In HubSpot: **Settings → Integrations → Service Keys → Create service key**
2. Add these **7 scopes** (no more, no less):

```
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.companies.read
crm.objects.companies.write
crm.objects.owners.read
crm.objects.custom.read
crm.objects.custom.write
```

> **Important:** There is no `crm.objects.associations.write` scope — it does not exist in HubSpot. Associations are covered by the object write scopes above. Adding a non-existent scope will silently fail and the key will work, but keep the list clean.

---

## Project structure

```
app/
  api/
    auth/[...nextauth]/   Auth.js catch-all handler
    lookup/               GET — live contact/company lookup by email or domain
    partners/             GET — fetch all Tier 1 partners (used by client if needed)
    referrals/            POST — write referral to HubSpot
  referrals/              Main app page (server component)
  login/                  Google sign-in page
  unauthorized/           Shown when non-@avenuez.com account tries to sign in

components/
  partner-picker.tsx      Accordion-based multi-select partner UI
  referral-form.tsx       Progressive lead info form (client component)
  referral-log.tsx        Recent referrals table
  ui/                     shadcn/ui primitives (do not edit directly)

lib/
  hubspot/client.ts       All HubSpot API logic — types, fetch, write

auth.ts                   Auth.js config (Google provider, domain restriction)
middleware.ts             Protects all /referrals and /api routes
```

---

## HubSpot data model

| Object | ID | Notes |
|---|---|---|
| Partners (custom) | `2-17260992` | Tier 1 filter: `tier = "tier_1"` (enum, not "Tier 1") |
| HubSpot portal | `308777` | Avenue Z portal |

**Key properties on the Partners custom object:**

| Property | Type | Notes |
|---|---|---|
| `partner_name` | string | Display name (not `name`) |
| `tier` | enum | `tier_1` / `tier_2` |
| `company_type` | enum | 7 values — drives picker categories |
| `service_offered` | string | Optional description |

**Properties written to Company records on referral:**

| Property | Value |
|---|---|
| `referred_to_partner` | `"Yes"` |
| `referred_to` | Comma-separated partner names |
| `referral_process` | Notes from submitter |

---

## Deployment (Vercel)

1. Push to `main` — Vercel auto-deploys
2. Set all 5 env vars in **Vercel → Project → Settings → Environment Variables**
3. Update your Google OAuth redirect URI to the production Vercel URL

---

## Development notes

- **`lib/hubspot/client.ts`** is the only file that talks to HubSpot. All API calls go through here.
- HubSpot API calls are **sequential** (no `Promise.all`) to respect rate limits.
- New contacts/companies are always assigned to the submitter's HubSpot owner. Existing records only have their owner changed when the user clicks "Assign to me" in the form.
- The form uses a progressive disclosure pattern — fields appear as the email lookup resolves.
- TypeScript strict mode is on. Run `npx tsc --noEmit` before pushing.
