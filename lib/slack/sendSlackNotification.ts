import { getHubSpotClient } from '@/lib/hubspot/client'

const HUBSPOT_PORTAL_ID = '308777'

export interface SlackReferralPayload {
  contactId: string
  companyId: string
  submitterEmail: string
  contactName: string
  contactEmail: string
  companyName: string
  companyDomain?: string
  partnerNames: string[]
  mrr?: string
  monthlyOrderVolume?: string
  notes?: string
  referralLink?: string
  isNewContact: boolean
  isNewCompany: boolean
}

export async function sendSlackNotification(payload: SlackReferralPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('[sendSlackNotification] SLACK_WEBHOOK_URL not set — skipping')
    return
  }

  // Resolve owner names from HubSpot
  const hs = getHubSpotClient()
  let contactOwnerName: string | undefined
  let companyOwnerName: string | undefined

  try {
    const [contactRecord, companyRecord] = await Promise.all([
      hs.crm.contacts.basicApi.getById(payload.contactId, ['hubspot_owner_id']).catch(() => null),
      hs.crm.companies.basicApi.getById(payload.companyId, ['hubspot_owner_id']).catch(() => null),
    ])

    const contactOwnerId = (contactRecord?.properties as Record<string, string> | undefined)?.hubspot_owner_id ?? null
    const companyOwnerId = (companyRecord?.properties as Record<string, string> | undefined)?.hubspot_owner_id ?? null

    const ownerIds = [...new Set([contactOwnerId, companyOwnerId].filter(Boolean))] as string[]
    const ownerMap = new Map<string, string>()

    await Promise.all(
      ownerIds.map(async (id) => {
        try {
          const o = await hs.crm.owners.ownersApi.getById(parseInt(id, 10))
          const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || id
          ownerMap.set(id, name)
        } catch { /* non-fatal */ }
      })
    )

    if (contactOwnerId) contactOwnerName = ownerMap.get(contactOwnerId)
    if (companyOwnerId) companyOwnerName = ownerMap.get(companyOwnerId)
  } catch { /* non-fatal — owner names are nice-to-have */ }

  const contactUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${payload.contactId}`
  const companyUrl  = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/company/${payload.companyId}`

  const mrrFormatted = payload.mrr
    ? `$${Number(payload.mrr).toLocaleString('en-US')}`
    : null
  const movFormatted = payload.monthlyOrderVolume
    ? Number(payload.monthlyOrderVolume).toLocaleString('en-US')
    : null

  const referralLinkText = payload.referralLink
    ? `<${payload.referralLink}|${payload.referralLink}>`
    : '_No link provided — reach out to the partner directly or fill out the contact us form on their website._'

  const blocks: object[] = [
    // ── Header ────────────────────────────────────────────────────────────────
    {
      type: 'header',
      text: { type: 'plain_text', text: `🤝 New Partner Referral — ${payload.companyName}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Partner(s)*\n${payload.partnerNames.join(', ')}` },
        { type: 'mrkdwn', text: `*Submitted By*\n${payload.submitterEmail}` },
      ],
    },
    { type: 'divider' },

    // ── Contact ───────────────────────────────────────────────────────────────
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Contact* ${payload.isNewContact ? '_(new record)_' : '_(existing record)_'}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Name*\n${payload.contactName}` },
        { type: 'mrkdwn', text: `*Email*\n${payload.contactEmail}` },
        { type: 'mrkdwn', text: `*Owner*\n${contactOwnerName ?? '—'}` },
        { type: 'mrkdwn', text: `*HubSpot*\n<${contactUrl}|View Record>` },
      ],
    },
    { type: 'divider' },

    // ── Company ───────────────────────────────────────────────────────────────
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Company* ${payload.isNewCompany ? '_(new record)_' : '_(existing record)_'}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Name*\n${payload.companyName}` },
        { type: 'mrkdwn', text: `*Domain*\n${payload.companyDomain || '—'}` },
        { type: 'mrkdwn', text: `*Owner*\n${companyOwnerName ?? '—'}` },
        { type: 'mrkdwn', text: `*HubSpot*\n<${companyUrl}|View Record>` },
      ],
    },
    { type: 'divider' },

    // ── Deal details ──────────────────────────────────────────────────────────
    ...(mrrFormatted || movFormatted ? [
      {
        type: 'section',
        fields: [
          ...(mrrFormatted ? [{ type: 'mrkdwn', text: `*MRR*\n${mrrFormatted}` }] : []),
          ...(movFormatted ? [{ type: 'mrkdwn', text: `*Monthly Order Volume*\n${movFormatted}` }] : []),
        ],
      },
      { type: 'divider' },
    ] : []),

    // ── Referral link ─────────────────────────────────────────────────────────
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Referral Link*\n${referralLinkText}` },
    },

    // ── Notes ─────────────────────────────────────────────────────────────────
    ...(payload.notes ? [
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Notes*\n${payload.notes}` },
      },
    ] : []),
  ]

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Slack webhook failed ${res.status}: ${body}`)
  }
}
