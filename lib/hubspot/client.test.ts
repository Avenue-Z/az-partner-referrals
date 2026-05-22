import { describe, test, expect, vi, beforeEach } from 'vitest'

const ownersGetPage = vi.fn()
const ownersGetById = vi.fn()
const contactsBasicCreate = vi.fn()
const contactsBasicUpdate = vi.fn()
const contactsBasicGetById = vi.fn()
const contactsSearch = vi.fn()
const companiesBasicCreate = vi.fn()
const companiesBasicUpdate = vi.fn()
const companiesBasicGetById = vi.fn()
const companiesSearch = vi.fn()
const assocV4Create = vi.fn()
const customObjSearch = vi.fn()

vi.mock('@hubspot/api-client', () => ({
  Client: class {
    crm = {
      owners: { ownersApi: { getPage: ownersGetPage, getById: ownersGetById } },
      contacts: {
        basicApi: { create: contactsBasicCreate, update: contactsBasicUpdate, getById: contactsBasicGetById },
        searchApi: { doSearch: contactsSearch },
      },
      companies: {
        basicApi: { create: companiesBasicCreate, update: companiesBasicUpdate, getById: companiesBasicGetById },
        searchApi: { doSearch: companiesSearch },
      },
      objects: { searchApi: { doSearch: customObjSearch } },
      associations: { v4: { basicApi: { create: assocV4Create } } },
    }
  },
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const okAssocResponse = () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ results: [{ category: 'USER_DEFINED', typeId: 1 }] }),
})

beforeEach(() => {
  vi.resetModules()
  ownersGetPage.mockReset()
  ownersGetById.mockReset()
  contactsBasicCreate.mockReset()
  contactsBasicUpdate.mockReset()
  contactsBasicGetById.mockReset()
  contactsSearch.mockReset()
  companiesBasicCreate.mockReset()
  companiesBasicUpdate.mockReset()
  companiesBasicGetById.mockReset()
  companiesSearch.mockReset()
  assocV4Create.mockReset()
  customObjSearch.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(okAssocResponse())
  assocV4Create.mockResolvedValue({})
  process.env.HUBSPOT_ACCESS_TOKEN = 'test-token'
  delete process.env.HUBSPOT_DEFAULT_OWNER_EMAIL
})

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2: notes don't clear on subsequent referrals
// ─────────────────────────────────────────────────────────────────────────────
describe('logReferral — Bug 2: notes clearing', () => {
  test('writes referral_process="" when notes is undefined on an existing company', async () => {
    ownersGetPage.mockResolvedValue({
      results: [{ id: 99, email: 'submitter@avenuez.com' }],
    })
    companiesBasicUpdate.mockResolvedValue({ id: 'co1' })

    const { logReferral } = await import('./client')

    await logReferral({
      firstName: 'A',
      lastName: 'B',
      email: 'a@x.com',
      companyName: 'Acme',
      existingContactId: 'c1',
      existingCompanyId: 'co1',
      partnerIds: ['p1'],
      partnerNames: ['Partner 1'],
      submitterEmail: 'submitter@avenuez.com',
      // notes intentionally omitted
    })

    expect(companiesBasicUpdate).toHaveBeenCalledTimes(1)
    const [companyId, payload] = companiesBasicUpdate.mock.calls[0]
    expect(companyId).toBe('co1')
    expect(payload.properties).toMatchObject({
      referred_to_partner: 'Yes',
      referred_to: 'Partner 1',
      referral_process: '',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1: silent failure when submitter isn't a HubSpot owner
// ─────────────────────────────────────────────────────────────────────────────
describe('logReferral — Bug 1: owner fallback', () => {
  test('uses HUBSPOT_DEFAULT_OWNER_EMAIL when submitter is not a HubSpot owner', async () => {
    process.env.HUBSPOT_DEFAULT_OWNER_EMAIL = 'nick.osler@avenuez.com'

    ownersGetPage.mockImplementation(async (email?: string) => {
      if (email === 'submitter@avenuez.com') return { results: [] }
      if (email === 'nick.osler@avenuez.com') return { results: [{ id: 77, email }] }
      return { results: [] }
    })

    contactsSearch.mockResolvedValue({ total: 0, results: [] })
    contactsBasicCreate.mockResolvedValue({ id: 'c-new' })
    companiesSearch.mockResolvedValue({ total: 0, results: [] })
    companiesBasicCreate.mockResolvedValue({ id: 'co-new' })

    const { logReferral } = await import('./client')

    await logReferral({
      firstName: 'A',
      lastName: 'B',
      email: 'a@x.com',
      companyName: 'Acme',
      partnerIds: ['p1'],
      partnerNames: ['Partner 1'],
      submitterEmail: 'submitter@avenuez.com',
    })

    expect(contactsBasicCreate).toHaveBeenCalledTimes(1)
    expect(contactsBasicCreate.mock.calls[0][0].properties.hubspot_owner_id).toBe('77')

    expect(companiesBasicCreate).toHaveBeenCalledTimes(1)
    expect(companiesBasicCreate.mock.calls[0][0].properties.hubspot_owner_id).toBe('77')
  })

  test('still works (no owner set) when neither submitter nor fallback resolves', async () => {
    process.env.HUBSPOT_DEFAULT_OWNER_EMAIL = 'nobody@avenuez.com'
    ownersGetPage.mockResolvedValue({ results: [] })

    contactsSearch.mockResolvedValue({ total: 0, results: [] })
    contactsBasicCreate.mockResolvedValue({ id: 'c-new' })
    companiesSearch.mockResolvedValue({ total: 0, results: [] })
    companiesBasicCreate.mockResolvedValue({ id: 'co-new' })

    const { logReferral } = await import('./client')

    const result = await logReferral({
      firstName: 'A',
      lastName: 'B',
      email: 'a@x.com',
      companyName: 'Acme',
      partnerIds: ['p1'],
      partnerNames: ['Partner 1'],
      submitterEmail: 'submitter@avenuez.com',
    })

    expect(result.contactId).toBe('c-new')
    expect(contactsBasicCreate.mock.calls[0][0].properties.hubspot_owner_id).toBeUndefined()
    expect(companiesBasicCreate.mock.calls[0][0].properties.hubspot_owner_id).toBeUndefined()
  })

  test('does not overwrite hubspot_owner_id when server-side search finds an existing contact', async () => {
    // Form didn't find the contact (existingContactId undefined), but the
    // server-side safety re-search does. We must NOT silently reassign the
    // existing contact's owner to the submitter.
    ownersGetPage.mockResolvedValue({
      results: [{ id: 99, email: 'submitter@avenuez.com' }],
    })
    contactsSearch.mockResolvedValue({
      total: 1,
      results: [{ id: 'c-existing' }],
    })
    contactsBasicUpdate.mockResolvedValue({ id: 'c-existing' })
    companiesSearch.mockResolvedValue({ total: 0, results: [] })
    companiesBasicCreate.mockResolvedValue({ id: 'co-new' })

    const { logReferral } = await import('./client')

    await logReferral({
      firstName: 'A',
      lastName: 'B',
      email: 'a@x.com',
      companyName: 'Acme',
      partnerIds: ['p1'],
      partnerNames: ['Partner 1'],
      submitterEmail: 'submitter@avenuez.com',
    })

    expect(contactsBasicUpdate).toHaveBeenCalledTimes(1)
    const [, updateBody] = contactsBasicUpdate.mock.calls[0]
    expect(updateBody.properties.hubspot_owner_id).toBeUndefined()
  })

  test('does not overwrite hubspot_owner_id when server-side search finds an existing company', async () => {
    ownersGetPage.mockResolvedValue({
      results: [{ id: 99, email: 'submitter@avenuez.com' }],
    })
    contactsSearch.mockResolvedValue({ total: 0, results: [] })
    contactsBasicCreate.mockResolvedValue({ id: 'c-new' })
    companiesSearch.mockResolvedValue({
      total: 1,
      results: [{ id: 'co-existing' }],
    })
    companiesBasicUpdate.mockResolvedValue({ id: 'co-existing' })

    const { logReferral } = await import('./client')

    await logReferral({
      firstName: 'A',
      lastName: 'B',
      email: 'a@x.com',
      companyName: 'Acme',
      companyDomain: 'acme.com',
      partnerIds: ['p1'],
      partnerNames: ['Partner 1'],
      submitterEmail: 'submitter@avenuez.com',
    })

    expect(companiesBasicUpdate).toHaveBeenCalledTimes(1)
    const [, updateBody] = companiesBasicUpdate.mock.calls[0]
    expect(updateBody.properties.hubspot_owner_id).toBeUndefined()
  })

  test('uses submitter owner when found, ignoring fallback', async () => {
    process.env.HUBSPOT_DEFAULT_OWNER_EMAIL = 'nick.osler@avenuez.com'
    ownersGetPage.mockImplementation(async (email?: string) => {
      if (email === 'submitter@avenuez.com') return { results: [{ id: 42, email }] }
      return { results: [{ id: 77 }] }
    })

    contactsSearch.mockResolvedValue({ total: 0, results: [] })
    contactsBasicCreate.mockResolvedValue({ id: 'c-new' })
    companiesSearch.mockResolvedValue({ total: 0, results: [] })
    companiesBasicCreate.mockResolvedValue({ id: 'co-new' })

    const { logReferral } = await import('./client')

    await logReferral({
      firstName: 'A',
      lastName: 'B',
      email: 'a@x.com',
      companyName: 'Acme',
      partnerIds: ['p1'],
      partnerNames: ['Partner 1'],
      submitterEmail: 'submitter@avenuez.com',
    })

    expect(contactsBasicCreate.mock.calls[0][0].properties.hubspot_owner_id).toBe('42')
    expect(companiesBasicCreate.mock.calls[0][0].properties.hubspot_owner_id).toBe('42')
  })
})
