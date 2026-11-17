import { useEffect, useState } from 'react'

type ScreeningSummary = { candidates: number; passed: number; blocked: number }

export default function PremiumScreening() {
  const [summary, setSummary] = useState<ScreeningSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/.netlify/functions/omnisight-screening-summary', {
          headers: { accept: 'application/json' },
        })
        if (!response.ok) throw new Error('SUMMARY_UNAVAILABLE')
        const data = await response.json() as ScreeningSummary
        if (!active) return
        if (![data.candidates, data.passed, data.blocked].every(Number.isInteger) ||
            data.candidates < 0 || data.passed < 0 || data.blocked < 0) {
          throw new Error('INVALID_SUMMARY')
        }
        setSummary(data)
      } catch {
        if (active) setError('Public screening totals are unavailable. Unapproved source records remain hidden by database security policies.')
      } finally {
        if (active) setLoading(false)
      }
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
        <Metric label="CANDIDATES" value={loading || !summary ? '—' : summary.candidates.toLocaleString()} />
        <Metric label="AUTO-PASSED" value={loading || !summary ? '—' : summary.passed.toLocaleString()} />
        <Metric label="BLOCKED / REVIEW" value={loading || !summary ? '—' : summary.blocked.toLocaleString()} />
      </div>
      {loading ? (
        <p className="mt-4 rounded-lg border border-white/10 p-5 text-center text-xs text-white/45">LOADING VERIFIED SCREENING SUMMARY...</p>
      ) : error ? (
        <p role="status" className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-relaxed text-amber-100/80">{error}</p>
      ) : (
        <p className="mt-4 rounded-lg border border-white/10 p-4 text-xs text-white/55">Summary only. Individual candidate records are not exposed here. Passing a technical screen never publishes a lot automatically.</p>
      )}
      <p className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-relaxed text-white/35">Automated screening is not final approval. Passing lots still require source, valuation, data-rights, and human review before publication. This panel does not publish or modify any auction listing.</p>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-white/10 bg-white/[0.025] p-3"><p className="text-[8px] font-bold tracking-widest text-white/40">{label}</p><p className="mt-1 text-xl font-black text-[#D4AF37]">{value}</p></div>
}
