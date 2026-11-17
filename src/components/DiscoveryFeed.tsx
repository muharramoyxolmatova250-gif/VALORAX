import { useEffect, useState } from 'react'
import { ExternalLink, Radar, ShieldAlert } from 'lucide-react'

type Discovery = {
  id: string
  title: string
  canonical_url: string
  source_title: string | null
  asset_class: string
  short_factual_summary: string | null
  listing_status: string
  verification_status: string
  data_use_status: string
  first_seen_at: string
  last_seen_at: string
}

const label = (value: string) => value.replaceAll('_', ' ').toUpperCase()

export default function DiscoveryFeed() {
  const [items, setItems] = useState<Discovery[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/api/discoveries')
        if (!response.ok) throw new Error('Discovery API unavailable')
        const data = await response.json()
        if (active) {
          setItems(Array.isArray(data) ? data : [])
          setFailed(false)
        }
      } catch {
        if (active) setFailed(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[.25em] text-[#D4AF37]/70">OMNISIGHT · GLOBAL WEB DISCOVERY</p>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Recently Discovered</h2>
          <p className="mt-2 max-w-2xl text-xs text-white/40">New auction-related pages found across the public web. Every item remains a research lead until its listing, value and usage rights are checked.</p>
        </div>
        <div className="flex items-center gap-2 rounded border border-[#D4AF37]/20 bg-[#D4AF37]/[.04] px-3 py-2 text-[9px] font-bold tracking-widest text-[#D4AF37]">
          <Radar size={12} /> {items.length} DISCOVERY LEADS
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-white/[.02] p-8 text-center text-xs text-white/40">Loading latest discoveries…</div>
      ) : failed ? (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[.04] p-6 text-center text-xs text-amber-200/70">Discovery feed is temporarily unavailable. The main auction catalogue is unaffected.</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[.02] p-8 text-center text-xs text-white/40">No recent discovery leads yet. OmniSight will show new results here as they arrive.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => (
            <article key={item.id} className="rounded-lg border border-[#D4AF37]/15 bg-[#111113] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="rounded border border-[#D4AF37]/20 bg-[#D4AF37]/[.05] px-2 py-1 text-[8px] font-bold tracking-widest text-[#D4AF37]">{label(item.asset_class)}</span>
                <span className="inline-flex items-center gap-1 text-[8px] font-bold tracking-widest text-amber-300/80"><ShieldAlert size={10}/> REVIEW REQUIRED</span>
              </div>
              <h3 className="line-clamp-2 text-sm font-bold leading-5 text-white">{item.title}</h3>
              <p className="mt-2 text-[10px] text-white/35">{item.source_title || new URL(item.canonical_url).hostname} · {new Date(item.last_seen_at).toLocaleString()}</p>
              {item.short_factual_summary && <p className="mt-3 line-clamp-3 text-xs leading-5 text-white/55">{item.short_factual_summary}</p>}
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[.06] pt-3">
                <span className="text-[8px] font-bold tracking-widest text-white/30">{label(item.listing_status)} · {label(item.verification_status)}</span>
                <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[9px] font-black tracking-widest text-[#D4AF37] hover:text-white">OPEN SOURCE <ExternalLink size={10}/></a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
