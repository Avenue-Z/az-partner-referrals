# Rate Limiting for Referral Submissions — Design

**Date:** 2026-05-21
**Branch:** `feat/rate-limit-referrals`
**Author:** paul.ramirez@avenuez.com

## Problem

`POST /api/referrals` is the only path that writes to HubSpot, and it has no throttling. Any signed-in `@avenuez.com` user (or a compromised session) could flood HubSpot — burning through API quota and polluting CRM records — in a tight loop. Auth is the only barrier today.

## Goal

Cap the rate of referral submissions so a single bad actor cannot flood HubSpot, without degrading the experience for normal use.

## Non-goals

- Rate-limiting `/api/lookup` (read-only; called frequently by the live-match UI; throttling would break responsiveness).
- Protecting against anonymous internet traffic — auth already handles that.
- Building an admin UI for tuning limits.
- Per-route configurability — this design covers one endpoint.

## Scope

In: `POST /api/referrals` only.
Out: `/api/lookup`, `/api/partners`, auth routes.

## Threat model

The endpoint requires a valid `@avenuez.com` Google session. Realistic "bad actors":

1. An authenticated internal user running a script in a loop.
2. A compromised session being exploited externally.
3. A buggy client submitting in a loop unintentionally.

For (1) and (3), per-user limits suffice. For (2), an attacker with stolen session cookies could rotate IPs but is bounded by the per-user limit; we add per-IP as defense-in-depth in case multiple accounts are compromised behind one source.

## Limits

Sliding window, four limiters per request. All four are checked; the first to trip wins and returns its `retryAfter`.

| Limiter | Redis key pattern | Limit | Window |
|---|---|---|---|
| `userMinute` | `rl:user:<email>:m` | 10 | 60 s |
| `userHour`   | `rl:user:<email>:h` | 100 | 3600 s |
| `ipMinute`   | `rl:ip:<ip>:m`      | 30 | 60 s |
| `ipHour`     | `rl:ip:<ip>:h`      | 300 | 3600 s |

IP limits are ~3× user limits to accommodate multiple people behind one office NAT without breaking legitimate bursts.

## Architecture

### Stack

- `@upstash/ratelimit` — sliding-window algorithm, batteries-included.
- `@upstash/redis` — REST client (works in Node and Edge runtimes; safe with Vercel).
- Vercel KV — Upstash Redis under the hood; one-click integration in the Vercel dashboard.

### Components

**`lib/rate-limit.ts`** — new file. Single public function:

```ts
type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number; scope: 'user-minute' | 'user-hour' | 'ip-minute' | 'ip-hour' }

export async function checkReferralRateLimit(args: { email: string; ip: string }): Promise<RateLimitResult>
```

Internally constructs the four limiters once at module load (Upstash limiters are cheap), runs them in parallel against Redis, and returns the most-restrictive failure. On Redis error, logs and returns `{ ok: true }` (fail-open — see below).

**`app/api/referrals/route.ts`** — edit. Add the check between the `auth()` call and JSON parsing:

```ts
const session = await auth()
if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const ip = extractIp(req)
const rl = await checkReferralRateLimit({ email: session.user.email, ip })
if (!rl.ok) {
  return NextResponse.json(
    { error: 'Too many requests', retryAfter: rl.retryAfter, scope: rl.scope },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
  )
}
```

`extractIp` lives in the same `lib/rate-limit.ts` file. Reads `x-forwarded-for` (first IP), falls back to `x-real-ip`, falls back to the literal string `"unknown"` (so unknown-IP traffic shares one bucket — no free pass).

**`components/referral-form.tsx`** — edit the submit handler. On a 429 response, read `retryAfter` from the JSON body, set an error message of the form `"You're submitting too quickly. Try again in N seconds."`, and disable the submit button with a countdown that re-enables when it hits 0.

### Why not Next.js middleware?

The existing `middleware.ts` does auth-redirects only. Putting the limiter in middleware would centralize it but obscure the behavior — anyone reading `app/api/referrals/route.ts` would have to know about a middleware side-effect. For a single-endpoint guard, an inline check next to the auth check is more legible. If we later add rate-limiting to other write endpoints, the helper is already factored to be reused.

### Why `Promise.all` is safe here

CLAUDE.md forbids `Promise.all` for HubSpot calls because of HubSpot rate limits. The four limiter checks hit Redis (KV), not HubSpot, so parallelizing is fine and shaves latency.

## Configuration

Two new env vars (set automatically by the Vercel KV integration):

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Documented in `.env.local.example`. For local dev without KV, the helper detects missing env vars at module load and disables itself (logs a warning, every call returns `{ ok: true }`). This keeps `npm run dev` working without KV provisioned, while still being safe in production where the vars are set.

## Failure handling

**Fail-open on Redis error.** If `KV` is unreachable or returns an error, log it and let the request through. Rationale:

- This is an internal tool. Blocking the sales team from filing referrals during a Redis outage is worse than letting a flood of requests through during the same window — the auth gate is still the primary defense.
- The blast radius of a Redis outage > the blast radius of an unthrottled internal user during the same outage.

## UI behavior

On 429:

1. Parse `{ retryAfter, scope }` from response body.
2. Display in the form's existing error slot: `"You're submitting too quickly. Try again in N seconds."`
3. Disable submit button. Tick a local countdown timer (1s interval). When timer hits 0, clear the error and re-enable the button.
4. The `scope` field is logged in the browser console for debugging but not surfaced to the user — they don't need to know whether it was the minute or hour bucket that tripped.

## Testing

- **Unit test** `lib/rate-limit.ts` with a mocked Upstash client: feed 10 successful results then 1 failure for the minute bucket; assert the result is `{ ok: false, scope: 'user-minute', retryAfter: <positive number> }`.
- **Unit test** `extractIp`: assert it handles `x-forwarded-for: "1.2.3.4, 5.6.7.8"` → `"1.2.3.4"`, missing header → `"unknown"`.
- **Manual smoke test** in `npm run dev` with KV connected: submit 11 referrals rapidly, confirm 11th returns 429 with `Retry-After`, confirm UI countdown works.

## Rollout

1. Provision Vercel KV via the Vercel dashboard (one-click). Env vars populate automatically in preview + production environments.
2. Merge the PR; Vercel auto-deploys.
3. Monitor Vercel logs for `[rate-limit]` warnings during the first day in case the fail-open path fires unexpectedly.

## Open questions

None — all design decisions confirmed during brainstorming.

## Out of scope (could revisit later)

- Per-IP rate-limiting on `/api/lookup` with a much looser ceiling (~120/min/user).
- Surfacing rate-limit events to a monitoring dashboard.
- Admin override / allowlist for trusted automation.
