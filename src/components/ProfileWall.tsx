import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Zap } from 'lucide-react'
import { GoldBtn, Tag, SectionLabel, GOLD, GOLD_DIM, GOLD_FAINT, CARD_BG } from './ui'
import type { Profile } from '../types'

function useLiveCounter(base: number, variance: number) {
  const [val, setVal] = useState(base)
  useEffect(() => {
    const t = setInterval(() => setVal(v => v + Math.floor(Math.random() * variance)), 4200)
    return () => clearInterval(t)
  }, [variance])
  return val
}

function ProfileCard({ profile, onClaim }: { profile: Profile; onClaim: () => void }) {
  const liveYield = useLiveCounter(profile.lostYield, 1400)
  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: `0 12px 40px rgba(212,175,55,0.08)` }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="rounded-xl overflow-hidden"
      style={{ background: CARD_BG, border: `1px solid rgba(212,175,55,0.15)`, backdropFilter: 'blur(20px)' }}
    >
      <div className="relative">
        <img src={profile.avatar} alt={profile.name} className="w-full h-44 object-cover"
          style={{ filter: 'grayscale(55%) brightness(0.62)' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121417] via-black/20 to-transparent" />
        <div className="absolute top-3 left-3">
          <Tag color="rgba(239,68,68,0.65)">STATUS: UNCLAIMED</Tag>
        </div>
        <div className="absolute top-3 right-3">
          <Tag>{profile.sector}</Tag>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div>
            <p className="text-white font-black text-lg leading-none">{profile.name}</p>
            <p className="text-xs mt-0.5 font-mono" style={{ color: 'rgba(212,175,55,0.6)' }}>{profile.handle}</p>
          </div>
          <span className="text-[9px] font-medium tracking-wider px-1.5 py-0.5"
            style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}>
            {profile.rank}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={9} style={{ color: GOLD_DIM }} />
            <SectionLabel>LOST YIELD</SectionLabel>
          </div>
          <motion.p className="text-2xl font-black" style={{ color: GOLD, fontVariantNumeric: 'tabular-nums' }}
            animate={{ opacity: [1, 0.7, 1] }} transition={{ repeat: Infinity, duration: 3.5 }}>
            ${liveYield.toLocaleString()}
          </motion.p>
        </div>
        <GoldBtn full sm onClick={onClaim}>
          <Zap size={11} /> CLAIM ACCOUNT VIA FACEID
        </GoldBtn>
      </div>
    </motion.div>
  )
}

interface Props {
  profiles: Profile[]
  onClaim: (profile: Profile) => void
}

export default function ProfileWall({ profiles, onClaim }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>SOVEREIGN INTELLIGENCE LAYER</SectionLabel>
          <h2 className="text-white text-xl font-black tracking-tight mt-0.5">
            Wall of <span style={{ color: GOLD }}>Sovereign Wealth</span>
          </h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
          style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 2.2 }}
            className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
          <span className="text-[9px] font-mono font-bold tracking-wider" style={{ color: GOLD_DIM }}>
            {profiles.length} TARGETS IDENTIFIED
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06 }}>
            <ProfileCard profile={p} onClaim={() => onClaim(p)} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
