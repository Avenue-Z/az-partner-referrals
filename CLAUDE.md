@AGENTS.md

# az-partner-referrals — Codebase context for AI assistants

## Critical HubSpot IDs (never guess these)

| Thing | Value |
|---|---|
| Portal ID | `308777` |
| Partners custom object type | `2-17260992` |
| Tier 1 filter value | `tier_1` (enum — NOT "Tier 1") |
| Partner name property | `partner_name` (NOT `name`) |
| Contact → Company association type | `279` (HUBSPOT_DEFINED) |
| Company → Partner association category | `USER_DEFINED`, type `1` |

## Architecture

**Data layer** — everything HubSpot lives in `lib/hubspot/client.ts`. Do not add HubSpot calls anywhere else.

**Auth** — `auth.ts` + `middleware.ts`. The middleware protects all `/referrals/*` and `/api/*` routes. API route handlers also call `auth()` directly as a second check.

**Form flow** — `components/referral-form.tsx` is a client component that drives progressive disclosure based on email lookup state. It calls `/api/lookup` for live matching and `/api/referrals` to submit.

## Key patterns

### HubSpot API calls are sequential, not parallel
```ts
// ✅ correct
const contact = await createContact(...)
const company = await createCompany(...)

// ❌ wrong — risks rate limit errors
const [contact, company] = await Promise.all([createContact(...), createCompany(...)])
```

### Custom object search (not companies search)
```ts
// ✅ Partners are a custom object
hs.crm.objects.searchApi.doSearch('2-17260992', { ... })

// ❌ wrong — partners are not standard Company records
hs.crm.companies.searchApi.doSearch({ ... })
```

### Associations v4 (not v3)
```ts
// ✅ correct
hs.crm.associations.v4.basicApi.create('contacts', contactId, 'companies', companyId, [...])

// ❌ wrong — v3 associations are deprecated
hs.crm.associations.basicApi.create(...)
```

### Reading contact associations
Use `contacts.basicApi.getById` with the `associations` parameter — it returns associations in the same call:
```ts
const contact = await hs.crm.contacts.basicApi.getById(
  contactId,
  ['firstname', 'lastname', 'hubspot_owner_id'],
  undefined,
  ['companies'],        // <-- fetches associated company IDs
)
const companyId = (contact.associations as any)?.companies?.results?.[0]?.id
```

### Owner lookup
`hs.crm.owners.ownersApi.getById(parseInt(ownerId, 10))` — first arg is a number, no other required args.

### Scope gotchas
- `crm.objects.associations.write` does NOT exist — don't add it
- Custom object access requires `crm.objects.custom.read` + `crm.objects.custom.write`
- v4 associations are covered by the standard object write scopes

## Owner assignment rules (important)

| Scenario | Owner behavior |
|---|---|
| New contact created | Assigned to submitter, else `HUBSPOT_DEFAULT_OWNER_EMAIL`, else unassigned |
| New company created | Assigned to submitter, else `HUBSPOT_DEFAULT_OWNER_EMAIL`, else unassigned |
| Existing contact updated | Owner unchanged UNLESS `reassignContactOwner: true` in payload |
| Existing company updated | Owner unchanged UNLESS `reassignCompanyOwner: true` in payload |

This is intentional — existing records already have AMs assigned. Don't overwrite silently.

Owner resolution lives in `resolveSubmitterOwnerId` in `lib/hubspot/client.ts`. It tries the Google submitter email first, then falls back to `HUBSPOT_DEFAULT_OWNER_EMAIL`. Each step that doesn't resolve emits a `console.warn`.

## Environment variables

See `.env.local.example`. All 5 vars are required; the app throws on startup if `HUBSPOT_ACCESS_TOKEN` is missing.

## TypeScript

Strict mode. Always run `npx tsc --noEmit` before committing. The HubSpot client types are loose in places — use `as any` sparingly and only at the boundary (e.g. `operator: 'EQ' as any`).

## shadcn/ui

Using new-york style, Tailwind v4, `@base-ui/react` (NOT `@radix-ui`). The accordion, for example, uses `data-open` / `data-closed` attributes — not `data-[state=open]`. Check `components/ui/*.tsx` before assuming Radix UI behavior.

## Design tokens

| Token | Value |
|---|---|
| Brand cyan | `#60FDFF` |
| Background | `#000000` |
| Card background | `#272727` |
| Input background | `#1a1a1a` |
| Muted text | `#8A8A8A` |
| Error red | `#FF4444` |
| Success green | `#60FF80` |
| New record amber | `#FFAB40` |
