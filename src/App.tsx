 import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Activity, Shield, TrendingUp } from 'lucide-react'

import Header from './components/Header'
import ProfileWall from './components/ProfileWall'
import AuctionDirectory from './components/AuctionDirectory'
import AuctionModal from './components/AuctionModal'
import SovereignDrawer from './components/SovereignDrawer'
import StakingModal from './components/StakingModal'
import RegisterModal from './components/RegisterModal'
import CreateAuctionModal from './components/CreateAuctionModal'
import LiveTicker from './components/LiveTicker'
import { GOLD, GOLD_DIM, GOLD_FAINT, CARD_BG, GoldDivider } from './components/ui'

import { PROFILES, AUCTION_LOTS } from './data'
import type { Profile, AuctionLot } from './types'

export default function App() {
  // Auth
  const [connected, setConnected] = useState(false)
  const [sovereignHandle, setSovereignHandle] = useState('')

  // Modal/drawer state
  const [stakingOpen, setStakingOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [createAuctionOpen, setCreateAuctionOpen] = useState(false)
  const [claimProfile, setClaimProfile] = useState<Profile | null>(null)
  const [activeLot, setActiveLot] = useState<AuctionLot | null>(null)
  const [auctionOpen, setAuctionOpen] = useState(false)

  // Lots state — starts with seed data, user-created lots get prepended
  const [lots, setLots] = useState<AuctionLot[]>(AUCTION_LOTS)

  const handleBid = (lotId: string, amount: number) => {
    setLots(prev => prev.map(l => l.id === lotId ? { ...l, currentBid: amount, escrow: amount, bids: l.bids + 1 } : l))
    if (activeLot?.id === lotId) {
      setActiveLot(prev => prev ? { ...prev, currentBid: amount, escrow: amount, bids: prev.bids + 1 } : prev)
    }
  }

  const handleLotCreated = (lot: AuctionLot) => {
    setLots(prev => [lot, ...prev])
  }

  const openAuction = (lot: AuctionLot) => {
    setActiveLot(lot)
    setAuctionOpen(true)
  }

  return (
    <div
      className="min-h-full flex flex-col text-white overflow-hidden"
      style={{
        background: '#0B0B0C',
        backgroundImage:
          'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(212,175,55,0.055) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 15% 65%, rgba(212,175,55,0.025) 0%, transparent 60%)',
      }}
    >
      {/* ── Header ── */}
      <Header
        connected={connected}
        onConnect={() => setConnected(c => !c)}
        onStaking={() => setStakingOpen(true)}
        onCreateAuction={() => setCreateAuctionOpen(true)}
        onRegister={() => setRegisterOpen(true)}
      />

      {/* ── Main Canvas ── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-14">

          {/* Sovereign greeting if registered */}
          <AnimatePresence>
            {sovereignHandle && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="flex items-center gap-3 px-5 py-3 rounded-lg"
                style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.9)' }} />
                <p className="text-[10px] font-mono font-bold tracking-widest text-emerald-400">
                  SOVEREIGN ACTIVE · {sovereignHandle.toUpperCase()} · ZK-PROOF VERIFIED
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Auction Directory ── */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <AuctionDirectory lots={lots} onSelect={openAuction} />
          </motion.section>

          <div className="h-px w-full" style={{ background: GOLD_FAINT, opacity: 0.5 }} />
                     {/* ── Sovereign Wall + Featured lot ── */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-10">
              <ProfileWall profiles={PROFILES} onClaim={p => setClaimProfile(p)} />

              {/* Featured vault snapshot */}
              <div className="xl:sticky xl:top-[100px] xl:self-start space-y-3">
                <div>
                  <p className="text-[9px] tracking-widest font-bold uppercase mb-2" style={{ color: GOLD_DIM }}>FEATURED VAULT</p>
                  <GoldDivider />
                </div>
                {(() => {
                  const lot = lots[0]
                  if (!lot) return null
                  return (
                    <motion.div
                      whileHover={{ y: -2, boxShadow: '0 16px 50px rgba(212,175,55,0.1)' }}
                      className="rounded-xl overflow-hidden cursor-pointer"
                      style={{ background: CARD_BG, border: '1px solid rgba(212,175,55,0.22)' }}
                      onClick={() => openAuction(lot)}
                    >
                      <div className="relative h-52">
                        <img src={lot.image} alt={lot.title} className="w-full h-full object-cover"
                          style={{ filter: 'brightness(0.48) saturate(0.75)' }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#121417] to-transparent" />
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-sm"
                          style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)' }}>
                          <Shield size={9} style={{ color: GOLD }} />
                          <span className="text-[9px] font-bold tracking-wider" style={{ color: GOLD }}>SOVEREIGN VERIFIED</span>
                        </div>
                        <div className="absolute bottom-3 left-4">
                          <p className="text-[9px] tracking-widest font-semibold uppercase mb-0.5" style={{ color: GOLD_DIM }}>FEATURED LOT</p>
                          <p className="text-white font-black text-lg leading-tight">{lot.title}</p>
                          <p className="text-xs text-white/40 mt-0.5">{lot.subtitle}</p>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ['TOP BID', '$' + lot.currentBid.toLocaleString()],
                            ['ESCROW', '$' + lot.escrow.toLocaleString()]
                          ].map(([k, v]) => (
                            <div key={k} className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid ' + GOLD_FAINT }}>
                              <p className="text-[8px] tracking-widest font-bold uppercase" style={{ color: GOLD_DIM }}>{k}</p>
                              <p className="font-black text-base mt-1" style={{ color: GOLD }}>{v}</p>
                            </div>
                          ))}
                        </div>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          className="w-full py-3 rounded-sm text-[10px] font-black tracking-widest uppercase text-[#0B0B0C]"
                          style={{ background: 'linear-gradient(135deg, #D4AF37 0%, #B8941E 100%)', boxShadow: '0 0 22px rgba(212,175,55,0.22)' }}
                          onClick={() => openAuction(lot)}>
                          ⚡️ ENTER AUCTION VAULT
                        </motion.button>
                      </div>
                    </motion.div>
                  )
                })()}
              </div>
            </div>
          </motion.section>
                      {/* ── Stats Row ── */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: <Lock size={11} />, label: 'TOTAL ESCROW LOCKED', value: '$38.4M', unit: 'USDT' },
                { icon: <Activity size={11} />, label: 'ACTIVE AUCTIONS', value: String(lots.length), unit: 'LOTS' },
                { icon: <Shield size={11} />, label: 'SOVEREIGN ACCOUNTS', value: '2,814', unit: 'VERIFIED' },
                { icon: <TrendingUp size={11} />, label: 'STAKING POOL APY', value: '8.4%', unit: 'USDT POOL' },
              ].map(stat => (
                <motion.div key={stat.label} whileHover={{ borderColor: 'rgba(212,175,55,0.3)', y: -2 }}
                  className="p-4 rounded-xl transition-all"
                  style={{ background: CARD_BG, border: '1px solid rgba(212,175,55,0.12)', backdropFilter: 'blur(16px)' }}>
                  <div className="flex items-center gap-1.5 mb-2" style={{ color: GOLD_DIM }}>
                    {stat.icon}
                    <p className="text-[8px] tracking-widest font-bold uppercase" style={{ color: GOLD_DIM }}>{stat.label}</p>
                  </div>
                  <p className="font-black text-2xl" style={{ color: GOLD }}>{stat.value}</p>
                  <p className="text-[9px] font-medium mt-0.5 text-white/28">{stat.unit}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </div>
      </main>

      {/* ── Footer Ticker ── */}
      <LiveTicker />

      {/* ── Modals & Drawers ── */}
      <AnimatePresence>
        {stakingOpen && <StakingModal key="staking" open={stakingOpen} onClose={() => setStakingOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {registerOpen && (
          <RegisterModal
            key="register"
            open={registerOpen}
            onClose={() => setRegisterOpen(false)}
            onVerified={handle => { setSovereignHandle(handle); setConnected(true) }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createAuctionOpen && (
          <CreateAuctionModal
            key="create"
            open={createAuctionOpen}
            onClose={() => setCreateAuctionOpen(false)}
            onCreated={handleLotCreated}
            creatorHandle={sovereignHandle || '0x71...B4'}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {auctionOpen && activeLot && (
          <AuctionModal
            key={'auction-' + activeLot.id}
            lot={activeLot}
            open={auctionOpen}
            onClose={() => { setAuctionOpen(false); setActiveLot(null) }}
            onBid={handleBid}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {claimProfile && (
          <SovereignDrawer
            key={'claim-' + claimProfile.id}
            profile={claimProfile}
            open={claimProfile !== null}
            onClose={() => setClaimProfile(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}