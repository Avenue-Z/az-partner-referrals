import { Client } from '@hubspot/api-client'

let _client: Client | null = null

export function getHubSpotClient(): Client {
  if (_client) return _client
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('Missing env var: HUBSPOT_ACCESS_TOKEN')
  _client = new Client({ accessToken: token })
  return _client
}

export type PartnerCompany = {
  id: string
  name: string
}

export type ReferralLogEntry = {
  id: string
  companyName: string
  referredTo: string
  paidReferral: string
  notes: string
  ownerName: string
  dateModified: string
}

/** Fetch all Tier 1 partner companies, paginating until exhausted. */
export async function getTier1Partners(): Promise<PartnerCompany[]> {
  const hs = getHubSpotClient()
  const partners: PartnerCompany[] = []
  let after: string | undefined

  do {
    const res = await hs.crm.companies.searchApi.doSearch({
      filterGroups: [{
        filters: [
          { propertyName: 'type', operator: 'EQ' as any, value: 'PARTNER' },
          { propertyName: 'tier', operator: 'EQ' as any, value: 'Tier 1' },
        ],
      }],
      properties: ['name'],
      sorts: ['name'],
      limit: 200,
      after: after ?? '0',
    })

    for (const c of res.results ?? []) {
      const name = (c.properties as Record<string, string | null>).name
      if (name) partners.push({ id: c.id, name })
    }
    after = res.paging?.next?.after
  } while (after)

  return partners.sort((a, b) => a.name.localeCompare(b.name))
}

/** Fetch recent referrals — companies where referred_to_partner = Yes. */
export async function getReferralLog(): Promise<ReferralLogEntry[]> {
  const hs = getHubSpotClient()
  const entries: ReferralLogEntry[] = []
  let ownerMap: Record<string, string> = {}

  // Fetch owners for name resolution
  try {
    const ownersRes = await hs.crm.owners.ownersApi.getPage(undefined, undefined, 100)
    for (const o of ownersRes.results ?? []) {
      const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || String(o.id)
      ownerMap[String(o.id)] = name
    }
  } catch { /* non-fatal */ }

  const res = await hs.crm.companies.searchApi.doSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'referred_to_partner', operator: 'EQ' as any, value: 'Yes' },
      ],
    }],
    properties: ['name', 'referred_to', 'paid_partner_referral', 'referral_process', 'hubspot_owner_id', 'hs_lastmodifieddate'],
    sorts: ['-hs_lastmodifieddate'],
    limit: 50,
    after: '0',
  })

  for (const c of res.results ?? []) {
    const p = c.properties as Record<string, string | null>
    entries.push({
      id: c.id,
      companyName: p.name ?? '—',
      referredTo: p.referred_to ?? '—',
      paidReferral: p.paid_partner_referral === 'Yes' ? 'Paid' : p.paid_partner_referral === 'No' ? 'Non-Paid' : '—',
      notes: p.referral_process ?? '',
      ownerName: p.hubspot_owner_id ? (ownerMap[p.hubspot_owner_id] ?? p.hubspot_owner_id) : '—',
      dateModified: p.hs_lastmodifieddate
        ? new Date(p.hs_lastmodifieddate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—',
    })
  }

  return entries
}

/** Look up a HubSpot owner ID by email. Returns undefined if not found. */
export async function getOwnerIdByEmail(email: string): Promise<string | undefined> {
  const hs = getHubSpotClient()
  try {
    const res = await hs.crm.owners.ownersApi.getPage(email, undefined, 1)
    const owner = res.results?.[0]
    return owner ? String(owner.id) : undefined
  } catch {
    return undefined
  }
}

export type ReferralPayload = {
  firstName: string
  lastName: string
  email: string
  companyName: string
  companyDomain?: string
  partnerId: string
  partnerName: string
  paidReferral: 'Yes' | 'No'
  notes?: string
  submitterEmail: string
}

/** Upsert contact + company and set referral properties. Sequential — no Promise.all. */
export async function logReferral(payload: ReferralPayload): Promise<void> {
  const hs = getHubSpotClient()

  // 1. Resolve submitter's owner ID
  const ownerId = await getOwnerIdByEmail(payload.submitterEmail)

  // 2. Upsert contact by email
  let contactId: string
  const contactSearch = await hs.crm.contacts.searchApi.doSearch({
    filterGroups: [{
      filters: [{ propertyName: 'email', operator: 'EQ' as any, value: payload.email }],
    }],
    properties: ['email'],
    limit: 1,
    after: '0',
    sorts: [],
  })

  const contactProps: Record<string, string> = {
    firstname: payload.firstName,
    lastname: payload.lastName,
    email: payload.email,
    company: payload.companyName,
    ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
  }

  if (contactSearch.total > 0) {
    contactId = contactSearch.results[0].id
    await hs.crm.contacts.basicApi.update(contactId, { properties: contactProps })
  } else {
    const created = await hs.crm.contacts.basicApi.create({ properties: contactProps })
    contactId = created.id
  }

  // 3. Upsert company — search by domain first, then by name
  let companyId: string
  const domainFilter = payload.companyDomain
    ? [{ propertyName: 'domain', operator: 'EQ' as any, value: payload.companyDomain }]
    : [{ propertyName: 'name', operator: 'EQ' as any, value: payload.companyName }]

  const companySearch = await hs.crm.companies.searchApi.doSearch({
    filterGroups: [{ filters: domainFilter }],
    properties: ['name'],
    limit: 1,
    after: '0',
    sorts: [],
  })

  const companyProps: Record<string, string> = {
    name: payload.companyName,
    ...(payload.companyDomain ? { domain: payload.companyDomain } : {}),
    referred_to_partner: 'Yes',
    referred_to: payload.partnerName,
    paid_partner_referral: payload.paidReferral,
    ...(payload.notes ? { referral_process: payload.notes } : {}),
    ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
  }

  if (companySearch.total > 0) {
    companyId = companySearch.results[0].id
    await hs.crm.companies.basicApi.update(companyId, { properties: companyProps })
  } else {
    const created = await hs.crm.companies.basicApi.create({ properties: companyProps })
    companyId = created.id
  }

  // 4. Associate contact → company
  try {
    await hs.crm.associations.v4.basicApi.create(
      'contacts', contactId,
      'companies', companyId,
      [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 279 }],
    )
  } catch { /* non-fatal if association already exists */ }

  // 5. Associate lead company → partner company
  try {
    await hs.crm.associations.v4.basicApi.create(
      'companies', companyId,
      'companies', payload.partnerId,
      [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 450 }],
    )
  } catch { /* non-fatal */ }
}
