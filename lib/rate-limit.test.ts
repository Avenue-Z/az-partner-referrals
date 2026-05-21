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

  it('falls through to "unknown" when x-real-ip is whitespace only', () => {
    const req = reqWith({ 'x-real-ip': '   ' })
    expect(extractIp(req)).toBe('unknown')
  })
})
