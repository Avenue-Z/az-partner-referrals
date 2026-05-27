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
}

// Display order for categories in the picker
export const COMPANY_TYPE_ORDER = [
  'marketing_retention',
  'ecommerce_enablement',
  'data_analytics_ai',
  'payments_finance',
  'logistics_fulfillment',
  'creative_influencer_services',
]

export type PartnerFetchResult =
  | { ok: true; partners: PartnerCompany[] }
  | { ok: false; error: string }

/**
 * Fetch all partners with a partner_name, excluding Individuals & Consultants.
 * TODO: once the correct enum value for "Active" on the tier property is confirmed
 * from the logs, add back: { propertyName: 'tier', operator: 'EQ', value: '<value>' }
 */
export async function getActivePartners(): Promise<PartnerFetchResult> {
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
        filterGroups: [],
        properties: ['partner_name', 'company_type', 'service_offered', 'tier'],
        sorts: ['partner_name'],
        limit: 200,
        after: after ?? '0',
      })

      for (const c of res.results ?? []) {
        const p = c.properties as Record<string, string | null>
        const name = p.partner_name
        // Log tier values so we can identify the correct "active" enum value
        if (name) console.log(`[getActivePartners] partner="${name}" tier="${p.tier}" company_type="${p.company_type}"`)
        // Exclude individuals & consultants client-side
        if (name && p.company_type !== 'individuals_consultations') partners.push({
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

/**
 * Resolve the HubSpot owner ID for a referral submitter, with env-var fallback.
 *
 * Returns the submitter's owner ID when they are a provisioned HubSpot user.
 * Falls back to HUBSPOT_DEFAULT_OWNER_EMAIL when the submitter has no HubSpot
 * owner — this prevents records from being created ownerless when an Avenue Z
 * teammate logs in via Google but is not yet set up as a HubSpot user.
 */
export async function resolveSubmitterOwnerId(submitterEmail: string): Promise<string | undefined> {
  const direct = await getOwnerIdByEmail(submitterEmail)
  if (direct) return direct

  const fallbackEmail = process.env.HUBSPOT_DEFAULT_OWNER_EMAIL
  if (!fallbackEmail) {
    console.warn(`[resolveSubmitterOwnerId] No HubSpot owner for ${submitterEmail} and HUBSPOT_DEFAULT_OWNER_EMAIL is unset — record will be unassigned.`)
    return undefined
  }

  const fallback = await getOwnerIdByEmail(fallbackEmail)
  if (!fallback) {
    console.warn(`[resolveSubmitterOwnerId] No HubSpot owner for ${submitterEmail} or fallback ${fallbackEmail} — record will be unassigned.`)
    return undefined
  }

  console.warn(`[resolveSubmitterOwnerId] ${submitterEmail} has no HubSpot owner — falling back to ${fallbackEmail} (id=${fallback}).`)
  return fallback
}

// ── Association type discovery ────────────────────────────────────────────────

type AssocSpec = { associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED'; associationTypeId: number }

// Cache keyed by "fromType→toType"
const _assocSpecCache = new Map<string, AssocSpec>()

/**
 * Discover the correct HubSpot v4 association type between two object types.
 * HubSpot assigns typeIds dynamically; we call the labels endpoint once per pair
 * and cache the result. Both directions are tried so we find the spec regardless
 * of how the association was originally defined on the custom object.
 */
async function getAssocSpec(fromType: string, toType: string): Promise<AssocSpec> {
  const key = `${fromType}→${toType}`
  if (_assocSpecCache.has(key)) return _assocSpecCache.get(key)!

  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) {
    console.error('[assocSpec] HUBSPOT_ACCESS_TOKEN not set')
    return { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }
  }

  const endpoints = [
    `https://api.hubapi.com/crm/v4/associations/${fromType}/${toType}/labels`,
    `https://api.hubapi.com/crm/v4/associations/${toType}/${fromType}/labels`,
  ]

  for (const url of endpoints) {
    try {
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const body = await res.text()

      if (!res.ok) {
        console.error(`[assocSpec] ${url} → ${res.status}:`, body)
        continue
      }

      const data  = JSON.parse(body) as { results: Array<{ category: string; typeId: number }> }
      console.log(`[assocSpec] ${url} →`, JSON.stringify(data.results))

      const first = data.results?.[0]
      if (first?.typeId) {
        const spec: AssocSpec = {
          associationCategory: first.category as AssocSpec['associationCategory'],
          associationTypeId:   first.typeId,
        }
        _assocSpecCache.set(key, spec)
        console.log(`[assocSpec] cached ${key}:`, spec)
        return spec
      }
    } catch (err) {
      console.error(`[assocSpec] fetch error ${url}:`, err)
    }
  }

  console.error(`[assocSpec] no type found for ${key} — falling back to HUBSPOT_DEFINED/1`)
  const fallback: AssocSpec = { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }
  _assocSpecCache.set(key, fallback)
  return fallback
}

/**
 * Associate any two HubSpot objects via direct fetch (not SDK) so the full
 * error body is visible in logs when something goes wrong.
 */
async function createAssociation(
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  spec: AssocSpec,
): Promise<void> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN!
  const url   = `https://api.hubapi.com/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ associationCategory: spec.associationCategory, associationTypeId: spec.associationTypeId }]),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HubSpot ${res.status}: ${body}`)
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
  /** Monthly Recurring Revenue in dollars (stored as a number string in HubSpot) */
  mrr?: string
  /** Monthly Order Volume */
  monthlyOrderVolume?: string
  submitterEmail: string
}

export type ReferralResult = {
  contactId: string
  companyId: string
  /** referral_link fetched from each Partner record after association — keyed by partner ID */
  partnerReferralLinks: Record<string, string | null>
}

/** Upsert contact + company, set referral properties, and associate with selected partners. */
export async function logReferral(payload: ReferralPayload): Promise<ReferralResult> {
  const hs = getHubSpotClient()

  // 1. Resolve submitter's owner ID (with env-var fallback)
  const ownerId = await resolveSubmitterOwnerId(payload.submitterEmail)

  // 2. Upsert contact
  let contactId: string

  if (payload.existingContactId) {
    // Existing contact — record is already correct; only touch owner if user opted in.
    // Do NOT overwrite name, email, or the denormalised "company" text field.
    contactId = payload.existingContactId
    if (payload.reassignContactOwner && ownerId) {
      await hs.crm.contacts.basicApi.update(contactId, {
        properties: { hubspot_owner_id: ownerId },
      })
    }
  } else {
    // Form didn't match a contact; search server-side to avoid duplicates.
    // If a hit comes back, treat the record as existing — never silently
    // reassign its owner (owner is only included on the create path).
    const baseContactProps: Record<string, string> = {
      firstname: payload.firstName,
      lastname:  payload.lastName,
      email:     payload.email,
      company:   payload.companyName,
    }
    const search = await hs.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ' as any, value: payload.email }] }],
      properties: ['email'], limit: 1, after: '0', sorts: [],
    })
    if (search.total > 0) {
      contactId = search.results[0].id
      await hs.crm.contacts.basicApi.update(contactId, { properties: baseContactProps })
    } else {
      const created = await hs.crm.contacts.basicApi.create({
        properties: { ...baseContactProps, ...(ownerId ? { hubspot_owner_id: ownerId } : {}) },
      })
      contactId = created.id
    }
  }

  // 3. Upsert company
  let companyId: string

  // Referral tracking fields — always written, on both new and existing companies.
  // referral_process must be written even when notes is empty, otherwise stale
  // notes from a prior referral persist on the company record.
  const referralProps: Record<string, string> = {
    referred_to_partner: 'Yes',
    referred_to:         payload.partnerNames.join(', '),
    referral_process:    payload.notes ?? '',
    ...(payload.mrr                ? { monthly_recurring_revenue: payload.mrr }                : {}),
    ...(payload.monthlyOrderVolume ? { monthly_order_volume:      payload.monthlyOrderVolume } : {}),
  }

  if (payload.existingCompanyId) {
    // Existing company — ONLY write referral tracking fields and optional owner.
    // Never overwrite name, domain, or any other identity property.
    companyId = payload.existingCompanyId
    await hs.crm.companies.basicApi.update(companyId, {
      properties: {
        ...referralProps,
        ...(payload.reassignCompanyOwner && ownerId ? { hubspot_owner_id: ownerId } : {}),
      },
    })
  } else {
    // Form didn't match a company; search server-side to avoid duplicates.
    // If a hit comes back, treat the record as existing — write referral
    // fields only, and never silently reassign the owner.
    const baseCompanyProps: Record<string, string> = {
      name: payload.companyName,
      ...(payload.companyDomain ? { domain: payload.companyDomain } : {}),
      ...referralProps,
    }
    const domainFilter = payload.companyDomain
      ? [{ propertyName: 'domain', operator: 'EQ' as any, value: payload.companyDomain }]
      : [{ propertyName: 'name',   operator: 'EQ' as any, value: payload.companyName   }]

    const search = await hs.crm.companies.searchApi.doSearch({
      filterGroups: [{ filters: domainFilter }],
      properties: ['name'], limit: 1, after: '0', sorts: [],
    })
    if (search.total > 0) {
      companyId = search.results[0].id
      await hs.crm.companies.basicApi.update(companyId, { properties: baseCompanyProps })
    } else {
      const created = await hs.crm.companies.basicApi.create({
        properties: { ...baseCompanyProps, ...(ownerId ? { hubspot_owner_id: ownerId } : {}) },
      })
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
  } catch (err) {
    console.error('[logReferral] contact→company association failed:', err)
  }

  // 5. Associate lead company → each selected partner object record
  const companyPartnerSpec = await getAssocSpec('companies', PARTNERS_OBJECT_TYPE)

  for (const partnerId of payload.partnerIds) {
    try {
      await createAssociation('companies', companyId, PARTNERS_OBJECT_TYPE, partnerId, companyPartnerSpec)
      console.log(`[logReferral] ✓ company ${companyId} → partner ${partnerId} (typeId=${companyPartnerSpec.associationTypeId})`)
    } catch (err) {
      console.error(`[logReferral] ✗ company→partner failed — company:${companyId} partner:${partnerId}`, err)
    }
  }

  // 6. Associate lead contact → each selected partner object record
  const contactPartnerSpec = await getAssocSpec('contacts', PARTNERS_OBJECT_TYPE)

  for (const partnerId of payload.partnerIds) {
    try {
      await createAssociation('contacts', contactId, PARTNERS_OBJECT_TYPE, partnerId, contactPartnerSpec)
      console.log(`[logReferral] ✓ contact ${contactId} → partner ${partnerId} (typeId=${contactPartnerSpec.associationTypeId})`)
    } catch (err) {
      console.error(`[logReferral] ✗ contact→partner failed — contact:${contactId} partner:${partnerId}`, err)
    }
  }

  // 7. Fetch referral_link from each associated Partner record
  const partnerReferralLinks: Record<string, string | null> = {}
  for (const partnerId of payload.partnerIds) {
    try {
      const partner = await hs.crm.objects.basicApi.getById(
        PARTNERS_OBJECT_TYPE, partnerId, ['referral_link'],
      )
      const pp = partner.properties as Record<string, string | null>
      partnerReferralLinks[partnerId] = pp.referral_link ?? null
    } catch {
      partnerReferralLinks[partnerId] = null
    }
  }

  return { contactId, companyId, partnerReferralLinks }
}
