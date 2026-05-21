import { Client } from '@hubspot/api-client'

let _client: Client | null = null

export function getHubSpotClient(): Client {
  if (_client) return _client
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('Missing env var: HUBSPOT_ACCESS_TOKEN')
  _client = new Client({ accessToken: token })
  return _client
}

// Custom partners object type ID in HubSpot portal 308777
export const PARTNERS_OBJECT_TYPE = '2-17260992'

// ── Partner types ────────────────────────────────────────────────────────────

export type PartnerCompany = {
  id: string
  name: string
  companyType: string | null
  serviceOffered: string | null
}

export const COMPANY_TYPE_LABELS: Record<string, string> = {
  marketing_retention:         'Marketing & Retention',
  ecommerce_enablement:        'eCommerce Enablement',
  data_analytics_ai:           'Data, Analytics & AI',
  payments_finance:            'Payments & Finance',
  logistics_fulfillment:       'Logistics & Fulfillment',
  creative_influencer_services:'Creative & Influencer',
  individuals_consultations:   'Individuals & Consultants',
}

// Display order for categories in the picker
export const COMPANY_TYPE_ORDER = [
  'marketing_retention',
  'ecommerce_enablement',
  'data_analytics_ai',
  'payments_finance',
  'logistics_fulfillment',
  'creative_influencer_services',
  'individuals_consultations',
]

export type PartnerFetchResult =
  | { ok: true; partners: PartnerCompany[] }
  | { ok: false; error: string }

/** Fetch all Tier 1 partners from the custom partners object, paginating until exhausted. */
export async function getTier1Partners(): Promise<PartnerFetchResult> {
  let hs: Client
  try {
    hs = getHubSpotClient()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'HubSpot client error' }
  }

  const partners: PartnerCompany[] = []
  let after: string | undefined

  try {
    do {
      const res = await hs.crm.objects.searchApi.doSearch(PARTNERS_OBJECT_TYPE, {
        filterGroups: [{
          filters: [
            { propertyName: 'tier', operator: 'EQ' as any, value: 'tier_1' },
          ],
        }],
        properties: ['partner_name', 'company_type', 'service_offered'],
        sorts: ['partner_name'],
        limit: 200,
        after: after ?? '0',
      })

      for (const c of res.results ?? []) {
        const p = c.properties as Record<string, string | null>
        const name = p.partner_name
        if (name) partners.push({
          id: c.id,
          name,
          companyType: p.company_type ?? null,
          serviceOffered: p.service_offered ?? null,
        })
      }
      after = res.paging?.next?.after
    } while (after)
  } catch (err: any) {
    const status = err?.code ?? err?.statusCode ?? ''
    const message = err?.message ?? String(err)
    console.error('[getTier1Partners] HubSpot error:', status, message)

    if (String(status) === '403' || message.includes('scope') || message.includes('MISSING_SCOPES')) {
      return { ok: false, error: 'Missing HubSpot scope: crm.objects.custom.read — add it to your Service Key.' }
    }
    if (String(status) === '401') {
      return { ok: false, error: 'Invalid HubSpot token — check HUBSPOT_ACCESS_TOKEN in Vercel.' }
    }
    return { ok: false, error: `HubSpot error (${status || 'unknown'}): ${message}` }
  }

  return { ok: true, partners: partners.sort((a, b) => a.name.localeCompare(b.name)) }
}

// ── Referral log ─────────────────────────────────────────────────────────────

export type ReferralLogEntry = {
  id: string
  companyName: string
  referredTo: string
  notes: string
  ownerName: string
  dateModified: string
}

/** Fetch recent referrals — companies where referred_to_partner = Yes. Non-throwing. */
export async function getReferralLog(): Promise<ReferralLogEntry[]> {
  let hs: Client
  try {
    hs = getHubSpotClient()
  } catch {
    return []
  }

  const entries: ReferralLogEntry[] = []
  let ownerMap: Record<string, string> = {}

  try {
    const ownersRes = await hs.crm.owners.ownersApi.getPage(undefined, undefined, 100)
    for (const o of ownersRes.results ?? []) {
      const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || String(o.id)
      ownerMap[String(o.id)] = name
    }
  } catch { /* non-fatal */ }

  try {
    const res = await hs.crm.companies.searchApi.doSearch({
      filterGroups: [{
        filters: [
          { propertyName: 'referred_to_partner', operator: 'EQ' as any, value: 'Yes' },
        ],
      }],
      properties: ['name', 'referred_to', 'referral_process', 'hubspot_owner_id', 'hs_lastmodifieddate'],
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
        notes: p.referral_process ?? '',
        ownerName: p.hubspot_owner_id ? (ownerMap[p.hubspot_owner_id] ?? p.hubspot_owner_id) : '—',
        dateModified: p.hs_lastmodifieddate
          ? new Date(p.hs_lastmodifieddate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—',
      })
    }
  } catch (err) {
    console.error('[getReferralLog] HubSpot error:', err)
  }

  return entries
}

// ── Contact / company lookup ──────────────────────────────────────────────────

export type ContactMatch = {
  id: string
  firstName: string
  lastName: string
  email: string
  ownerId: string | null
  ownerName: string | null
  associatedCompanyId: string | null
}

export type CompanyMatch = {
  id: string
  name: string
  domain: string
  ownerId: string | null
  ownerName: string | null
}

export type ContactLookupResult = {
  contact: ContactMatch | null
  company: CompanyMatch | null
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function resolveOwnerName(hs: Client, ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null
  try {
    const o = await hs.crm.owners.ownersApi.getById(parseInt(ownerId, 10))
    return [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || ownerId
  } catch {
    return null
  }
}

/** Fetch a single company by its HubSpot record ID, including owner info. */
export async function lookupCompanyById(companyId: string): Promise<CompanyMatch | null> {
  const hs = getHubSpotClient()
  try {
    const c = await hs.crm.companies.basicApi.getById(
      companyId,
      ['name', 'domain', 'hubspot_owner_id'],
    )
    const p = c.properties as Record<string, string | null>
    const ownerId = p.hubspot_owner_id ?? null
    return {
      id:        c.id,
      name:      p.name   ?? '',
      domain:    p.domain ?? '',
      ownerId,
      ownerName: await resolveOwnerName(hs, ownerId),
    }
  } catch {
    return null
  }
}

/**
 * Look up a contact by email.
 * Also resolves their primary associated company (if any).
 * Returns { contact, company } — either can be null.
 */
export async function lookupContactByEmail(email: string): Promise<ContactLookupResult> {
  const hs = getHubSpotClient()
  try {
    // Step 1: find by email to get the record ID
    const search = await hs.crm.contacts.searchApi.doSearch({
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: 'EQ' as any, value: email.toLowerCase() }],
      }],
      properties: ['email'],
      limit: 1, after: '0', sorts: [],
    })
    if ((search.total ?? 0) === 0) return { contact: null, company: null }

    // Step 2: fetch full record with properties + company associations in one call
    const c = await hs.crm.contacts.basicApi.getById(
      search.results[0].id,
      ['firstname', 'lastname', 'email', 'hubspot_owner_id'],
      undefined,
      ['companies'],
    )

    const p      = c.properties as Record<string, string | null>
    const ownerId = p.hubspot_owner_id ?? null

    // Extract first associated company ID from the associations block
    const assocResults = (c.associations as any)?.companies?.results as Array<{ id: string }> | undefined
    const associatedCompanyId = assocResults?.[0]?.id ?? null

    let company: CompanyMatch | null = null
    if (associatedCompanyId) {
      company = await lookupCompanyById(associatedCompanyId)
    }

    return {
      contact: {
        id:                  c.id,
        firstName:           p.firstname ?? '',
        lastName:            p.lastname  ?? '',
        email:               p.email     ?? email,
        ownerId,
        ownerName:           await resolveOwnerName(hs, ownerId),
        associatedCompanyId,
      },
      company,
    }
  } catch {
    return { contact: null, company: null }
  }
}

/** Look up an existing company by domain or name. Returns null if not found. */
export async function lookupCompany(query: { domain?: string; name?: string }): Promise<CompanyMatch | null> {
  if (!query.domain && !query.name) return null
  const hs = getHubSpotClient()
  try {
    const filter = query.domain
      ? { propertyName: 'domain', operator: 'EQ' as any, value: query.domain.toLowerCase() }
      : { propertyName: 'name',   operator: 'EQ' as any, value: query.name! }

    const res = await hs.crm.companies.searchApi.doSearch({
      filterGroups: [{ filters: [filter] }],
      properties: ['name', 'domain', 'hubspot_owner_id'],
      limit: 1, after: '0', sorts: [],
    })
    if ((res.total ?? 0) === 0) return null

    const c  = res.results[0]
    const p  = c.properties as Record<string, string | null>
    const ownerId = p.hubspot_owner_id ?? null
    return {
      id:        c.id,
      name:      p.name   ?? '',
      domain:    p.domain ?? '',
      ownerId,
      ownerName: await resolveOwnerName(hs, ownerId),
    }
  } catch {
    return null
  }
}

// ── Owner lookup ──────────────────────────────────────────────────────────────

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

// ── Referral write ────────────────────────────────────────────────────────────

export type ReferralPayload = {
  firstName: string
  lastName: string
  email: string
  companyName: string
  companyDomain?: string
  existingContactId?: string
  existingCompanyId?: string
  /** Set true to reassign an existing contact's owner to the submitter */
  reassignContactOwner?: boolean
  /** Set true to reassign an existing company's owner to the submitter */
  reassignCompanyOwner?: boolean
  partnerIds: string[]
  partnerNames: string[]
  notes?: string
  submitterEmail: string
}

/** Upsert contact + company, set referral properties, and associate with selected partners. */
export async function logReferral(payload: ReferralPayload): Promise<void> {
  const hs = getHubSpotClient()

  // 1. Resolve submitter's owner ID
  const ownerId = await getOwnerIdByEmail(payload.submitterEmail)

  // 2. Upsert contact
  let contactId: string

  // Base props (no owner) — used when updating an existing record without reassignment
  const baseContactProps: Record<string, string> = {
    firstname: payload.firstName,
    lastname:  payload.lastName,
    email:     payload.email,
    company:   payload.companyName,
  }

  if (payload.existingContactId) {
    // Existing contact: only touch owner when the user explicitly opted in
    contactId = payload.existingContactId
    await hs.crm.contacts.basicApi.update(contactId, {
      properties: {
        ...baseContactProps,
        ...(payload.reassignContactOwner && ownerId ? { hubspot_owner_id: ownerId } : {}),
      },
    })
  } else {
    // New contact: always assign to submitter
    const search = await hs.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ' as any, value: payload.email }] }],
      properties: ['email'], limit: 1, after: '0', sorts: [],
    })
    const newContactProps = { ...baseContactProps, ...(ownerId ? { hubspot_owner_id: ownerId } : {}) }
    if (search.total > 0) {
      contactId = search.results[0].id
      await hs.crm.contacts.basicApi.update(contactId, { properties: newContactProps })
    } else {
      const created = await hs.crm.contacts.basicApi.create({ properties: newContactProps })
      contactId = created.id
    }
  }

  // 3. Upsert company
  let companyId: string

  // Referral fields always written on the company regardless of create/update
  const referralProps: Record<string, string> = {
    referred_to_partner: 'Yes',
    referred_to:         payload.partnerNames.join(', '),
    ...(payload.notes ? { referral_process: payload.notes } : {}),
  }

  const baseCompanyProps: Record<string, string> = {
    name: payload.companyName,
    ...(payload.companyDomain ? { domain: payload.companyDomain } : {}),
    ...referralProps,
  }

  if (payload.existingCompanyId) {
    // Existing company: only touch owner when the user explicitly opted in
    companyId = payload.existingCompanyId
    await hs.crm.companies.basicApi.update(companyId, {
      properties: {
        ...baseCompanyProps,
        ...(payload.reassignCompanyOwner && ownerId ? { hubspot_owner_id: ownerId } : {}),
      },
    })
  } else {
    // New company: always assign to submitter
    const domainFilter = payload.companyDomain
      ? [{ propertyName: 'domain', operator: 'EQ' as any, value: payload.companyDomain }]
      : [{ propertyName: 'name',   operator: 'EQ' as any, value: payload.companyName   }]

    const search = await hs.crm.companies.searchApi.doSearch({
      filterGroups: [{ filters: domainFilter }],
      properties: ['name'], limit: 1, after: '0', sorts: [],
    })
    const newCompanyProps = { ...baseCompanyProps, ...(ownerId ? { hubspot_owner_id: ownerId } : {}) }
    if (search.total > 0) {
      companyId = search.results[0].id
      await hs.crm.companies.basicApi.update(companyId, { properties: newCompanyProps })
    } else {
      const created = await hs.crm.companies.basicApi.create({ properties: newCompanyProps })
      companyId = created.id
    }
  }

  // 4. Associate contact → company
  try {
    await hs.crm.associations.v4.basicApi.create(
      'contacts', contactId,
      'companies', companyId,
      [{ associationCategory: 'HUBSPOT_DEFINED' as any, associationTypeId: 279 }],
    )
  } catch { /* non-fatal */ }

  // 5. Associate lead company → each selected partner object record (sequential)
  for (const partnerId of payload.partnerIds) {
    try {
      await hs.crm.associations.v4.basicApi.create(
        'companies', companyId,
        PARTNERS_OBJECT_TYPE, partnerId,
        [{ associationCategory: 'USER_DEFINED' as any, associationTypeId: 1 }],
      )
    } catch { /* non-fatal */ }
  }
}
