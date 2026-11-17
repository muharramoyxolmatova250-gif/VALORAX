import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type ScreeningLot = {
  id: string
  title: string
  canonical_url: string | null
  premium_category: string | null
  listing_status: string | null
  screening_value_usd: number | null
  currency: string | null
  screening_result: string
  passes_automated_screen: boolean
  verification_status: string
  data_use_status: string
}

const categoryLabels: Record<string, string> = {
  hypercars_and_luxury_cars: 'HYPERCARS & LUXURY CARS',
  yachts: 'YACHTS',
  private_aircraft: 'PRIVATE AIRCRAFT',
  luxury_real_estate: 'LUXURY REAL ESTATE',
  rare_watches: 'RARE WATCHES',
  art_and_collectibles: 'ART & COLLECTIBLES',
}

const resultLabels: Record<string, string> = {
  missing_verified_usd_value: 'VALUE NOT VERIFIED',
  below_500k: 'BELOW $500K',
  missing_value_source: 'VALUE SOURCE MISSING',
  source_not_verified: 'SOURCE NOT VERIFIED',
  data_rights_not_cleared: 'DATA RIGHTS REVIEW',
  not_active_or_upcoming: 'NOT CURRENTLY LISTED',
  eligible_for_manual_final_review: 'READY FOR FINAL REVIEW',
  not_premium_category: 'NOT A PREMIUM CATEGORY',
}

export default function PremiumScreening() {
  const [lots, setLots] = useState<ScreeningLot[]>([])
  const [total, setTotal] = useState(0)
  const [passed, setPassed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      const { data, error: queryError, count } = await supabase
        .from('omnisight_premium_screening')
        .select('id,title,canonical_url,premium_category,listing_status,screening_value_usd,currency,screening_result,passes_automated_screen,verification_status,data_use_status', { count: 'exact' })
        .not('premium_category', 'is', null)
        .order('title', { ascending: true })
        .limit(100)

      if (!active) return
      if (queryError) {
        setError('Could not load screening results. Check the view permissions and Supabase read access.')
        setLoading(false)
        return
      }

      const rows = (data || []) as ScreeningLot[]
      setLots(rows)
      setTotal(count ?? rows.length)
      setPassed(rows.filter(row => row.passes_automated_screen).length)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  return (
    <section className="mb-6 rounded-xl border border-[#D4AF37]/25 bg-[#111113] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black tracking-[0.24em] text-[#D4AF37]">OMNISIGHT · AUTOMATED GATE</p>
          <h2 className="mt-1 text-sm font-black tracking-widest text-white">PREMIUM LOT SCREENING</h2>
          <p className="mt-1 text-xs text-white/45">Only independently sourced USD values of at least $500,000 can pass this gate.</p>
        </div>
        <span className="rounded border border-[#D4AF37]/30 px-3 py-2 text-[9px] font-bold tracking-widest text-[#D4AF37]">MINIMUM VALUE · $500K</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="CANDIDATES" value={total.toLocaleString()} />
        <Metric label="AUTO-PASSED" value={passed.toLocaleString()} />
        <Metric label="BLOCKED / REVIEW" value={Math.max(total - passed, 0).toLocaleString()} />
      </div>

      {loading ? (
        <p className="mt-4 rounded-lg border border-white/10 p-5 text-center text-xs text-white/45">LOADING PREMIUM SCREENING...</p>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100/80">{error}</p>
      ) : lots.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-white/45">No premium-category candidates found yet. Existing source records remain unchanged.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {lots.map(lot => (
            <article key={lot.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-white">{lot.title}</h3>
                  <p className="mt-1 text-[9px] tracking-wider text-[#D4AF37]/75">{categoryLabels[lot.premium_category || ''] || 'PREMIUM CANDIDATE'}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-[9px] font-bold tracking-wider ${lot.passes_automated_screen ? 'border-emerald-400/30 text-emerald-200' : 'border-amber-300/25 text-amber-200'}`}>
                  {resultLabels[lot.screening_result] || lot.screening_result.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-white/45">
                <span>VALUE: {lot.screening_value_usd == null ? 'NOT VERIFIED' : '$' + Number(lot.screening_value_usd).toLocaleString('en-US')}</span>
                <span>STATUS: {(lot.listing_status || 'unknown').toUpperCase()}</span>
                <span>CHECK: {lot.verification_status.replace(/_/g, ' ').toUpperCase()}</span>
              </div>
              {lot.canonical_url && <a href={lot.canonical_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] text-[#D4AF37] hover:underline">OPEN ORIGINAL SOURCE ↗</a>}
            </article>
          ))}
          {total > lots.length && <p className="text-center text-[10px] text-white/35">Showing {lots.length} of {total} candidates.</p>}
        </div>
      )}
      <p className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-relaxed text-white/35">Automated screening is not final approval. Passing lots still require a human review before publication. This panel does not publish or modify any auction listing.</p>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-white/10 bg-white/[0.025] p-3"><p className="text-[8px] font-bold tracking-widest text-white/40">{label}</p><p className="mt-1 text-xl font-black text-[#D4AF37]">{value}</p></div>
}
