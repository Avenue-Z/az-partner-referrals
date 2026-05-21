import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractIp, checkReferralRateLimit, __setLimitersForTest, __resetLimitersForTest } from './rate-limit'

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

  it('falls through to "unknown" when x-real-ip is whitespace only', () => {
    const req = reqWith({ 'x-real-ip': '   ' })
    expect(extractIp(req)).toBe('unknown')
  })
})

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
