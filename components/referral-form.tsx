'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle, Loader2, AlertCircle, UserCheck, Building2 } from 'lucide-react'
import { PartnerPicker } from '@/components/partner-picker'
import type { PickerPartner } from '@/components/partner-picker'
import type { ContactMatch, CompanyMatch } from '@/lib/hubspot/client'

type Props = {
  partners: PickerPartner[]
  partnerError?: string
  submitterName: string
}

type FormState = {
  firstName: string
  lastName: string
  email: string
  companyName: string
  companyDomain: string
  notes: string
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  companyName: '',
  companyDomain: '',
  notes: '',
}

export function ReferralForm({ partners, partnerError, submitterName }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Live HubSpot match state
  const [matchedContact, setMatchedContact] = useState<ContactMatch | null>(null)
  const [matchedCompany, setMatchedCompany] = useState<CompanyMatch | null>(null)
  const [lookingUpContact, setLookingUpContact] = useState(false)
  const [lookingUpCompany, setLookingUpCompany] = useState(false)

  // Debounce refs
  const contactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const companyTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }))

  // ── Live contact lookup ──────────────────────────────────────────────────────
  const lookupContact = useCallback((email: string) => {
    if (contactTimer.current) clearTimeout(contactTimer.current)
    if (!email.includes('@')) { setMatchedContact(null); return }

    contactTimer.current = setTimeout(async () => {
      setLookingUpContact(true)
      try {
        const res = await fetch(`/api/lookup?email=${encodeURIComponent(email)}`)
        const data = await res.json() as { contact: ContactMatch | null }
        if (data.contact) {
          setMatchedContact(data.contact)
          setForm((f) => ({
            ...f,
            firstName:   f.firstName   || data.contact!.firstName,
            lastName:    f.lastName    || data.contact!.lastName,
            companyName: f.companyName || data.contact!.company,
          }))
        } else {
          setMatchedContact(null)
        }
      } catch { setMatchedContact(null) }
      finally  { setLookingUpContact(false) }
    }, 600)
  }, [])

  // ── Live company lookup ──────────────────────────────────────────────────────
  const lookupCompany = useCallback((domain: string, name: string) => {
    if (companyTimer.current) clearTimeout(companyTimer.current)
    const query = domain.trim() || name.trim()
    if (!query) { setMatchedCompany(null); return }

    companyTimer.current = setTimeout(async () => {
      setLookingUpCompany(true)
      try {
        const params = domain.trim()
          ? `domain=${encodeURIComponent(domain.trim())}`
          : `name=${encodeURIComponent(name.trim())}`
        const res  = await fetch(`/api/lookup?${params}`)
        const data = await res.json() as { company: CompanyMatch | null }
        if (data.company) {
          setMatchedCompany(data.company)
          setForm((f) => ({
            ...f,
            companyName:   f.companyName   || data.company!.name,
            companyDomain: f.companyDomain || data.company!.domain,
          }))
        } else {
          setMatchedCompany(null)
        }
      } catch { setMatchedCompany(null) }
      finally  { setLookingUpCompany(false) }
    }, 600)
  }, [])

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedPartnerIds.length === 0) return

    setStatus('loading')
    setErrorMsg('')

    const selectedPartners = partners.filter((p) => selectedPartnerIds.includes(p.id))

    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          partnerIds:   selectedPartnerIds,
          partnerNames: selectedPartners.map((p) => p.name),
          existingContactId: matchedContact?.id,
          existingCompanyId: matchedCompany?.id,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(data.error ?? 'Something went wrong')
      }

      setStatus('success')
      setForm(EMPTY)
      setSelectedPartnerIds([])
      setMatchedContact(null)
      setMatchedCompany(null)
      router.refresh()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
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

            {/* Email first — drives the live lookup */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white text-sm">
                Email <span className="text-[#FF4444]">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    set('email')(e)
                    lookupContact(e.target.value)
                  }}
                  required
                  placeholder="jane@company.com"
                  className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] pr-8"
                />
                {lookingUpContact && (
                  <Loader2 className="size-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A8A] animate-spin" />
                )}
              </div>
              {matchedContact && (
                <p className="flex items-center gap-1.5 text-xs text-[#60FDFF]">
                  <UserCheck className="size-3.5 shrink-0" />
                  Matched existing contact: {matchedContact.firstName} {matchedContact.lastName}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-white text-sm">
                  First Name <span className="text-[#FF4444]">*</span>
                </Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={set('firstName')}
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
                  value={form.lastName}
                  onChange={set('lastName')}
                  required
                  placeholder="Smith"
                  className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-white text-sm">
                  Company <span className="text-[#FF4444]">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="companyName"
                    value={form.companyName}
                    onChange={(e) => {
                      set('companyName')(e)
                      lookupCompany(form.companyDomain, e.target.value)
                    }}
                    required
                    placeholder="Acme Corp"
                    className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyDomain" className="text-white text-sm">Website</Label>
                <div className="relative">
                  <Input
                    id="companyDomain"
                    value={form.companyDomain}
                    onChange={(e) => {
                      set('companyDomain')(e)
                      lookupCompany(e.target.value, form.companyName)
                    }}
                    placeholder="acme.com"
                    className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] pr-8"
                  />
                  {lookingUpCompany && (
                    <Loader2 className="size-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A8A] animate-spin" />
                  )}
                </div>
              </div>
            </div>

            {matchedCompany && (
              <p className="flex items-center gap-1.5 text-xs text-[#60FDFF]">
                <Building2 className="size-3.5 shrink-0" />
                Matched existing company: {matchedCompany.name}
                {matchedCompany.domain ? ` (${matchedCompany.domain})` : ''}
              </p>
            )}
          </div>

          {/* ── Partner Selection ───────────────────────────────────────────── */}
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

          {/* ── Notes ──────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-white text-sm">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={set('notes')}
              placeholder="Context about this lead or referral…"
              rows={3}
              className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] resize-none"
            />
          </div>

          {/* ── Status feedback ─────────────────────────────────────────────── */}
          {status === 'success' && (
            <div className="flex items-center gap-2 text-[#60FF80] text-sm">
              <CheckCircle className="size-4 shrink-0" />
              Referral logged successfully in HubSpot.
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-[#FF4444] text-sm">
              <AlertCircle className="size-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <Button
            type="submit"
            disabled={status === 'loading' || selectedPartnerIds.length === 0}
            className="w-full bg-[#60FDFF] text-black font-bold hover:bg-[#60FDFF]/90 disabled:opacity-40"
          >
            {status === 'loading' ? (
              <><Loader2 className="size-4 mr-2 animate-spin" /> Logging Referral…</>
            ) : (
              'Log Referral'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
