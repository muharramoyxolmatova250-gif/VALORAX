 import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Zap } from 'lucide-react'
import { GoldBtn, Tag, SectionLabel, GOLD, GOLD_DIM, GOLD_FAINT, CARD_BG } from './ui'
import type { AuctionLot, AuctionCategory } from '../types'

interface Props {
  lots: AuctionLot[]
  onSelect: (lot: AuctionLot) => void
}

const TABS: AuctionCategory[] = ['ALL', 'Hypercars', 'Media', 'Equity', 'Real Estate']

const CAT_COLOR: Record<string, string> = {
  Hypercars: 'rgba(239,68,68,0.6)',
  Media: 'rgba(139,92,246,0.65)',
  Equity: 'rgba(59,130,246,0.65)',
  'Real Estate': 'rgba(16,185,129,0.6)',
}

function useCountdown(initial: number) {
  const [s, setS] = useState(initial)
  useEffect(() => {
    const t = setInterval(() => setS(v => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function LotCard({ lot, onSelect }: { lot: AuctionLot; onSelect: () => void }) {
  const countdown = useCountdown(lot.secondsLeft)
  const catColor = CAT_COLOR[lot.category] ?? GOLD_DIM

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 12px 40px rgba(212,175,55,0.08)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="rounded-xl overflow-hidden cursor-pointer flex flex-col justify-between"
      style={{ background: CARD_BG, border: '1px solid rgba(212,175,55,0.15)', backdropFilter: 'blur(20px)' }}
      onClick={onSelect}
    >
      <div className="relative h-44">
        <img 
          src={lot.image} 
          alt={lot.title} 
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          style={{ filter: 'brightness(0.65) saturate(0.85)' }} 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121417] via-black/20 to-transparent" />
        
        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          <Tag color={catColor}>{lot.category}</Tag>
          {lot.verified && (
            <div 
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm"
              style={{ background: 'rgba(212,175,55,0.07)', border: `1px solid ${GOLD_FAINT}` }}
            >
              <Shield size={10} style={{ color: GOLD }} />
              <span className="text-[8px] font-bold tracking-wider" style={{ color: GOLD }}>ZK-VERIFIED</span>
            </div>
          )}
        </div>

        {/* Live Indicator & Title */}
        <div className="absolute bottom-2 left-3 right-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <motion.div 
              animate={{ opacity: [1, 0.2, 1] }} 
              transition={{ repeat: Infinity, duration: 1.6 }}
              className="w-1.5 h-1.5 rounded-full bg-red-500" 
              style={{ boxShadow: '0 0 5px rgba(239,68,68,0.9)' }} 
            />
            <span className="text-[8px] tracking-widest font-bold text-white/60 uppercase">LIVE AUCTION</span>
          </div>
          <p className="text-white font-black text-sm leading-tight truncate">{lot.title}</p>
        </div>
      </div>

      <div className="p-3 space-y-2.5 flex-1 flex flex-col justify-between">
        <p className="text-[9px] text-white/50 leading-snug line-clamp-2">{lot.subtitle}</p>

        {/* Auction Metrics */}
        <div className="grid grid-cols-3 gap-1.5 my-2">
          <div className="p-2 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
            <p className="text-[7px] tracking-widest font-bold uppercase" style={{ color: GOLD_DIM }}>TOP BID</p>
                 <p className="font-black text-[11px] mt-0.5 truncate" style={{ color: GOLD }}>
              {lot.currentBid > 0 ? `$${(lot.currentBid / 1e6).toFixed(1)}M` : 'OPEN'}
            </p>

          </div>
          <div className="p-2 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
            <p className="text-[7px] tracking-widest font-bold uppercase" style={{ color: GOLD_DIM }}>TIME</p>
            <p className="font-mono font-black text-[10px] mt-0.5" style={{ color: GOLD }}>{countdown}</p>
          </div>
          <div className="p-2 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
            <p className="text-[7px] tracking-widest font-bold uppercase" style={{ color: GOLD_DIM }}>BIDS</p>
            <p className="font-black text-[11px] mt-0.5" style={{ color: GOLD }}>{lot.bids}</p>
          </div>
        </div>

        {/* Action Button */}
        <GoldBtn full sm onClick={onSelect}>
          <Zap size={10} /> EZIB KIRISH & BID (3% ESCROW)
        </GoldBtn>
      </div>
    </motion.div>
  )
}

export default function AuctionDirectory({ lots, onSelect }: Props) {
  const [activeTab, setActiveTab] = useState<AuctionCategory>('ALL')

  const filtered = activeTab === 'ALL' ? lots : lots.filter(l => l.category === activeTab)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>SOVEREIGN AUCTION DIRECTORY</SectionLabel>
          <h2 className="text-white text-xl font-black tracking-tight mt-0.5">
            Live <span style={{ color: GOLD }}>Auction Vaults</span>
          </h2>
        </div>
        <div 
          className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
          style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}
        >
          <motion.div 
            animate={{ opacity: [1, 0.3, 1] }} 
            transition={{ repeat: Infinity, duration: 2.2 }}
            className="w-1.5 h-1.5 rounded-full" 
            style={{ background: GOLD }} 
          />
          <span className="text-[9px] font-mono font-bold tracking-wider" style={{ color: GOLD_DIM }}>
            {lots.length} ACTIVE LOTS
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(tab => (
          <motion.button
            key={tab}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveTab(tab)}
            className="shrink-0 px-3 py-1.5 rounded-sm text-[9px] font-bold tracking-widest uppercase transition-all"
            style={{
              background: activeTab === tab ? 'rgba(212,175,55,0.1)' : 'rgba(212,175,55,0.03)',
              border: `1px solid ${activeTab === tab ? 'rgba(212,175,55,0.4)' : GOLD_FAINT}`,
              color: activeTab === tab ? GOLD : 'rgba(212,175,55,0.45)',
            }}
          >
            {tab}
            <span className="ml-1.5 text-[7px] text-white/30 font-mono">
              {tab === 'ALL' ? lots.length : lots.filter(l => l.category === tab).length}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filtered.map((lot, i) => (
            <motion.div 
              key={lot.id} 
              initial={{ opacity: 0, y: 16 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: i * 0.05 }}
            >
              <LotCard lot={lot} onSelect={() => onSelect(lot)} />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}