'use client'

import { useMemo, useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { COMPANY_TYPE_LABELS, COMPANY_TYPE_ORDER } from '@/lib/hubspot/client'

export type PickerPartner = {
  id: string
  name: string
  companyType: string | null
}

type Props = {
  partners: PickerPartner[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function PartnerPicker({ partners, selected, onChange }: Props) {
  const [search, setSearch]             = useState('')
  const [openCategories, setOpenCategories] = useState<string[]>([])

  // ── Filtered partners by search ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return q ? partners.filter((p) => p.name.toLowerCase().includes(q)) : partners
  }, [partners, search])

  // ── Groups: ordered category key → partners ──────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, PickerPartner[]>()
    for (const key of COMPANY_TYPE_ORDER) map.set(key, [])
    map.set('__other__', [])
    for (const p of filtered) {
      const key = p.companyType ?? '__other__'
      if (map.has(key)) map.get(key)!.push(p)
      else map.set(key, [p])
    }
    return Array.from(map.entries()).filter(([, ps]) => ps.length > 0)
  }, [filtered])

  // ── Search: auto-expand matching categories; collapse all on clear ────────────
  useEffect(() => {
    setOpenCategories(search.trim() ? groups.map(([key]) => key) : [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const toggle   = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const deselect = (id: string) => onChange(selected.filter((x) => x !== id))

  const categoryLabel = (key: string) =>
    key === '__other__' ? 'Other' : (COMPANY_TYPE_LABELS[key] ?? key)

  // Selected count per category (across all partners, not just filtered)
  const selectedByCategory = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of partners) {
      if (selected.includes(p.id)) {
        const key = p.companyType ?? '__other__'
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
    return counts
  }, [partners, selected])

  const selectedPartners = useMemo(
    () => partners.filter((p) => selected.includes(p.id)),
    [partners, selected],
  )

  return (
    <div className="space-y-3">
      {/* Search */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search partners…"
        className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
      />

      {/* Selected summary strip */}
      {selectedPartners.length > 0 && (
        <div className="rounded-lg border border-[#60FDFF]/20 bg-[#60FDFF]/5 px-3 py-2.5">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#60FDFF] mb-2">
            {selectedPartners.length} selected
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedPartners.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-md bg-[#60FDFF]/15 border border-[#60FDFF]/30 px-2 py-0.5 text-xs font-medium text-[#60FDFF]"
              >
                {p.name}
                <button
                  type="button"
                  onClick={() => deselect(p.id)}
                  className="ml-0.5 rounded hover:text-white transition-colors"
                  aria-label={`Remove ${p.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Accordion */}
      {groups.length === 0 ? (
        <p className="text-sm text-[#8A8A8A] px-1">No matching partners.</p>
      ) : (
        <Accordion
          value={openCategories}
          onValueChange={setOpenCategories}
          className="space-y-1"
        >
          {groups.map(([key, ps]) => {
            const selCount = selectedByCategory[key] ?? 0

            return (
              <AccordionItem
                key={key}
                value={key}
                className="rounded-lg border border-white/8 bg-[#1a1a1a] overflow-hidden data-open:border-white/20"
              >
                <AccordionTrigger className="px-4 py-3 hover:bg-white/4 hover:no-underline transition-colors">
                  <div className="flex items-center justify-between w-full gap-3 pr-2">
                    <span className="text-sm font-medium text-white">
                      {categoryLabel(key)}
                    </span>
                    <div className="flex items-center gap-2">
                      {selCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#60FDFF]/15 border border-[#60FDFF]/30 px-2 py-0.5 text-[10px] font-bold text-[#60FDFF]">
                          <Check className="size-2.5" />
                          {selCount}
                        </span>
                      )}
                      <span className="text-[11px] text-[#8A8A8A]">{ps.length}</span>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4 pt-0">
                  <div className="flex flex-wrap gap-2 pt-2">
                    {ps.map((p) => {
                      const active = selected.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggle(p.id)}
                          className={[
                            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            active
                              ? 'bg-[#60FDFF]/15 text-[#60FDFF] border border-[#60FDFF]/40'
                              : 'bg-[#272727] text-white border border-white/8 hover:border-white/20 hover:bg-white/6',
                          ].join(' ')}
                        >
                          {active && <Check className="size-3 shrink-0" />}
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}
