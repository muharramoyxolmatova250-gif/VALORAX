import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Fingerprint, Scan, CircleCheck, ArrowUpRight, Lock } from 'lucide-react'
import { DrawerShell, GoldBtn, Tag, SectionLabel, GOLD, GOLD_DIM, GOLD_FAINT } from './ui'
import type { Profile } from '../types'

interface Props {
  profile: Profile | null
  open: boolean
  onClose: () => void
}

export default function SovereignDrawer({ profile, open, onClose }: Props) {
  const [step, setStep] = useState<'idle' | 'scanning' | 'binding' | 'done'>('idle')
  const [progress, setProgress] = useState(0)

  useEffect(() => { if (!open) { setStep('idle'); setProgress(0) } }, [open])

  useEffect(() => {
    if (step !== 'scanning') return
    let p = 0
    const t = setInterval(() => {
      p += Math.random() * 7 + 3
      setProgress(Math.min(p, 100))
      if (p >= 100) { clearInterval(t); setStep('binding') }
    }, 110)
    return () => clearInterval(t)
  }, [step])

  const bindings = [
    { label: 'X / TWITTER', value: `@${profile?.name?.toLowerCase().replace(/\s/g, '') ?? '...'}` },
    { label: 'ENS DOMAIN', value: profile?.handle ?? '...' },
    { label: 'WALLET', value: '0x8F3A...71B4 (auto-detected)' },
  ]

  return (
    <DrawerShell open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${GOLD_FAINT}` }}>
        <div>
          <SectionLabel>SOVEREIGN CLAIM FLOW</SectionLabel>
          <h3 className="text-white font-black text-sm tracking-wide mt-0.5">ZK IDENTITY HANDSHAKE</h3>
        </div>
        <motion.button whileHover={{ scale: 1.1 }} onClick={onClose}>
          <X size={16} className="text-white/30 hover:text-white/70 transition-colors" />
        </motion.button>
      </div>

      {/* Profile strip */}
      {profile && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="px-6 py-4 flex items-center gap-4" style={{ borderBottom: `1px solid ${GOLD_FAINT}` }}>
          <img src={profile.avatar} alt={profile.name} className="w-14 h-14 rounded-full object-cover shrink-0"
            style={{ border: `1px solid rgba(212,175,55,0.35)`, filter: 'grayscale(30%)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-base truncate">{profile.name}</p>
            <p className="font-mono text-xs mt-0.5 truncate" style={{ color: 'rgba(212,175,55,0.6)' }}>{profile.handle}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Tag color="rgba(239,68,68,0.65)">UNCLAIMED</Tag>
              <span className="text-[9px] text-white/30">
                Lost: <span className="font-bold" style={{ color: GOLD }}>${profile.lostYield.toLocaleString()}</span>
              </span>
            </div>
          </div>
          <ArrowUpRight size={15} style={{ color: GOLD_DIM }} className="shrink-0" />
        </motion.div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* ZK Scanner */}
        <div className="rounded-lg p-5 text-center space-y-4" style={{ background: 'rgba(212,175,55,0.03)', border: `1px solid ${GOLD_FAINT}` }}>
          <SectionLabel>ZK-PROOF BIOMETRIC SCANNER</SectionLabel>

          <div className="relative w-36 h-36 mx-auto">
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 144 144">
              <circle cx="72" cy="72" r="68" fill="none" stroke="rgba(212,175,55,0.07)" strokeWidth="1"/>
              <circle cx="72" cy="72" r="58" fill="none" stroke="rgba(212,175,55,0.05)" strokeWidth="0.5" strokeDasharray="3 5"/>
              <circle cx="72" cy="72" r="48" fill="none" stroke="rgba(212,175,55,0.04)" strokeWidth="0.5"/>
            </svg>
            {step === 'scanning' && (
              <motion.svg className="absolute inset-0 w-full h-full" viewBox="0 0 144 144"
                animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}>
                <circle cx="72" cy="72" r="68" fill="none" stroke={GOLD} strokeWidth="1.5" strokeDasharray="36 392" strokeLinecap="round"/>
              </motion.svg>
            )}
            {(step === 'binding' || step === 'done') && (
              <motion.svg className="absolute inset-0 w-full h-full" viewBox="0 0 144 144" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <circle cx="72" cy="72" r="68" fill="none" stroke="#10B981" strokeWidth="1.5" strokeOpacity="0.7"/>
              </motion.svg>
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {step === 'idle' && (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                    <Fingerprint size={40} style={{ color: GOLD_DIM }} className="mx-auto" />
                    <p className="text-[9px] mt-2 font-mono" style={{ color: 'rgba(212,175,55,0.35)' }}>READY</p>
                  </motion.div>
                )}
                {step === 'scanning' && (
                  <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                    <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                      <Scan size={36} style={{ color: GOLD }} className="mx-auto" />
                    </motion.div>
                    <p className="text-[10px] mt-2 font-mono font-black" style={{ color: GOLD }}>{Math.floor(progress)}%</p>
                  </motion.div>
                )}
                {(step === 'binding' || step === 'done') && (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                    <CircleCheck size={40} className="text-emerald-400 mx-auto" />
                    <p className="text-[9px] mt-2 font-mono font-black text-emerald-400">VERIFIED</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {step === 'scanning' && (
            <div className="space-y-1.5 px-2">
              <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(212,175,55,0.1)' }}>
                <motion.div className="h-full rounded-full" style={{ background: GOLD, width: `${progress}%` }} />
              </div>
              <p className="text-[9px] font-mono" style={{ color: GOLD_DIM }}>GENERATING ZK-PROOF — {Math.floor(progress)}%</p>
            </div>
          )}

          {step === 'idle' && (
            <GoldBtn full onClick={() => setStep('scanning')}>
              <Scan size={12} /> INITIATE FACE SCAN
            </GoldBtn>
          )}
        </div>

        {/* Identity bindings */}
        <motion.div
          animate={{ opacity: step === 'idle' || step === 'scanning' ? 0.35 : 1 }}
          transition={{ duration: 0.4 }}
          className="rounded-lg p-4 space-y-2"
          style={{ background: 'rgba(212,175,55,0.03)', border: `1px solid ${GOLD_FAINT}` }}
        >
          <SectionLabel>IDENTITY BINDING</SectionLabel>
          <div className="space-y-1.5 mt-2">
            {bindings.map(row => (
              <div key={row.label} className="flex items-center justify-between py-2 px-3 rounded-sm"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <SectionLabel>{row.label}</SectionLabel>
                  <p className="font-mono text-[11px] text-white/55 mt-0.5">{row.value}</p>
                </div>
                <AnimatePresence mode="wait">
                  {step === 'binding' || step === 'done'
                    ? <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }}><CircleCheck size={16} className="text-emerald-400" /></motion.div>
                    : <motion.div key="empty" className="w-4 h-4 rounded-full border border-white/12" />}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Final CTA */}
        <AnimatePresence>
          {(step === 'binding' || step === 'done') && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              {step === 'done' ? (
                <div className="py-4 rounded-lg text-center space-y-1" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <div className="flex items-center justify-center gap-2">
                    <CircleCheck size={16} className="text-emerald-400" />
                    <p className="text-[10px] font-black tracking-widest text-emerald-400">CONTROL TRANSFERRED</p>
                  </div>
                  <p className="text-[9px] text-emerald-400/40">Account claimed on-chain · Transaction confirmed</p>
                </div>
              ) : (
                <GoldBtn full onClick={() => setStep('done')}>
                  <Lock size={12} /> VERIFY &amp; TRANSFER CONTROL
                </GoldBtn>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[8px] leading-relaxed text-center text-white/18 pb-2">
          ZK-proof biometric data never leaves your device. Identity binding verified on Ethereum Mainnet.
        </p>
      </div>
    </DrawerShell>
  )
}
