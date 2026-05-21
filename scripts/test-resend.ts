/**
 * Dry-run test for the Resend email notification setup.
 * Validates template rendering, recipient deduplication, and API key — no email is sent.
 *
 * Run: npm run test:email
 */
import * as React from 'react'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { render } from '@react-email/render'
import { Resend } from 'resend'
import { ReferralNotificationEmail } from '../emails/ReferralNotificationEmail'

// Load .env.local so the script has access to RESEND_API_KEY
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !process.env[key]) process.env[key] = val
  }
} catch { /* .env.local not present — env vars already set */ }

// ── Constants (mirrors production code) ───────────────────────────────────────
const ALWAYS_NOTIFY = ['rachael.zahn@avenuez.com', 'nick.osler@avenuez.com']
const FROM_ADDRESS   = 'Avenue Z <notifications@send.avenuez.com>'

// ── Sample referral data ───────────────────────────────────────────────────────
const SAMPLE = {
  submitterEmail:   'thomas.chang@avenuez.com',
  contactName:      'Jane Smith',
  contactEmail:     'jane.smith@testclient.com',
  companyName:      'Test Client Co',
  companyId:        '123456',
  partnerNames:     ['Klaviyo', 'Attentive'],
  notes:            'Met at eTail Boston — warm intro',
  contactOwnerName: 'Thomas Chang',
  companyOwnerName: 'Sarah Lee',
  // Thomas is both submitter AND contact owner → dedup should collapse to 1 entry
  contactOwnerEmail: 'thomas.chang@avenuez.com',
  companyOwnerEmail: 'sarah.lee@avenuez.com',
}

// ── Test runner ────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (err: any) {
    console.log(`  ❌  ${name}\n      ${err.message}`)
    failed++
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪  Resend notification dry-run test\n')

  // 1. Template renders to valid HTML
  await test('Email template renders to HTML without errors', async () => {
    const html = await render(React.createElement(ReferralNotificationEmail, SAMPLE))
    assert(typeof html === 'string' && html.length > 0, 'render returned empty string')
    assert(html.includes('Test Client Co'),          'company name missing from HTML')
    assert(html.includes('Klaviyo'),                  'partner name missing from HTML')
    assert(html.includes('jane.smith@testclient.com'),'contact email missing from HTML')
    assert(html.includes('308777'),                   'HubSpot portal ID missing from deep-link')
    assert(html.includes('123456'),                   'company ID missing from HubSpot deep-link')
    assert(html.includes('Met at eTail Boston'),      'notes missing from HTML')
  })

  // 2. Subject line format
  await test('Email subject line formats correctly', () => {
    const subject = `New Partner Referral: ${SAMPLE.companyName} → ${SAMPLE.partnerNames.join(', ')}`
    assert.strictEqual(subject, 'New Partner Referral: Test Client Co → Klaviyo, Attentive')
  })

  // 3. Recipient deduplication
  await test('Recipient list deduplicates correctly', () => {
    const recipientSet = new Set<string>([
      SAMPLE.submitterEmail,
      ...ALWAYS_NOTIFY,
    ])
    if (SAMPLE.contactOwnerEmail) recipientSet.add(SAMPLE.contactOwnerEmail)
    if (SAMPLE.companyOwnerEmail) recipientSet.add(SAMPLE.companyOwnerEmail)

    const recipients = [...recipientSet]

    // thomas is both submitter and contact owner — must appear exactly once
    const thomasCount = recipients.filter(r => r === 'thomas.chang@avenuez.com').length
    assert.strictEqual(thomasCount, 1, 'submitter/contact-owner duplicate not collapsed')

    assert(recipients.includes('rachael.zahn@avenuez.com'), 'rachael.zahn missing')
    assert(recipients.includes('nick.osler@avenuez.com'),   'nick.osler missing')
    assert(recipients.includes('sarah.lee@avenuez.com'),    'company owner missing')

    // expected: thomas, rachael, nick, sarah = 4 unique
    assert.strictEqual(recipients.length, 4, `expected 4 recipients, got ${recipients.length}: ${recipients.join(', ')}`)
  })

  // 4. Always-notify list is correct
  await test('Always-notify list contains correct addresses', () => {
    assert(ALWAYS_NOTIFY.includes('rachael.zahn@avenuez.com'), 'rachael.zahn not in always-notify')
    assert(ALWAYS_NOTIFY.includes('nick.osler@avenuez.com'),   'nick.osler not in always-notify')
    assert.strictEqual(ALWAYS_NOTIFY.length, 2, 'unexpected entries in always-notify list')
  })

  // 5. From address uses verified domain
  await test('From address uses verified send.avenuez.com domain', () => {
    assert(FROM_ADDRESS.includes('notifications@send.avenuez.com'), 'from address does not use verified domain')
  })

  // 6. Resend API key is set and client initialises
  await test('Resend API key is set and client initialises', () => {
    const key = process.env.RESEND_API_KEY
    assert(key && key.startsWith('re_'), `RESEND_API_KEY missing or malformed (got: ${key ?? 'undefined'})`)
    const client = new Resend(key)
    assert(client.emails, 'Resend client missing .emails namespace')
  })

  // 7. Dry-run: intercept send() — confirm payload shape without hitting API
  await test('Resend send() payload is correctly shaped (dry run — no email sent)', async () => {
    const captured: unknown[] = []
    const key = process.env.RESEND_API_KEY!
    const client = new Resend(key)

    // Patch send to capture instead of send
    client.emails.send = async (params: any) => {
      captured.push(params)
      return { data: { id: 'dry-run-id' }, error: null, headers: null }
    }

    const html = await render(React.createElement(ReferralNotificationEmail, SAMPLE))

    await client.emails.send({
      from:    FROM_ADDRESS,
      to:      'thomas.chang@avenuez.com',
      subject: `New Partner Referral: ${SAMPLE.companyName} → ${SAMPLE.partnerNames.join(', ')}`,
      html,
    })

    assert.strictEqual(captured.length, 1, 'expected exactly 1 captured send call')
    const payload = captured[0] as any
    assert.strictEqual(payload.from, FROM_ADDRESS)
    assert(payload.subject.includes('Test Client Co'), 'subject missing company name')
    assert(payload.html.includes('Klaviyo'),           'HTML missing partner name')
  })

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n  ${passed} passed · ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('\nTest runner crashed:', err)
  process.exit(1)
})
