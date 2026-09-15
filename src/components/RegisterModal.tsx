import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, Scan, CircleCheck, Shield, ArrowRight, Activity } from 'lucide-react'
import { ModalShell, ModalHeader, GoldBtn, SectionLabel, GOLD, GOLD_DIM, GOLD_FAINT } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  onVerified: (handle: string) => void
}

type Step = 'identity' | 'funds' | 'scan' | 'done'

export default function RegisterModal({ open, onClose, onVerified }: Props) {
  const [step, setStep] = useState<Step>('identity')
  const [ens, setEns] = useState('')
  const [twitter, setTwitter] = useState('')
  const [walletAmt, setWalletAmt] = useState('')
  const [scanPct, setScanPct] = useState(0)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!open) { setStep('identity'); setEns(''); setTwitter(''); setWalletAmt(''); setScanPct(0); setScanning(false) }
  }, [open])

  useEffect(() => {
    if (!scanning) return
    let p = 0
    const t = setInterval(() => {
      p += Math.random() * 7 + 3
      setScanPct(Math.min(p, 100))
      if (p >= 100) { clearInterval(t); setStep('done'); setScanning(false) }
    }, 110)
    return () => clearInterval(t)
  }, [scanning])

  const STEPS: Step[] = ['identity', 'funds', 'scan', 'done']
  const stepIdx = STEPS.indexOf(step)

  return (
    <ModalShell open={open} onClose={onClose}>
      <ModalHeader title="SOVEREIGN PROFILE REGISTRATION" sub="ZK-PROOF IDENTITY LAYER" onClose={onClose} />

      {/* Step progress */}
      <div className="px-6 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${GOLD_FAINT}` }}>
        {['IDENTITY', 'FUNDS', 'BIOMETRIC', 'VERIFIED'].map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black transition-all duration-500"
                style={{
                  background: i < stepIdx ? '#10B981' : i === stepIdx ? GOLD : 'rgba(255,255,255,0.06)',
                  color: i < stepIdx ? '#fff' : i === stepIdx ? '#0B0B0C' : 'rgba(255,255,255,0.25)',
                  border: i === stepIdx ? `1px solid ${GOLD}` : 'none',
                }}
              >
                {i < stepIdx ? <CircleCheck size={10} /> : i + 1}
              </div>
              <span
                className="text-[8px] tracking-widest font-bold uppercase hidden sm:block"
                style={{ color: i === stepIdx ? GOLD : i < stepIdx ? '#10B981' : 'rgba(255,255,255,0.2)' }}
              >
                {label}
              </span>
            </div>
            {i < 3 && <div className="flex-1 h-px" style={{ background: i < stepIdx ? '#10B981' : GOLD_FAINT, opacity: 0.5 }} />}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <AnimatePresence mode="wait">

          {step === 'identity' && (
            <motion.div key="identity" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div>
                <SectionLabel>ENS DOMAIN</SectionLabel>
                <input value={ens} onChange={e => setEns(e.target.value)} placeholder="yourname.eth"
                  className="w-full px-4 py-3 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none mt-2"
                  style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }} />
              </div>
              <div>
                <SectionLabel>X / TWITTER HANDLE</SectionLabel>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/30">@</span>
                  <input value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="handle"
                    className="w-full pl-8 pr-4 py-3 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none"
                    style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }} />
                </div>
              </div>
              <div className="p-3 rounded-sm flex items-start gap-2.5" style={{ background: 'rgba(212,175,55,0.03)', border: `1px solid ${GOLD_FAINT}` }}>
                <Shield size={13} style={{ color: GOLD_DIM }} className="shrink-0 mt-0.5" />
                <p className="text-[9px] leading-relaxed text-white/40">
                  Your ENS and Twitter are cryptographically bound on-chain. No data is stored off-chain.
                </p>
              </div>
              <GoldBtn full onClick={() => setStep('funds')} disabled={!ens || !twitter}>
                CONTINUE <ArrowRight size={12} />
              </GoldBtn>
            </motion.div>
          )}

          {step === 'funds' && (
            <motion.div key="funds" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div>
                <SectionLabel>SOVEREIGN FUND VERIFICATION</SectionLabel>
                <p className="text-[10px] text-white/35 mt-1 mb-3">
                  Declare your verifiable net worth for Sovereign Wall eligibility. Minimum: $1,000,000 USD equivalent.
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: GOLD_DIM }}>$</span>
                  <input type="number" value={walletAmt} onChange={e => setWalletAmt(e.target.value)} placeholder="1,000,000"
                    className="w-full pl-8 pr-16 py-3 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none"
                    style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/30">USD</span>
                </div>
                {walletAmt && parseFloat(walletAmt) < 1000000 && (
                  <p className="text-[9px] text-red-400/70 mt-1">Minimum sovereign threshold: $1,000,000</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['1,000,000', '5,000,000', '25,000,000'].map(v => (
                  <motion.button key={v} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={() => setWalletAmt(v.replace(/,/g, ''))}
                    className="py-2 rounded-sm text-[9px] font-bold tracking-wider"
                    style={{ border: `1px solid ${GOLD_FAINT}`, color: GOLD_DIM, background: 'rgba(212,175,55,0.03)' }}>
                    ${v}
                  </motion.button>
                ))}
              </div>
              <div className="flex gap-2">
                <GoldBtn variant="ghost" onClick={() => setStep('identity')}>BACK</GoldBtn>
                <GoldBtn full onClick={() => setStep('scan')} disabled={!walletAmt || parseFloat(walletAmt) < 1000000}>
                  VERIFY FUNDS <ArrowRight size={12} />
                </GoldBtn>
              </div>
            </motion.div>
          )}

          {step === 'scan' && (
            <motion.div key="scan" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5 text-center">
              <div>
                <SectionLabel>ZK-PROOF BIOMETRIC SCAN</SectionLabel>
                <p className="text-[10px] text-white/35 mt-1">Your biometric is hashed locally — never transmitted.</p>
              </div>

              {/* Scanner ring */}
              <div className="relative w-40 h-40 mx-auto">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="75" fill="none" stroke="rgba(212,175,55,0.07)" strokeWidth="1"/>
                  <circle cx="80" cy="80" r="64" fill="none" stroke="rgba(212,175,55,0.05)" strokeWidth="0.5" strokeDasharray="3 6"/>
                  <circle cx="80" cy="80" r="53" fill="none" stroke="rgba(212,175,55,0.04)" strokeWidth="0.5"/>
                </svg>
                {scanning && (
                  <motion.svg className="absolute inset-0 w-full h-full" viewBox="0 0 160 160"
                    animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.3, ease: 'linear' }}>
                    <circle cx="80" cy="80" r="75" fill="none" stroke={GOLD} strokeWidth="1.5" strokeDasharray="38 434" strokeLinecap="round"/>
                  </motion.svg>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  {!scanning ? (
                    <Fingerprint size={48} style={{ color: GOLD_DIM }} />
                  ) : (
                    <motion.div className="text-center" animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                      <Scan size={44} style={{ color: GOLD }} />
                      <p className="text-[10px] mt-1 font-mono font-black" style={{ color: GOLD }}>{Math.floor(scanPct)}%</p>
                    </motion.div>
                  )}
                </div>
              </div>

              {scanning && (
                <div className="space-y-2 px-4">
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(212,175,55,0.1)' }}>
                    <motion.div className="h-full rounded-full" style={{ background: GOLD, width: `${scanPct}%` }} />
                  </div>
                  <p className="text-[9px] font-mono" style={{ color: GOLD_DIM }}>GENERATING ZK-PROOF — {Math.floor(scanPct)}% COMPLETE</p>
                </div>
              )}

              {!scanning && (
                <GoldBtn full onClick={() => setScanning(true)}>
                  <Scan size={13} /> INITIATE BIOMETRIC SCAN
                </GoldBtn>
              )}
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5 text-center py-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }}>
                <CircleCheck size={56} className="text-emerald-400 mx-auto" />
              </motion.div>
              <div>
                <h3 className="text-white font-black text-xl">SOVEREIGN VERIFIED</h3>
                <p className="text-[11px] text-emerald-400 mt-1 font-mono">{ens}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                {[
                  ['ENS DOMAIN', ens],
                  ['TWITTER', `@${twitter}`],
                  ['NET WORTH', `$${parseFloat(walletAmt).toLocaleString()}`],
                  ['ZK STATUS', 'PROOF GENERATED'],
                ].map(([l, v]) => (
                  <div key={l} className="p-3 rounded-sm" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <p className="text-[8px] tracking-widest font-bold uppercase text-emerald-400/50">{l}</p>
                    <p className="font-mono text-[11px] text-emerald-400/80 mt-0.5 truncate">{v}</p>
                  </div>
                ))}
              </div>
              <GoldBtn full onClick={() => { onVerified(ens); onClose() }}>
                <CircleCheck size={13} /> ENTER SOVEREIGN TERMINAL
              </GoldBtn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ModalShell>
  )
}
