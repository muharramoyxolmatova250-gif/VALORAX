import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Lock, Zap, CircleCheck, Activity } from 'lucide-react'
import { ModalShell, ModalHeader, GoldBtn, SectionLabel, GOLD, GOLD_DIM, GOLD_FAINT } from './ui'

interface Props {
  open: boolean
  onClose: () => void
}

type Token = 'USDT' | 'ETH'

const POOLS = [
  { token: 'USDT' as Token, apy: 8.4, tvl: 4200000, lockDays: 30, minStake: 5000 },
  { token: 'ETH' as Token, apy: 6.2, tvl: 1840, lockDays: 30, minStake: 1 },
]

export default function StakingModal({ open, onClose }: Props) {
  const [selected, setSelected] = useState<Token>('USDT')
  const [input, setInput] = useState('')
  const [stage, setStage] = useState<'idle' | 'confirming' | 'staked'>('idle')
  const [stakedAmount, setStakedAmount] = useState(0)
  const [earnedToday, setEarnedToday] = useState(0)
  const pool = POOLS.find(p => p.token === selected)!

  useEffect(() => { if (!open) { setStage('idle'); setInput('') } }, [open])

  useEffect(() => {
    if (stage !== 'staked') return
    const t = setInterval(() => setEarnedToday(e => +(e + stakedAmount * pool.apy / 100 / 365 / 86400 * 3).toFixed(6)), 3000)
    return () => clearInterval(t)
  }, [stage, stakedAmount, pool.apy])

  const daily = stakedAmount * pool.apy / 100 / 365
  const monthly = daily * 30

  const handleStake = () => {
    const v = parseFloat(input)
    if (!v || v < pool.minStake) return
    setStage('confirming')
    setTimeout(() => { setStakedAmount(v); setStage('staked') }, 1400)
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <ModalHeader title="SOVEREIGN LIQUIDITY VAULT" sub="STAKING ENGINE" onClose={onClose} />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Pool selector */}
        <div>
          <SectionLabel>SELECT POOL</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {POOLS.map(p => (
              <motion.button
                key={p.token}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setSelected(p.token); setInput(''); setStage('idle') }}
                className="p-4 rounded-lg text-left transition-all"
                style={{
                  background: selected === p.token ? 'rgba(212,175,55,0.08)' : 'rgba(212,175,55,0.03)',
                  border: `1px solid ${selected === p.token ? 'rgba(212,175,55,0.35)' : GOLD_FAINT}`,
                  boxShadow: selected === p.token ? '0 0 20px rgba(212,175,55,0.07)' : 'none',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-xl" style={{ color: GOLD }}>{p.token}</span>
                  <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-sm"
                    style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10B981' }}>
                    {p.apy}% APY
                  </span>
                </div>
                <p className="text-[9px] text-white/35">TVL: {p.token === 'USDT' ? `$${p.tvl.toLocaleString()}` : `${p.tvl.toLocaleString()} ETH`}</p>
                <p className="text-[9px] text-white/35 mt-0.5">Lock period: {p.lockDays} days · Min: {p.token === 'USDT' ? `$${p.minStake.toLocaleString()}` : `${p.minStake} ETH`}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
            <SectionLabel>DAILY YIELD</SectionLabel>
            <p className="font-black text-base mt-1" style={{ color: GOLD }}>
              {stakedAmount ? (selected === 'USDT' ? `$${daily.toFixed(2)}` : `${daily.toFixed(4)} ETH`) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
            <SectionLabel>MONTHLY YIELD</SectionLabel>
            <p className="font-black text-base mt-1" style={{ color: GOLD }}>
              {stakedAmount ? (selected === 'USDT' ? `$${monthly.toFixed(0)}` : `${monthly.toFixed(3)} ETH`) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-sm" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.18)' }}>
            <SectionLabel>EARNED TODAY</SectionLabel>
            <p className="font-black text-base mt-1 text-emerald-400">
              {stakedAmount ? (selected === 'USDT' ? `$${earnedToday.toFixed(4)}` : `${earnedToday.toFixed(6)} ETH`) : '—'}
            </p>
          </div>
        </div>

        {/* Input */}
        <AnimatePresence mode="wait">
          {stage === 'staked' ? (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="py-5 rounded-lg text-center space-y-2"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.22)' }}>
              <div className="flex items-center justify-center gap-2">
                <CircleCheck size={18} className="text-emerald-400" />
                <p className="text-sm font-black tracking-widest text-emerald-400">STAKED &amp; EARNING</p>
              </div>
              <p className="text-[10px] text-emerald-400/55">
                {input} {selected} locked · Earning {pool.apy}% APY · Unlocks in {pool.lockDays}d
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <Activity size={11} className="text-emerald-400/60" />
                <p className="text-[9px] font-mono text-emerald-400/60">Live yield counter active</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div>
                <SectionLabel>AMOUNT TO STAKE</SectionLabel>
                <div className="relative mt-2">
                  <input
                    type="number"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={`Min ${pool.minStake.toLocaleString()} ${pool.token}`}
                    className="w-full pr-16 pl-4 py-3 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none"
                    style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: GOLD_DIM }}>{selected}</span>
                </div>
                {input && parseFloat(input) < pool.minStake && (
                  <p className="text-[9px] text-red-400/70 mt-1">Minimum stake: {pool.minStake.toLocaleString()} {pool.token}</p>
                )}
              </div>

              <GoldBtn full onClick={handleStake} disabled={!input || parseFloat(input) < pool.minStake}>
                {stage === 'confirming'
                  ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}><Activity size={13} /></motion.div> LOCKING STAKE...</>
                  : <><Lock size={13} /> LOCK &amp; STAKE {selected}</>
                }
              </GoldBtn>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active positions placeholder */}
        <div className="rounded-lg p-4" style={{ background: 'rgba(212,175,55,0.03)', border: `1px solid ${GOLD_FAINT}` }}>
          <SectionLabel>PLATFORM LIQUIDITY STATS</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              ['TOTAL STAKED USDT', '$4,200,000'],
              ['TOTAL STAKED ETH', '1,840 ETH'],
              ['PLATFORM TREASURY', '$840,000'],
              ['30D COMMISSION', '$84,000'],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-[8px] tracking-widest font-bold uppercase text-white/30">{l}</p>
                <p className="font-black text-sm mt-0.5" style={{ color: GOLD }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[8px] leading-relaxed text-white/20 text-center">
          Staking is non-custodial. Smart contract audited by Certik &amp; Halborn. Yields are variable. Not financial advice.
        </p>
      </div>
    </ModalShell>
  )
}
