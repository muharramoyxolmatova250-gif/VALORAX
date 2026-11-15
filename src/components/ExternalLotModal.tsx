import { motion } from 'framer-motion'
import { ArrowUpRight, Clock, ShieldCheck, X, Activity } from 'lucide-react'
import type { AuctionLot } from '../types'

interface Props {
  lot: AuctionLot | null
  open: boolean
  onClose: () => void
}

const GOLD = '#D4AF37'

export default function ExternalLotModal({ lot, open, onClose }: Props) {
  if (!open || !lot) return null

  const price = lot.currentBid > 0 ? lot.currentBid : lot.publishedValueUsd || 0
  const priceLabel = lot.currentBid > 0 ? 'SOURCE-REPORTED CURRENT BID' : 'SOURCE-PUBLISHED VALUE'
  const aiLabel = lot.aiStatus === 'completed' ? 'ANALYSIS COMPLETE'
    : lot.aiStatus === 'partial' ? 'PARTIAL ANALYSIS'
    : lot.aiStatus === 'running' ? 'ANALYSIS IN PROGRESS'
    : lot.aiStatus === 'queued' ? 'ANALYSIS QUEUED'
    : lot.aiStatus === 'failed' ? 'ANALYSIS FAILED'
    : 'AWAITING ANALYSIS'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-3 sm:p-6"
      role="dialog" aria-modal="true" aria-label={lot.title}>
      <motion.button aria-label="Close lot details" className="absolute inset-0 bg-black/85 backdrop-blur-md"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.section initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }}
        className="relative z-10 my-auto w-full max-w-2xl overflow-hidden rounded-xl"
        style={{ background: '#0B0B0D', border: '1px solid rgba(212,175,55,.28)', boxShadow: '0 25px 100px rgba(0,0,0,.65)' }}>
        <header className="flex items-center justify-between border-b border-[#D4AF37]/15 px-5 py-4">
          <div>
            <p className="text-[9px] font-bold tracking-[.28em]" style={{ color: GOLD }}>VALORAX · GLOBAL LOT INTELLIGENCE</p>
            <p className="mt-1 text-[10px] tracking-widest text-white/40">{lot.source || 'EXTERNAL AUCTION SOURCE'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full border border-white/10 p-2 text-white/60 hover:text-white"><X size={16}/></button>
        </header>

        <div className="max-h-[78vh] overflow-y-auto">
          <div className="relative aspect-[16/9] bg-[#141416]">
            {lot.image ? <img src={lot.image} alt={lot.title} referrerPolicy="no-referrer" className="h-full w-full object-cover"
              onError={event => { event.currentTarget.style.display = 'none' }} /> :
              <div className="flex h-full items-center justify-center text-5xl text-[#D4AF37]/40">◇</div>}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-transparent to-transparent"/>
            <div className="absolute bottom-5 left-5 right-5">
              <div className="mb-2 inline-flex items-center gap-2 rounded border border-emerald-400/25 bg-black/60 px-2 py-1 text-[9px] font-bold tracking-widest text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> LIVE LISTING
              </div>
              <h2 className="text-2xl font-black text-white sm:text-3xl">{lot.title}</h2>
              <p className="mt-1 text-xs text-white/55">{lot.subtitle}</p>
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[#D4AF37]/15 bg-[#D4AF37]/[.035] p-4">
                <p className="text-[8px] font-bold tracking-widest text-[#D4AF37]/65">{priceLabel}</p>
                <p className="mt-2 text-xl font-black text-[#D4AF37]">{price > 0 ? '$' + price.toLocaleString() : 'Not provided'}</p>
                <p className="mt-1 text-[9px] text-white/35">{lot.currency || 'Source currency not confirmed'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[.025] p-4">
                <p className="text-[8px] font-bold tracking-widest text-white/40">AUCTION TIME LEFT</p>
                <p className="mt-2 text-xl font-black text-white">{lot.secondsLeft > 0 ? formatTime(lot.secondsLeft) : 'Not provided'}</p>
                <p className="mt-1 text-[9px] text-white/35">Source-reported timing</p>
              </div>
            </div>

            <div className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[.035] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-[#D4AF37]"><Activity size={13}/> OMNISIGHT AI</div>
                <span className="text-[8px] font-bold tracking-widest text-white/55">{aiLabel}</span>
              </div>
              {lot.aiSummary ? <p className="text-sm leading-6 text-white/75">{lot.aiSummary}</p>
                : <p className="text-xs leading-5 text-white/40">This lot has not received a completed OMNISIGHT report yet. VALORAX will not present an unrun analysis as a finding.</p>}
              {lot.aiVerdict && <div className="mt-3 border-t border-white/10 pt-3 text-[10px] tracking-widest text-white/60">
                RESEARCH VERDICT: <strong className={lot.aiVerdict === 'GOOD' ? 'text-emerald-300' : lot.aiVerdict === 'BAD' ? 'text-rose-300' : 'text-amber-300'}>{lot.aiVerdict}</strong>
              </div>}
            </div>

            {lot.summary && <div>
              <p className="mb-2 text-[9px] font-bold tracking-widest text-white/40">LISTING DETAILS</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-white/70">{lot.summary}</p>
            </div>}

            <div className="flex items-center gap-2 text-[9px] text-white/35">
              <ShieldCheck size={13} className="text-[#D4AF37]"/>
              Source-linked listing · OMNISIGHT findings are research, not authentication.
            </div>
            {lot.sourceUrl ? <a href={lot.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-md py-4 text-[10px] font-black tracking-[.2em] text-black transition hover:brightness-110"
              style={{ background: 'linear-gradient(120deg,#E4C45A,#B58A20)' }}>
              OPEN ORIGINAL AUCTION <ArrowUpRight size={14}/>
            </a> : <p className="rounded border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200/70">Original auction link is not available for this record.</p>}
          </div>
        </div>
      </motion.section>
    </div>
  )
}

function formatTime(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days > 0 ? days + 'd ' + hours + 'h' : hours + 'h ' + minutes + 'm'
}
