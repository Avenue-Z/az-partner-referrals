# Rate Limit Referral Submissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap `POST /api/referrals` so a single bad actor (compromised session or runaway script) cannot flood HubSpot, using per-user (10/min, 100/hr) and per-IP (30/min, 300/hr) sliding-window limits backed by Vercel KV.

**Architecture:** New `lib/rate-limit.ts` helper exposes one async function that runs four Upstash `Ratelimit` sliding-window limiters in parallel against Vercel KV and returns the most-restrictive failure. The handler in `app/api/referrals/route.ts` calls it right after `auth()` and returns 429 + `Retry-After` on failure. The client reads the response and shows a countdown.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `@upstash/ratelimit`, `@upstash/redis`, Vitest for unit tests.

**Spec:** [docs/superpowers/specs/2026-05-21-rate-limit-referrals-design.md](../specs/2026-05-21-rate-limit-referrals-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/rate-limit.ts` | new | `checkReferralRateLimit({ email, ip })` + `extractIp(req)` |
| `lib/rate-limit.test.ts` | new | Vitest unit tests with a mocked Upstash client |
| `vitest.config.ts` | new | Vitest config (Node env, path alias) |
| `app/api/referrals/route.ts` | modify | Call the limiter after `auth()`, return 429 |
| `components/referral-form.tsx` | modify | Handle 429 response, show countdown |
| `.env.local.example` | modify | Document `KV_REST_API_URL`, `KV_REST_API_TOKEN` |
| `README.md` | modify | Add "Rate limiting" section |
| `package.json` | modify | Add deps + `test` script |

---

## Task 1: Install dependencies and set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime + dev deps**

Run from repo root:

```bash
npm install @upstash/ratelimit @upstash/redis
npm install -D vitest @vitest/ui
```

Expected: `package.json` updated, lockfile regenerated, no errors.

- [ ] **Step 2: Add a `test` script to `package.json`**

Edit `package.json` so the `scripts` block reads:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

- [ ] **Step 4: Verify Vitest runs with zero tests**

Run: `npm test`
Expected: `No test files found` (exit 1) — that's fine; Vitest is installed correctly. We'll add a real test next.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add @upstash/ratelimit + vitest"
```

---

## Task 2: `extractIp` helper (TDD)

**Files:**
- Create: `lib/rate-limit.ts`
- Create: `lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/rate-limit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractIp } from './rate-limit'

function reqWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/referrals', { method: 'POST', headers })
}

describe('extractIp', () => {
  it('returns the first IP from x-forwarded-for', () => {
    const req = reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(extractIp(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = reqWith({ 'x-real-ip': '9.9.9.9' })
    expect(extractIp(req)).toBe('9.9.9.9')
  })

  it('returns "unknown" when no IP headers are present', () => {
    const req = reqWith({})
    expect(extractIp(req)).toBe('unknown')
  })

  it('trims whitespace from the forwarded IP', () => {
    const req = reqWith({ 'x-forwarded-for': '   7.7.7.7   , 8.8.8.8' })
    expect(extractIp(req)).toBe('7.7.7.7')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/rate-limit.test.ts`
Expected: FAIL — `Cannot find module './rate-limit'` (or similar import error).

- [ ] **Step 3: Implement `extractIp` (minimal)**

Create `lib/rate-limit.ts`:

```ts
export function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/rate-limit.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts lib/rate-limit.test.ts
git commit -m "feat(rate-limit): add extractIp helper"
```

---

## Task 3: `checkReferralRateLimit` — four limiters, fail-open (TDD)

**Files:**
- Modify: `lib/rate-limit.ts`
- Modify: `lib/rate-limit.test.ts`

This task implements the core. We use **dependency injection** for the limiter factory so tests don't need a real Redis. Production code constructs limiters from `@upstash/ratelimit` + `@upstash/redis`; tests inject a fake.

- [ ] **Step 1: Write the failing tests**

Append to `lib/rate-limit.test.ts`:

```ts
import { vi } from 'vitest'
import { checkReferralRateLimit, __setLimitersForTest, __resetLimitersForTest } from './rate-limit'

type FakeResult = { success: boolean; reset: number }

function fakeLimiter(results: FakeResult[]) {
  let i = 0
  return {
    limit: vi.fn(async () => {
      const r = results[i] ?? results[results.length - 1]
      i += 1
      return r
    }),
  }
}

describe('checkReferralRateLimit', () => {
  afterEach(() => {
    __resetLimitersForTest()
  })

  it('returns ok when all four limiters succeed', async () => {
    const ok: FakeResult = { success: true, reset: Date.now() + 60_000 }
    __setLimitersForTest({
      userMinute: fakeLimiter([ok]),
      userHour:   fakeLimiter([ok]),
      ipMinute:   fakeLimiter([ok]),
      ipHour:     fakeLimiter([ok]),
    })

    const result = await checkReferralRateLimit({ email: 'a@avenuez.com', ip: '1.2.3.4' })
    expect(result).toEqual({ ok: true })
  })

  it('returns the user-minute failure with a positive retryAfter', async () => {
    const reset = Date.now() + 30_000
    const ok: FakeResult = { success: true, reset: Date.now() + 60_000 }
    __setLimitersForTest({
      userMinute: fakeLimiter([{ success: false, reset }]),
      userHour:   fakeLimiter([ok]),
      ipMinute:   fakeLimiter([ok]),
      ipHour:     fakeLimiter([ok]),
    })

    const result = await checkReferralRateLimit({ email: 'a@avenuez.com', ip: '1.2.3.4' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.scope).toBe('user-minute')
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(result.retryAfter).toBeLessThanOrEqual(30)
  })

  it('picks the smallest retryAfter when multiple limiters fail', async () => {
    const now = Date.now()
    __setLimitersForTest({
      userMinute: fakeLimiter([{ success: false, reset: now + 20_000 }]),
      userHour:   fakeLimiter([{ success: false, reset: now + 600_000 }]),
      ipMinute:   fakeLimiter([{ success: false, reset: now + 10_000 }]),
      ipHour:     fakeLimiter([{ success: false, reset: now + 300_000 }]),
    })

    const result = await checkReferralRateLimit({ email: 'a@avenuez.com', ip: '1.2.3.4' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.scope).toBe('ip-minute')
    expect(result.retryAfter).toBeLessThanOrEqual(10)
  })

  it('fails open when a limiter throws (Redis outage)', async () => {
    __setLimitersForTest({
      userMinute: { limit: vi.fn(async () => { throw new Error('Redis down') }) },
      userHour:   fakeLimiter([{ success: true, reset: Date.now() + 60_000 }]),
      ipMinute:   fakeLimiter([{ success: true, reset: Date.now() + 60_000 }]),
      ipHour:     fakeLimiter([{ success: true, reset: Date.now() + 60_000 }]),
    })

    const result = await checkReferralRateLimit({ email: 'a@avenuez.com', ip: '1.2.3.4' })
    expect(result).toEqual({ ok: true })
  })

  it('returns ok when limiters are not configured (no KV env vars in dev)', async () => {
    __setLimitersForTest(null)
    const result = await checkReferralRateLimit({ email: 'a@avenuez.com', ip: '1.2.3.4' })
    expect(result).toEqual({ ok: true })
  })
})
```

Also add the `afterEach` import to the existing imports at the top:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/rate-limit.test.ts`
Expected: FAIL — `checkReferralRateLimit` / `__setLimitersForTest` are not exported.

- [ ] **Step 3: Implement the limiter logic**

Replace the contents of `lib/rate-limit.ts` with:

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

type LimiterScope = 'user-minute' | 'user-hour' | 'ip-minute' | 'ip-hour'

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number; scope: LimiterScope }

type Limiter = { limit: (key: string) => Promise<{ success: boolean; reset: number }> }

type LimiterSet = {
  userMinute: Limiter
  userHour:   Limiter
  ipMinute:   Limiter
  ipHour:     Limiter
}

let cachedLimiters: LimiterSet | null | undefined = undefined
let testOverride: LimiterSet | null | undefined = undefined

function buildLimiters(): LimiterSet | null {
  const url   = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    console.warn('[rate-limit] KV env vars not set — rate limiting disabled (dev mode)')
    return null
  }

  const redis = new Redis({ url, token })
  return {
    userMinute: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10,  '60 s'),    prefix: 'rl:user:m' }),
    userHour:   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '3600 s'),  prefix: 'rl:user:h' }),
    ipMinute:   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30,  '60 s'),    prefix: 'rl:ip:m'   }),
    ipHour:     new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(300, '3600 s'),  prefix: 'rl:ip:h'   }),
  }
}

function getLimiters(): LimiterSet | null {
  if (testOverride !== undefined) return testOverride
  if (cachedLimiters === undefined) cachedLimiters = buildLimiters()
  return cachedLimiters
}

export function __setLimitersForTest(limiters: LimiterSet | null) {
  testOverride = limiters
}

export function __resetLimitersForTest() {
  testOverride = undefined
}

async function runLimiter(
  limiter: Limiter,
  key: string,
  scope: LimiterScope,
): Promise<{ ok: true } | { ok: false; retryAfter: number; scope: LimiterScope }> {
  try {
    const { success, reset } = await limiter.limit(key)
    if (success) return { ok: true }
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
    return { ok: false, retryAfter, scope }
  } catch (err) {
    console.error(`[rate-limit] ${scope} check failed, failing open:`, err)
    return { ok: true }
  }
}

export async function checkReferralRateLimit(args: { email: string; ip: string }): Promise<RateLimitResult> {
  const limiters = getLimiters()
  if (!limiters) return { ok: true }

  const results = await Promise.all([
    runLimiter(limiters.userMinute, args.email, 'user-minute'),
    runLimiter(limiters.userHour,   args.email, 'user-hour'),
    runLimiter(limiters.ipMinute,   args.ip,    'ip-minute'),
    runLimiter(limiters.ipHour,     args.ip,    'ip-hour'),
  ])

  const failures = results.filter((r): r is { ok: false; retryAfter: number; scope: LimiterScope } => !r.ok)
  if (failures.length === 0) return { ok: true }

  return failures.reduce((min, cur) => (cur.retryAfter < min.retryAfter ? cur : min))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/rate-limit.test.ts`
Expected: PASS, 9 tests (4 from extractIp + 5 from checkReferralRateLimit).

- [ ] **Step 5: Run the TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/rate-limit.ts lib/rate-limit.test.ts
git commit -m "feat(rate-limit): add checkReferralRateLimit with four limiters"
```

---

## Task 4: Wire the limiter into `POST /api/referrals`

**Files:**
- Modify: `app/api/referrals/route.ts`

- [ ] **Step 1: Update the route handler**

Replace `app/api/referrals/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logReferral } from '@/lib/hubspot/client'
import { checkReferralRateLimit, extractIp } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkReferralRateLimit({
    email: session.user.email,
    ip:    extractIp(req),
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: rl.retryAfter, scope: rl.scope },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    firstName, lastName, email,
    companyName, companyDomain,
    partnerIds, partnerNames,
    existingContactId, existingCompanyId,
    reassignContactOwner, reassignCompanyOwner,
    notes,
  } = body as Record<string, unknown>

  if (
    typeof firstName !== 'string' || !firstName ||
    typeof lastName  !== 'string' || !lastName  ||
    typeof email     !== 'string' || !email     ||
    typeof companyName !== 'string' || !companyName ||
    !Array.isArray(partnerIds)   || partnerIds.length   === 0 ||
    !Array.isArray(partnerNames) || partnerNames.length === 0
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await logReferral({
      firstName,
      lastName,
      email,
      companyName,
      companyDomain:        typeof companyDomain        === 'string'  ? companyDomain        : undefined,
      existingContactId:    typeof existingContactId    === 'string'  ? existingContactId    : undefined,
      existingCompanyId:    typeof existingCompanyId    === 'string'  ? existingCompanyId    : undefined,
      reassignContactOwner: reassignContactOwner === true,
      reassignCompanyOwner: reassignCompanyOwner === true,
      partnerIds:   partnerIds   as string[],
      partnerNames: partnerNames as string[],
      notes: typeof notes === 'string' ? notes : undefined,
      submitterEmail: session.user.email,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/referrals]', err)
    return NextResponse.json({ error: 'Failed to log referral' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: 9 passing tests.

- [ ] **Step 4: Commit**

```bash
git add app/api/referrals/route.ts
git commit -m "feat(api): rate-limit POST /api/referrals"
```

---

## Task 5: Surface the 429 in the referral form

**Files:**
- Modify: `components/referral-form.tsx`

The form currently throws a generic "Something went wrong" on any non-2xx. We need to:
1. Detect 429 specifically and read `retryAfter` from the JSON body.
2. Show a friendly inline message.
3. Disable the submit button with a countdown timer that auto-clears.

- [ ] **Step 1: Add the countdown state**

In `components/referral-form.tsx`, add a new state variable next to `submitState` and `errorMsg` (around line 53):

```tsx
const [retrySeconds, setRetrySeconds] = useState(0)
```

Add a `useEffect` import at the top — change line 3 from:

```tsx
import { useState, useCallback, useRef } from 'react'
```

to:

```tsx
import { useState, useCallback, useRef, useEffect } from 'react'
```

- [ ] **Step 2: Add the countdown effect**

Insert this block right after the `// ── Submit state ──` section (right after line 53, after the new `retrySeconds` state):

```tsx
// ── Rate-limit countdown ──────────────────────────────────────────────────────
useEffect(() => {
  if (retrySeconds <= 0) return
  const id = setInterval(() => {
    setRetrySeconds((s) => {
      if (s <= 1) {
        clearInterval(id)
        setSubmitState('idle')
        setErrorMsg('')
        return 0
      }
      return s - 1
    })
  }, 1000)
  return () => clearInterval(id)
}, [retrySeconds])
```

- [ ] **Step 3: Handle 429 in the submit flow**

Replace the existing error-handling section of `handleSubmit` (the `if (!res.ok)` block, currently lines 189-192) with:

```tsx
if (!res.ok) {
  if (res.status === 429) {
    const data = await res.json().catch(() => ({})) as { retryAfter?: number; scope?: string }
    const seconds = typeof data.retryAfter === 'number' && data.retryAfter > 0 ? data.retryAfter : 60
    if (data.scope) console.warn('[rate-limit] tripped scope:', data.scope)
    setRetrySeconds(seconds)
    setSubmitState('error')
    setErrorMsg(`You're submitting too quickly. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`)
    return
  }
  const data = await res.json().catch(() => ({})) as Record<string, string>
  throw new Error(data.error ?? 'Something went wrong')
}
```

- [ ] **Step 4: Disable submit while the countdown is active**

The existing `Button` block (currently around line 509) sets `disabled={submitState === 'loading' || !canSubmit}`. Change it to also block on the countdown:

```tsx
<Button
  type="submit"
  disabled={submitState === 'loading' || retrySeconds > 0 || !canSubmit}
  className="w-full bg-[#60FDFF] text-black font-bold hover:bg-[#60FDFF]/90 disabled:opacity-40"
>
```

Inside the button label, swap the current ternary for a three-state version so the countdown shows in the button when active:

```tsx
{submitState === 'loading' ? (
  <><Loader2 className="size-4 mr-2 animate-spin" /> Logging Referral…</>
) : retrySeconds > 0 ? (
  `Try again in ${retrySeconds}s`
) : (
  'Log Referral'
)}
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Manual smoke test against the dev server**

Provision a Vercel KV store (or set `KV_REST_API_URL` + `KV_REST_API_TOKEN` to a free Upstash Redis instance) in `.env.local`, then:

```bash
npm run dev
```

Open `http://localhost:3002`, log in, and submit referrals rapidly. After the 10th submission within a minute, the 11th should show:
- A red error: `"You're submitting too quickly. Try again in N seconds."`
- The submit button labeled `"Try again in Ns"` and disabled.
- The button re-enables when the countdown hits 0.

Also test without KV env vars (dev-mode disabled rate limiter): submissions succeed normally, and the server logs `[rate-limit] KV env vars not set — rate limiting disabled (dev mode)` once at module load.

- [ ] **Step 7: Commit**

```bash
git add components/referral-form.tsx
git commit -m "feat(form): show rate-limit countdown on 429"
```

---

## Task 6: Update env example and README

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`

- [ ] **Step 1: Update `.env.local.example`**

Append to `.env.local.example`:

```
# ── Vercel KV (rate limiting) ─────────────────────────────────────────────────
# Provisioned via Vercel dashboard → Storage → Create Database → KV.
# When KV is connected, Vercel injects these automatically in production/preview.
# For local dev, copy the "REST API" values from the Vercel KV dashboard, or use
# a free Upstash Redis instance (https://upstash.com/redis).
# If both are unset, the rate limiter logs a warning and disables itself —
# the app still runs normally.
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 2: Add a "Rate limiting" section to `README.md`**

Insert this section in `README.md` between the "Environment variables" section and "Project structure":

```markdown
---

## Rate limiting

`POST /api/referrals` is rate-limited to prevent any single signed-in user (or a
compromised session) from flooding HubSpot.

| Bucket | Limit |
|---|---|
| Per user, per minute | 10 |
| Per user, per hour | 100 |
| Per IP, per minute | 30 |
| Per IP, per hour | 300 |

Backed by Vercel KV (Upstash Redis) using sliding-window counters. On a 429, the
form shows a countdown and re-enables the submit button automatically.

If `KV_REST_API_URL` / `KV_REST_API_TOKEN` are unset (typical for local dev),
rate limiting is disabled with a startup log and the app runs unchanged.

If Redis is unreachable in production, the limiter **fails open** — the request
goes through and the error is logged. The auth gate remains the primary defense.

### Setup (production)

1. Vercel dashboard → Storage → Create Database → KV
2. Connect the store to the `az-partner-referrals` project
3. Redeploy — `KV_REST_API_URL` and `KV_REST_API_TOKEN` are injected automatically
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example README.md
git commit -m "docs: document rate limiting + KV env vars"
```

---

## Task 7: Final verification

- [ ] **Step 1: TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Tests**

Run: `npm test`
Expected: 9 passing tests, 0 failing.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/rate-limit-referrals
```

Then open a PR. The PR description should link to the spec at `docs/superpowers/specs/2026-05-21-rate-limit-referrals-design.md`.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Per-user 10/min, 100/hr; per-IP 30/min, 300/hr; sliding window | Task 3 |
| Run all 4 limiters; most-restrictive wins | Task 3 |
| `Promise.all` on Redis (not HubSpot) | Task 3 |
| `extractIp` with x-forwarded-for / x-real-ip / "unknown" fallback | Task 2 |
| Fail-open on Redis error | Task 3 |
| Auto-disable when KV env vars missing (dev) | Task 3 |
| Inline check in `app/api/referrals/route.ts` after `auth()` | Task 4 |
| 429 + `Retry-After` header | Task 4 |
| Friendly UI message + countdown + button disable/re-enable | Task 5 |
| Unit tests for limiter logic | Tasks 2, 3 |
| Manual smoke test in dev | Task 5 |
| `.env.local.example` documents new vars | Task 6 |
| README rate-limit section + Vercel KV setup | Task 6 |
