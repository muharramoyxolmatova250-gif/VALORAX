import { useEffect, useState } from 'react'
import { ExternalLink, Radar, ShieldCheck, ShieldAlert, Clock3 } from 'lucide-react'

type Discovery = {
  id: string
  title: string
  canonical_url: string
  source_title: string | null
  auction_house: string | null
  asset_class: string
  short_factual_summary: string | null
  listing_status: string
  verification_status: string
  data_use_status: string
  published_value_usd: number | null
  currency: string | null
  estimate_low: number | null
  estimate_high: number | null
  value_checked_at: string | null
  first_seen_at: string
  last_seen_at: string
  image_urls: string[] | null
  image_usage_status: string
}

const label = (value: string) => (value || 'unknown').replaceAll('_', ' ').toUpperCase()
const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : 'Price not verified'

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
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
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
          <p className="mt-2 max-w-2xl text-xs text-white/40">High-value auction leads with a checked USD value of at least $500,000. Review status is shown transparently; these are not yet published Live Lots.</p>
        </div>
        <div className="flex items-center gap-2 rounded border border-[#D4AF37]/20 bg-[#D4AF37]/[.04] px-3 py-2 text-[9px] font-bold tracking-widest text-[#D4AF37]">
          <Radar size={12} /> {items.length} QUALIFIED LEADS
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-white/[.02] p-8 text-center text-xs text-white/40">Loading latest discoveries…</div>
      ) : failed ? (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[.04] p-6 text-center text-xs text-amber-200/70">Discovery feed is temporarily unavailable. The main auction catalogue is unaffected.</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[#D4AF37]/15 bg-[#111113] p-10 text-center">
          <div className="mb-3 text-3xl text-[#D4AF37]/50">◇</div>
          <p className="text-sm font-bold text-white/60">No qualified discovery leads yet</p>
          <p className="mt-2 text-[10px] text-white/30">Only current listings with a checked value of $500,000 or more appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => {
            const imagesAllowed = ['licensed', 'permission_granted'].includes(item.image_usage_status)
            const image = imagesAllowed && Array.isArray(item.image_urls)
              ? item.image_urls.find(url => typeof url === 'string' && /^https?:\\/\\//i.test(url))
              : undefined
            const value = Number(item.published_value_usd)
            const verifiedValue = Number.isFinite(value) && value >= 500_000 && Boolean(item.value_checked_at)
            const house = item.auction_house || item.source_title || new URL(item.canonical_url).hostname
            const isUpcoming = item.listing_status === 'upcoming'
            return (
              <article key={item.id} className="group overflow-hidden rounded-xl border border-[#D4AF37]/15 bg-[#111113] transition duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/35 hover:shadow-[0_18px_50px_rgba(212,175,55,0.10)]">
                <div className="relative h-52 overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(212,175,55,0.14),transparent_42%),linear-gradient(145deg,#171719,#080809)]">
                  {image ? (
                    <img src={image} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center">
                      <span className="text-5xl text-[#D4AF37]/50">◇</span>
                      <span className="mt-3 text-[8px] font-bold tracking-[.28em] text-[#D4AF37]/45">VALORAX PRIVATE VAULT</span>
                      <span className="mt-1 text-[8px] tracking-widest text-white/20">IMAGE NOT CLEARED</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-transparent to-transparent" />
                  <span className="absolute left-3 top-3 rounded-sm border border-[#D4AF37]/30 bg-black/70 px-2.5 py-1 text-[8px] font-black tracking-widest text-[#D4AF37]">{label(item.asset_class)}</span>
                  <span className={`absolute right-3 top-3 rounded-sm border px-2 py-1 text-[8px] font-black tracking-widest ${isUpcoming ? 'border-sky-300/25 bg-sky-400/10 text-sky-200' : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-300'}`}>{isUpcoming ? 'UPCOMING' : label(item.listing_status)}</span>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="line-clamp-2 text-lg font-black leading-tight text-white">{item.title}</h3>
                    <p className="mt-1 line-clamp-1 text-[10px] text-white/45">{house}</p>
                  </div>
                </div>
                <div className="space-y-4 p-4">
                  <div className="rounded-sm border border-[#D4AF37]/15 bg-[#D4AF37]/[.035] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[8px] font-bold tracking-widest text-[#D4AF37]/70">CHECKED VALUE · USD</p>
                      {verifiedValue ? <ShieldCheck size={12} className="text-emerald-400" /> : <ShieldAlert size={12} className="text-amber-300" />}
                    </div>
                    <p className="mt-1 text-xl font-black text-[#D4AF37]">{verifiedValue ? money(value) : 'Not verified'}</p>
                    {item.estimate_low != null && item.estimate_high != null && (
                      <p className="mt-1 text-[9px] text-white/35">Estimate: {money(item.estimate_low)} – {money(item.estimate_high)}</p>
                    )}
                  </div>
                  {item.short_factual_summary && <p className="line-clamp-3 text-xs leading-5 text-white/50">{item.short_factual_summary}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[.06] pt-3">
                    <span className="inline-flex items-center gap-1 text-[8px] font-bold tracking-widest text-amber-200/70"><ShieldAlert size={10}/> {label(item.data_use_status)}</span>
                    <span className="inline-flex items-center gap-1 text-[8px] text-white/30"><Clock3 size={10}/> {item.value_checked_at ? 'VALUE CHECKED' : 'CHECK PENDING'}</span>
                  </div>
                  <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-md border border-[#D4AF37]/45 bg-[#D4AF37]/[.07] px-3 py-3 text-[9px] font-black tracking-[.18em] text-[#D4AF37] transition hover:bg-[#D4AF37] hover:text-black">
                    VIEW ORIGINAL LOT <ExternalLink size={11}/>
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
