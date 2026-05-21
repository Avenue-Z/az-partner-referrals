import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = req.headers.get('x-real-ip')?.trim()
  if (xri) return xri
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
