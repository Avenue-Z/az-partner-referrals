'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CheckCircle, Loader2, AlertCircle,
  UserCheck, Building2, UserPlus, PlusCircle,
} from 'lucide-react'
import { PartnerPicker } from '@/components/partner-picker'
import type { PickerPartner } from '@/components/partner-picker'
import type { ContactMatch, CompanyMatch, ContactLookupResult } from '@/lib/hubspot/client'

type Props = {
  partners: PickerPartner[]
  partnerError?: string
  submitterName: string
}

type EmailState  = 'idle' | 'loading' | 'found' | 'not-found'
type CompanyState = 'idle' | 'loading' | 'found' | 'not-found'

export function ReferralForm({ partners, partnerError, submitterName }: Props) {
  const router = useRouter()

  // ── Core form fields ─────────────────────────────────────────────────────────
  const [email,         setEmail]         = useState('')
  const [firstName,     setFirstName]     = useState('')
  const [lastName,      setLastName]      = useState('')
  const [companyName,   setCompanyName]   = useState('')
  const [companyDomain, setCompanyDomain] = useState('')
  const [notes,         setNotes]         = useState('')

  // ── Lookup state ─────────────────────────────────────────────────────────────
  const [emailState,    setEmailState]    = useState<EmailState>('idle')
  const [companyState,  setCompanyState]  = useState<CompanyState>('idle')
  const [matchedContact, setMatchedContact] = useState<ContactMatch | null>(null)
  const [matchedCompany, setMatchedCompany] = useState<CompanyMatch | null>(null)

  // ── Partner selection ─────────────────────────────────────────────────────────
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([])

  // ── Submit state ──────────────────────────────────────────────────────────────
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg,    setErrorMsg]    = useState('')

  // ── Debounce timers ───────────────────────────────────────────────────────────
  const emailTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const companyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Email lookup ──────────────────────────────────────────────────────────────
  const triggerEmailLookup = useCallback((val: string) => {
    if (emailTimer.current) clearTimeout(emailTimer.current)

    // Reset downstream state whenever email changes
    setEmailState('idle')
    setMatchedContact(null)
    setMatchedCompany(null)
    setCompanyState('idle')
    setFirstName('')
    setLastName('')
    setCompanyName('')
    setCompanyDomain('')

    if (!val.includes('@') || !val.includes('.')) return

    emailTimer.current = setTimeout(async () => {
      setEmailState('loading')
      try {
        const res  = await fetch(`/api/lookup?email=${encodeURIComponent(val)}`)
        const data = await res.json() as ContactLookupResult

        if (data.contact) {
          setMatchedContact(data.contact)
          setEmailState('found')

          if (data.company) {
            setMatchedCompany(data.company)
            setCompanyState('found')
            setCompanyName(data.company.name)
            setCompanyDomain(data.company.domain)
          } else {
            setCompanyState('not-found')
          }
        } else {
          setEmailState('not-found')
          setCompanyState('idle')
        }
      } catch {
        setEmailState('not-found')
      }
    }, 600)
  }, [])

  // ── Company lookup (manual fields) ───────────────────────────────────────────
  const triggerCompanyLookup = useCallback((domain: string, name: string) => {
    if (companyTimer.current) clearTimeout(companyTimer.current)
    const query = domain.trim() || name.trim()
    if (!query) { setCompanyState('idle'); setMatchedCompany(null); return }

    companyTimer.current = setTimeout(async () => {
      setCompanyState('loading')
      try {
        const params = domain.trim()
          ? `domain=${encodeURIComponent(domain.trim())}`
          : `name=${encodeURIComponent(name.trim())}`
        const res  = await fetch(`/api/lookup?${params}`)
        const data = await res.json() as { company: CompanyMatch | null }

        if (data.company) {
          setMatchedCompany(data.company)
          setCompanyState('found')
          setCompanyName((prev) => prev || data.company!.name)
          setCompanyDomain((prev) => prev || data.company!.domain)
        } else {
          setMatchedCompany(null)
          setCompanyState('not-found')
        }
      } catch {
        setMatchedCompany(null)
        setCompanyState('not-found')
      }
    }, 600)
  }, [])

  // ── Derived flags ─────────────────────────────────────────────────────────────
  // Do we have everything we need without the user typing more?
  const contactKnown  = emailState === 'found'
  const companyKnown  = companyState === 'found'
  const needsName     = emailState === 'not-found'
  const needsCompany  = emailState === 'not-found' || (contactKnown && companyState !== 'found' && companyState !== 'loading')

  // Whether to show company fields (when contact exists but has no company, or contact doesn't exist)
  const showCompanyFields = (contactKnown && companyState !== 'found') || emailState === 'not-found'

  // Can submit
  const canSubmit =
    email.includes('@') &&
    emailState !== 'loading' &&
    (contactKnown || (firstName.trim() && lastName.trim())) &&
    (companyKnown || (companyName.trim())) &&
    selectedPartnerIds.length > 0

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitState('loading')
    setErrorMsg('')

    const resolvedFirst   = matchedContact?.firstName ?? firstName
    const resolvedLast    = matchedContact?.lastName  ?? lastName
    const resolvedCompany = matchedCompany?.name      ?? companyName
    const resolvedDomain  = matchedCompany?.domain    ?? companyDomain

    const selectedPartners = partners.filter((p) => selectedPartnerIds.includes(p.id))

    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:         resolvedFirst,
          lastName:          resolvedLast,
          email,
          companyName:       resolvedCompany,
          companyDomain:     resolvedDomain   || undefined,
          existingContactId: matchedContact?.id,
          existingCompanyId: matchedCompany?.id,
          partnerIds:        selectedPartnerIds,
          partnerNames:      selectedPartners.map((p) => p.name),
          notes:             notes || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(data.error ?? 'Something went wrong')
      }

      setSubmitState('success')
      // Reset everything
      setEmail('');         setFirstName('');    setLastName('')
      setCompanyName('');   setCompanyDomain(''); setNotes('')
      setEmailState('idle'); setCompanyState('idle')
      setMatchedContact(null); setMatchedCompany(null)
      setSelectedPartnerIds([])
      router.refresh()
    } catch (err) {
      setSubmitState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  /** Cyan card for existing HubSpot records — shows labeled key/value rows */
  function MatchCard({
    icon: Icon, label, rows, note,
  }: {
    icon: React.ElementType
    label: string
    rows: Array<{ key: string; value: string | null | undefined }>
    note?: string
  }) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-[#60FDFF]/25 bg-[#60FDFF]/6 px-4 py-3">
        <Icon className="size-4 shrink-0 text-[#60FDFF] mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#60FDFF]">{label}</p>
          {rows.filter((r) => r.value).map(({ key, value }) => (
            <p key={key} className="text-sm text-[#8A8A8A]">
              {key}:{' '}
              <span className="text-white">{value}</span>
            </p>
          ))}
          {note && (
            <p className="text-xs text-[#60FDFF]/60 pt-0.5">{note}</p>
          )}
        </div>
      </div>
    )
  }

  /** Amber card for records that will be newly created */
  function NewCard({
    icon: Icon, label, note,
  }: {
    icon: React.ElementType
    label: string
    note?: string
  }) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-[#FFAB40]/25 bg-[#FFAB40]/6 px-4 py-3">
        <Icon className="size-4 shrink-0 text-[#FFAB40] mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#FFAB40]">{label}</p>
          {note && (
            <p className="text-xs text-[#FFAB40]/70">{note}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card className="bg-[#272727] border-white/8">
      <CardHeader>
        <CardTitle className="text-white text-xl">Log a Referral</CardTitle>
        <CardDescription className="text-[#8A8A8A]">
          Submitting as <span className="text-white font-medium">{submitterName}</span>
        </CardDescription>
      </CardHeader>

      {partnerError && (
        <div className="mx-6 mb-2 flex items-start gap-2 rounded-lg border border-[#FF4444]/30 bg-[#FF4444]/8 px-4 py-3 text-sm text-[#FF4444]">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">HubSpot connection error</p>
            <p className="mt-0.5 text-[#FF4444]/80">{partnerError}</p>
          </div>
        </div>
      )}

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Lead Info ──────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#8A8A8A]">Lead Info</p>

            {/* Email — always visible, drives everything */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white text-sm">
                Email <span className="text-[#FF4444]">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    triggerEmailLookup(e.target.value)
                  }}
                  required
                  placeholder="jane@company.com"
                  className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] pr-8"
                />
                {emailState === 'loading' && (
                  <Loader2 className="size-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A8A] animate-spin" />
                )}
              </div>
            </div>

            {/* Contact matched */}
            {contactKnown && matchedContact && (
              <MatchCard
                icon={UserCheck}
                label="Existing Contact"
                rows={[
                  { key: 'Name',  value: `${matchedContact.firstName} ${matchedContact.lastName}`.trim() || null },
                  { key: 'Email', value: matchedContact.email },
                  { key: 'Owner', value: matchedContact.ownerName },
                ]}
              />
            )}

            {/* New contact — name fields only shown when contact not found */}
            {needsName && (
              <>
                <NewCard icon={UserPlus} label="New Contact" note="Will be created in HubSpot" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-white text-sm">
                      First Name <span className="text-[#FF4444]">*</span>
                    </Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      placeholder="Jane"
                      className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-white text-sm">
                      Last Name <span className="text-[#FF4444]">*</span>
                    </Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      placeholder="Smith"
                      className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Company matched */}
            {companyKnown && matchedCompany && (
              <MatchCard
                icon={Building2}
                label="Existing Company"
                rows={[
                  { key: 'Name',   value: matchedCompany.name },
                  { key: 'Domain', value: matchedCompany.domain || null },
                  { key: 'Owner',  value: matchedCompany.ownerName },
                ]}
                note={
                  contactKnown && !matchedContact?.associatedCompanyId
                    ? 'Contact will be associated with this company'
                    : emailState === 'not-found'
                      ? 'New contact will be associated with this company'
                      : undefined
                }
              />
            )}

            {/* Company lookup spinner */}
            {companyState === 'loading' && (
              <div className="flex items-center gap-2 text-xs text-[#8A8A8A]">
                <Loader2 className="size-3 animate-spin" />
                Looking up company…
              </div>
            )}

            {/* Company fields — shown when company not yet found and we need it */}
            {showCompanyFields && companyState !== 'found' && (
              <>
                {companyState === 'not-found' && (
                  <NewCard icon={PlusCircle} label="New Company" note="Will be created in HubSpot" />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName" className="text-white text-sm">
                      Company <span className="text-[#FF4444]">*</span>
                    </Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value)
                        triggerCompanyLookup(companyDomain, e.target.value)
                      }}
                      required={needsCompany}
                      placeholder="Acme Corp"
                      className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="companyDomain" className="text-white text-sm">Website</Label>
                    <div className="relative">
                      <Input
                        id="companyDomain"
                        value={companyDomain}
                        onChange={(e) => {
                          setCompanyDomain(e.target.value)
                          triggerCompanyLookup(e.target.value, companyName)
                        }}
                        placeholder="acme.com"
                        className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] pr-8"
                      />
                      {companyState === 'loading' && (
                        <Loader2 className="size-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A8A] animate-spin" />
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Partner Selection (only shown once we know who the lead is) ─── */}
          {(contactKnown || needsName) && (
            <div className="space-y-3">
              <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#8A8A8A]">
                Refer to Partner <span className="text-[#FF4444]">*</span>
              </p>
              <PartnerPicker
                partners={partners}
                selected={selectedPartnerIds}
                onChange={setSelectedPartnerIds}
              />
            </div>
          )}

          {/* ── Notes ──────────────────────────────────────────────────────── */}
          {(contactKnown || needsName) && (
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-white text-sm">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context about this lead or referral…"
                rows={3}
                className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] resize-none"
              />
            </div>
          )}

          {/* ── Status feedback ─────────────────────────────────────────────── */}
          {submitState === 'success' && (
            <div className="flex items-center gap-2 text-[#60FF80] text-sm">
              <CheckCircle className="size-4 shrink-0" />
              Referral logged successfully in HubSpot.
            </div>
          )}
          {submitState === 'error' && (
            <div className="flex items-center gap-2 text-[#FF4444] text-sm">
              <AlertCircle className="size-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Submit — only shown once the form has enough info */}
          {(contactKnown || needsName) && (
            <Button
              type="submit"
              disabled={submitState === 'loading' || !canSubmit}
              className="w-full bg-[#60FDFF] text-black font-bold hover:bg-[#60FDFF]/90 disabled:opacity-40"
            >
              {submitState === 'loading' ? (
                <><Loader2 className="size-4 mr-2 animate-spin" /> Logging Referral…</>
              ) : (
                'Log Referral'
              )}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
