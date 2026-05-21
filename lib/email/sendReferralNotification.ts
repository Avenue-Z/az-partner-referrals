import * as React from 'react'
import { getHubSpotClient } from '@/lib/hubspot/client'
import { resend } from '@/lib/resend'
import { ReferralNotificationEmail } from '@/emails/ReferralNotificationEmail'

const ALWAYS_NOTIFY = ['rachael.zahn@avenuez.com', 'nick.osler@avenuez.com']

export interface ReferralNotificationPayload {
  contactId: string
  companyId: string
  submitterEmail: string
  contactName: string
  contactEmail: string
  companyName: string
  partnerNames: string[]
  notes?: string
}

export async function sendReferralNotification(payload: ReferralNotificationPayload): Promise<void> {
  const hs = getHubSpotClient()

  // Fetch contact + company owner IDs in parallel
  const [contactRecord, companyRecord] = await Promise.all([
    hs.crm.contacts.basicApi.getById(payload.contactId, ['hubspot_owner_id']).catch(() => null),
    hs.crm.companies.basicApi.getById(payload.companyId, ['hubspot_owner_id']).catch(() => null),
  ])

  const contactOwnerId = (contactRecord?.properties as Record<string, string> | undefined)?.hubspot_owner_id ?? null
  const companyOwnerId = (companyRecord?.properties as Record<string, string> | undefined)?.hubspot_owner_id ?? null

  // Resolve owner details in parallel (only if IDs are different to avoid duplicate lookup)
  const ownerIds = [...new Set([contactOwnerId, companyOwnerId].filter(Boolean))] as string[]
  const ownerMap = new Map<string, { email: string; name: string }>()

  await Promise.all(
    ownerIds.map(async (id) => {
      try {
        const o = await hs.crm.owners.ownersApi.getById(parseInt(id, 10))
        if (o.email) {
          ownerMap.set(id, {
            email: o.email,
            name: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email,
          })
        }
      } catch { /* non-fatal */ }
    })
  )

  const contactOwner = contactOwnerId ? ownerMap.get(contactOwnerId) : undefined
  const companyOwner = companyOwnerId ? ownerMap.get(companyOwnerId) : undefined

  // Build deduplicated recipient list
  const recipientSet = new Set<string>([
    payload.submitterEmail,
    ...ALWAYS_NOTIFY,
  ])
  if (contactOwner?.email) recipientSet.add(contactOwner.email)
  if (companyOwner?.email) recipientSet.add(companyOwner.email)

  const recipients = [...recipientSet]

  const emailElement = React.createElement(ReferralNotificationEmail, {
    submitterEmail: payload.submitterEmail,
    contactName: payload.contactName,
    contactEmail: payload.contactEmail,
    companyName: payload.companyName,
    companyId: payload.companyId,
    partnerNames: payload.partnerNames,
    notes: payload.notes,
    contactOwnerName: contactOwner?.name,
    companyOwnerName: companyOwner?.name,
  })

  const results = await Promise.allSettled(
    recipients.map((to) =>
      resend.emails.send({
        from: 'Avenue Z <onboarding@resend.dev>',
        to,
        subject: `New Partner Referral: ${payload.companyName} → ${payload.partnerNames.join(', ')}`,
        react: emailElement,
      })
    )
  )

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'rejected') {
      console.error(`[sendReferralNotification] failed to send to ${recipients[i]}:`, r.reason)
    } else if (r.value.error) {
      console.error(`[sendReferralNotification] Resend error for ${recipients[i]}:`, r.value.error)
    }
  }
}
