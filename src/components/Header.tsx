import { ConnectButton } from '@rainbow-me/rainbowkit'
import { motion } from 'framer-motion'
import { Wifi, Zap, CircleCheck, Plus, UserCheck, TrendingUp } from 'lucide-react'
import { GoldBtn, GOLD, GOLD_DIM, GOLD_FAINT } from './ui'

interface HeaderProps {
  connected: boolean
  onConnect: () => void
  onStaking: () => void
  onCreateAuction: () => void
  onRegister: () => void
}

export default function Header({ connected, onConnect, onStaking, onCreateAuction, onRegister }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="sticky top-0 z-30 shrink-0"
      style={{ background: 'rgba(8,9,11,0.97)', borderBottom: `1px solid ${GOLD_FAINT}`, backdropFilter: 'blur(24px)' }}
    >
      {/* Top bar */}
      <div className="px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: network status */}
        <div className="flex items-center gap-2.5 min-w-[200px]">
          <motion.div
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
            style={{ boxShadow: '0 0 8px rgba(52,211,153,0.9)' }}
          />
          <div className="flex items-center gap-1.5">
            <Wifi size={10} style={{ color: GOLD_DIM }} />
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase" style={{ color: GOLD_DIM }}>
              NETWORK: MAINNET ● LIVE
            </span>
          </div>
        </div>

        {/* Center logo */}
        <motion.h1
          className="text-2xl font-black uppercase select-none flex-1 text-center"
          style={{ color: GOLD, letterSpacing: '0.5em' }}
          animate={{
            textShadow: [
              '0 0 20px rgba(212,175,55,0.2)',
              '0 0 45px rgba(212,175,55,0.55)',
              '0 0 20px rgba(212,175,55,0.2)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        >
          V A L O R E X
        </motion.h1>

        {/* Right: wallet connect */}
        <div className="min-w-[200px] flex justify-end">
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted
              const connected = ready && account && chain

              return (
                <div
                  {...(!ready && {
                    'aria-hidden': true,
                    style: {
                      opacity: 0,
                      pointerEvents: 'none',
                      userSelect: 'none',
                    },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <GoldBtn primary sm onClick={openConnectModal}>
                          <Zap size={11} /> CONNECT SOVEREIGN ID
                        </GoldBtn>
                      )
                    }

                    if (chain.unsupported) {
                      return (
                        <GoldBtn primary sm onClick={openChainModal}>
                          WRONG NETWORK
                        </GoldBtn>
                        
                      )
                    }

                    return (
                      <GoldBtn ghost sm onClick={openAccountModal}>
                        <CircleCheck size={11} /> {account.displayName}
                      </GoldBtn>
                    )
                  })()}
                </div>
              )
            }}
          </ConnectButton.Custom>
          </div>
        </div>

      {/* Action bar */}
      <div
        className="px-6 py-2 flex items-center gap-2 justify-center"
        style={{ borderTop: `1px solid ${GOLD_FAINT}`, background: 'rgba(212,175,55,0.02)' }}
      >
        <motion.button
          whileHover={{ scale: 1.03, color: GOLD }}
          whileTap={{ scale: 0.97 }}
          onClick={onStaking}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm text-[9px] font-bold tracking-widest uppercase transition-colors"
          style={{ border: `1px solid ${GOLD_FAINT}`, color: 'rgba(212,175,55,0.6)', background: 'transparent' }}
        >
          <TrendingUp size={10} />
          STAKING VAULT
        </motion.button>

        <div className="w-px h-4" style={{ background: GOLD_FAINT }} />

        <motion.button
          whileHover={{ scale: 1.03, color: GOLD }}
          whileTap={{ scale: 0.97 }}
          onClick={onCreateAuction}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm text-[9px] font-bold tracking-widest uppercase transition-colors"
          style={{ border: `1px solid ${GOLD_FAINT}`, color: 'rgba(212,175,55,0.6)', background: 'transparent' }}
        >
          <Plus size={10} />
          CREATE AUCTION
        </motion.button>

        <div className="w-px h-4" style={{ background: GOLD_FAINT }} />

        <motion.button
          whileHover={{ scale: 1.03, color: GOLD }}
          whileTap={{ scale: 0.97 }}
          onClick={onRegister}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm text-[9px] font-bold tracking-widest uppercase transition-colors"
          style={{ border: `1px solid ${GOLD_FAINT}`, color: 'rgba(212,175,55,0.6)', background: 'transparent' }}
        >
          <UserCheck size={10} />
          REGISTER / VERIFY PROFILE
        </motion.button>
      </div>
    </motion.header>
  )
}