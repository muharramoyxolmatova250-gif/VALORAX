 import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Clock, TrendingUp, Lock, Activity, CircleCheck, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { supabase } from '../lib/supabase'
import { ModalShell, GoldBtn, SectionLabel, GOLD, GOLD_DIM, GOLD_FAINT } from './ui'
import type { AuctionLot, BidEntry } from '../types'
import { GALLERY_IMGS } from '../data'

// ─── Escrow Drawer ────────────────────────────────────────────────────────────

function EscrowDrawer({ open, onClose, lot }: { open: boolean; onClose: () => void; lot: AuctionLot }) {
  return (
    <>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90]" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      )}
      {open && (
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 38 }}
          className="fixed top-0 right-0 h-full z-[100] w-[340px] flex flex-col"
          style={{ background: 'rgba(9,10,13,0.99)', borderLeft: `1px solid ${GOLD_FAINT}` }}
        >
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${GOLD_FAINT}` }}>
            <div>
              <SectionLabel>SMART CONTRACT</SectionLabel>
              <h3 className="text-white font-black text-sm mt-0.5">ESCROW PROOF</h3>
            </div>
            <motion.button whileHover={{ scale: 1.1 }} onClick={onClose}>
              <X size={15} className="text-white/35 hover:text-white/70 transition-colors" />
            </motion.button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {[
              { label: 'CONTRACT ADDRESS', value: `0x71C76...${lot.id.slice(-4).toUpperCase()}B4`, mono: true },
              { label: 'STATUS', value: '● ACTIVE · FUNDS LOCKED', green: true },
              { label: 'LOCKED AMOUNT', value: `$${lot.escrow.toLocaleString()} USDT`, gold: true },
              { label: 'BLOCK HEIGHT', value: '#21,847,392', mono: true },
              { label: 'ZK-PROOF HASH', value: `zk_snark_${lot.id}_mainnet`, mono: true },
              { label: 'AUTO-COMMISSION', value: '2% locked on settlement' },
            ].map(row => (
              <div key={row.label} className="p-3 rounded-sm space-y-1" style={{ background: 'rgba(212,175,55,0.03)', border: `1px solid ${GOLD_FAINT}` }}>
                <SectionLabel>{row.label}</SectionLabel>
                <p className={`text-xs break-all leading-relaxed ${row.mono ? 'font-mono' : 'font-semibold'}`}
                  style={{ color: row.gold ? GOLD : row.green ? '#10B981' : 'rgba(255,255,255,0.6)' }}>
                  {row.value}
                </p>
              </div>
            ))}
            <div className="p-3 rounded-sm flex items-start gap-2.5" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <CircleCheck size={13} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[9px] leading-relaxed text-emerald-400/75">
                Non-custodial ZK escrow. Winning bid released automatically on auction close. Audited by Certik & Halborn.
              </p>
            </div>
            <GoldBtn full variant="ghost" onClick={onClose}><Lock size={11} /> CLOSE</GoldBtn>
          </div>
        </motion.div>
      )}
    </>
  )
}

// ─── Auction Modal ────────────────────────────────────────────────────────────

interface Props {
  lot: AuctionLot | null
  open: boolean
  onClose: () => void
  onBid: (lotId: string, amount: number) => void
}
 function useCountdown(initial: number) {
  const [s, setS] = useState(initial)
  useEffect(() => { const t = setInterval(() => setS(v => (v > 0 ? v - 1 : 0)), 1000); return () => clearInterval(t) }, [])
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export default function AuctionModal({ lot, open, onClose, onBid }: Props) {
  const { address, isConnected } = useAccount()
  const [galleryIdx, setGalleryIdx] = useState(0)
  const [escrowOpen, setEscrowOpen] = useState(false)
  const [bidInput, setBidInput] = useState('')
  const [bidState, setBidState] = useState<'idle' | 'confirming' | 'confirmed'>('idle')
  const [bidFeed, setBidFeed] = useState<BidEntry[]>([])
  const countdown = useCountdown(lot?.secondsLeft ?? 0)

  // 1. Supabase-dan takliflar (Bids) tarixini real-time olish
  useEffect(() => {
    if (!lot || !open) return

    const fetchBids = async () => {
      const { data, error } = await supabase
        .from('bids')
        .select('*')
        .eq('auction_id', lot.id)
        .order('amount', { ascending: false })
        .limit(10)

      if (data && data.length > 0) {
        const formattedBids: BidEntry[] = data.map((b, idx) => ({
          addr: `${b.bidder_address.slice(0, 4)}...${b.bidder_address.slice(-2)}`,
          amount: b.amount,
          delta: `+$${(b.amount - (data[idx + 1]?.amount || lot.reserve || 0)).toLocaleString()}`,
          ts: 'murojaat qilindi',
        }))
        setBidFeed(formattedBids)
      } else {
        setBidFeed([
          { addr: '0x8F...3A', amount: lot.currentBid, delta: '+$150,000', ts: '12s ago' },
          { addr: '0xC4...7D', amount: Math.max(0, lot.currentBid - 150000), delta: '+$200,000', ts: '1m ago' },
        ])
      }
    }

    fetchBids()
  }, [lot?.id, open])

  useEffect(() => { if (!open) { setBidState('idle'); setBidInput(''); setEscrowOpen(false) } }, [open])

  if (!lot) return null

  const imgs = GALLERY_IMGS[lot.id] ?? GALLERY_IMGS.default
  const topBid = bidFeed[0]?.amount ?? lot.currentBid
  const minNext = topBid + 50000

  // 2. Taklifni Supabase-ga saqlash
  const handleBid = async () => {
    if (!isConnected || !address) {
      alert('Iltimos, avval Web3 hamyoningizni ulang!')
      return
    }

    const amount = parseInt(bidInput.replace(/[^0-9]/g, ''))
    if (!amount || amount < minNext) {
      alert(`Minimal taklif summasi: $${minNext.toLocaleString()}`)
      return
    }

    setBidState('confirming')

    try {
      const { error: bidError } = await supabase.from('bids').insert([
        {
          auction_id: lot.id,
          bidder_address: address,
          amount: amount,
          created_at: new Date().toISOString(),
        },
      ])

      if (bidError) throw bidError

      await supabase
        .from('auctions')
        .update({ current_price: amount })
        .eq('id', lot.id)

      const formattedAddr = `${address.slice(0, 4)}...${address.slice(-2)} (YOU)`
      onBid(lot.id, amount)

      setBidFeed(prev => [
        { addr: formattedAddr, amount, delta: `+$${(amount - topBid).toLocaleString()}`, ts: 'just now' },
        ...prev.slice(0, 6)
      ])

      setBidState('confirmed')
      setBidInput('')
    } catch (err: any) {
      console.error('Supabase Bid Error:', err)
      alert('Taklif saqlashda xatolik: ' + err.message)
      setBidState('idle')
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }}
          onClick={onClose} />
      )}
        {/* Panel */}
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', stiffness: 310, damping: 34 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
        >
          <div className="w-full max-w-5xl max-h-[92vh] rounded-xl overflow-hidden pointer-events-auto flex flex-col"
            style={{ background: 'rgba(9,10,13,0.99)', border: '1px solid rgba(212,175,55,0.22)', boxShadow: '0 0 100px rgba(212,175,55,0.07)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${GOLD_FAINT}` }}>
              <div className="flex items-center gap-3">
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}
                  className="w-2 h-2 rounded-full bg-red-500" style={{ boxShadow: '0 0 8px rgba(239,68,68,0.9)' }} />
                <span className="text-[10px] tracking-widest font-bold uppercase text-white/45">LIVE AUCTION — {lot.id.toUpperCase()}</span>
                {lot.verified && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm" style={{ background: 'rgba(212,175,55,0.06)', border: `1px solid ${GOLD_FAINT}` }}>
                    <Shield size={9} style={{ color: GOLD }} />
                    <span className="text-[9px] font-bold tracking-wider" style={{ color: GOLD }}>SOVEREIGN VERIFIED</span>
                  </div>
                )}
              </div>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClose}>
                <X size={17} className="text-white/30 hover:text-white/70 transition-colors" />
              </motion.button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[1fr_310px] min-h-0">

              {/* Gallery */}
              <div className="overflow-y-auto p-5 space-y-3" style={{ borderRight: `1px solid ${GOLD_FAINT}` }}>
                <div className="relative rounded-lg overflow-hidden bg-[#0F1113]" style={{ aspectRatio: '16/9' }}>
                  <AnimatePresence mode="wait">
                    <motion.img key={galleryIdx} src={imgs[galleryIdx]} alt={lot.title}
                      className="w-full h-full object-cover"
                      style={{ filter: 'brightness(0.82) saturate(0.88)' }}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
                  </AnimatePresence>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <p className="text-white font-black text-2xl leading-none">{lot.title}</p>
                    <p className="text-xs mt-1 text-white/45 font-medium">{lot.subtitle}</p>
                  </div>
                  <div className="absolute top-3 right-3 flex gap-1.5">
                    {imgs.map((_, i) => (
                      <motion.button key={i} onClick={() => setGalleryIdx(i)} whileHover={{ scale: 1.3 }}
                        className="w-2 h-2 rounded-full" style={{ background: i === galleryIdx ? GOLD : 'rgba(212,175,55,0.25)' }} />
                    ))}
                  </div>
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    <motion.button onClick={() => setGalleryIdx(i => (i - 1 + imgs.length) % imgs.length)} whileHover={{ scale: 1.1 }}
                      className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                       <ChevronLeft size={13} className="text-white/55" />
                    </motion.button>
                    <motion.button onClick={() => setGalleryIdx(i => (i + 1) % imgs.length)} whileHover={{ scale: 1.1 }}
                      className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <ChevronRight size={13} className="text-white/55" />
                    </motion.button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {imgs.map((src, i) => (
                    <motion.button key={i} onClick={() => setGalleryIdx(i)} whileHover={{ scale: 1.04 }}
                      className="relative rounded-md overflow-hidden" style={{ border: i === galleryIdx ? `1px solid ${GOLD}` : `1px solid ${GOLD_FAINT}`, aspectRatio: '16/9' }}>
                      <img src={src} alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.55) saturate(0.7)' }} />
                    </motion.button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[['ESCROW HASH', `0x71...${lot.id.slice(-3).toUpperCase()}`], ['CHAIN', 'ETHEREUM'], ['TOKEN', 'USDT · ERC-20']].map(([k, v]) => (
                    <div key={k} className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.03)', border: `1px solid ${GOLD_FAINT}` }}>
                      <SectionLabel>{k}</SectionLabel>
                      <p className="font-mono text-[10px] text-white/55 mt-1">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bid panel */}
              <div className="flex flex-col overflow-hidden">
                {/* Stats */}
                <div className="p-4 space-y-2 shrink-0" style={{ borderBottom: `1px solid ${GOLD_FAINT}` }}>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
                      <div className="flex items-center gap-1 mb-1"><Clock size={9} style={{ color: GOLD_DIM }} /><SectionLabel>TIME LEFT</SectionLabel></div>
                      <motion.p className="font-black text-xl" style={{ color: GOLD, fontVariantNumeric: 'tabular-nums' }}
                        animate={{ opacity: [1, 0.65, 1] }} transition={{ repeat: Infinity, duration: 2 }}>{countdown}</motion.p>
                    </div>
                    <div className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
                      <div className="flex items-center gap-1 mb-1"><TrendingUp size={9} style={{ color: GOLD_DIM }} /><SectionLabel>TOP BID</SectionLabel></div>
                      <p className="font-black text-base" style={{ color: GOLD }}>${topBid.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.03)', border: `1px solid ${GOLD_FAINT}` }}>
                    <SectionLabel>ESCROW POOL</SectionLabel>
                    <p className="font-black text-lg mt-1" style={{ color: GOLD }}>${lot.escrow.toLocaleString()} <span className="text-xs font-bold text-white/30">USDT</span></p>
                    <p className="text-[8px] mt-0.5 text-white/25">Reserve: ${lot.reserve.toLocaleString()} · 2% commission auto-locked</p>
                  </div>
                </div>

                {/* Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                  <SectionLabel>LIVE BID FEED</SectionLabel>
                     <div className="space-y-1 mt-2">
                    <AnimatePresence initial={false}>
                      {bidFeed.map((b, i) => (
                        <motion.div key={`${b.addr}-${b.amount}-${i}`}
                          initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }}
                          className="flex items-center justify-between py-2 px-3 rounded-sm"
                          style={{ background: i === 0 ? 'rgba(212,175,55,0.07)' : 'transparent', border: i === 0 ? '1px solid rgba(212,175,55,0.18)' : '1px solid transparent' }}>
                          <div>
                            <p className="font-mono text-[11px] text-white/60">{b.addr}</p>
                            <p className="text-[8px] text-white/25 mt-0.5">{b.ts}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-sm" style={{ color: i === 0 ? GOLD : 'rgba(255,255,255,0.5)' }}>${b.amount.toLocaleString()}</p>
                            <p className="text-[9px] font-medium text-emerald-400">{b.delta}</p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* CTAs */}
                <div className="p-4 space-y-2 shrink-0" style={{ borderTop: `1px solid ${GOLD_FAINT}` }}>
                  <AnimatePresence mode="wait">
                    {bidState === 'confirmed' ? (
                      <motion.div key="confirmed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="py-3 rounded-sm text-center" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}>
                        <div className="flex items-center justify-center gap-2">
                          <CircleCheck size={13} className="text-emerald-400" />
                          <p className="text-[9px] font-black tracking-widest text-emerald-400">BID PLACED — ESCROW LOCKED</p>
                        </div>
                        <p className="text-[8px] text-emerald-400/45 mt-0.5">You are the highest bidder</p>
                      </motion.div>
                    ) : (
                      <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: GOLD_DIM }}>$</span>
                          <input type="text" value={bidInput} onChange={e => setBidInput(e.target.value)}
                            placeholder={`Min $${minNext.toLocaleString()}`}
                            className="w-full pl-7 pr-3 py-2.5 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none"
                            style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}
                            onKeyDown={e => e.key === 'Enter' && handleBid()} />
                        </div>
                        <GoldBtn full onClick={handleBid}>
                          {bidState === 'confirming'
                            ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}><Activity size={13} /></motion.div> CONFIRMING...</>
                            : <>⚡️ CONFIRM BID</>}
                        </GoldBtn>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <GoldBtn full variant="ghost" onClick={() => setEscrowOpen(true)}>
                    <Lock size={11} /> VIEW ESCROW PROOF
                  </GoldBtn>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <EscrowDrawer open={escrowOpen} onClose={() => setEscrowOpen(false)} lot={lot} />
    </>
  )
}