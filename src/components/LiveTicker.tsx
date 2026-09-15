import { motion } from 'framer-motion'
import { GOLD_FAINT } from './ui'

const EVENTS = [
  '0x8F...3A Placed $150,000 Bid on Lot #001',
  'Lot #001 Pagani Huayra R — Escalated to $2,450,000',
  'System: 2% Auto-Commission Locked · Treasury +$49,000',
  '0xC4...7D Entered Sovereign Vault — KYC Verified',
  'Lot #004 SpaceX Equity — Reserve MET · 4 Bidders',
  '0xA1...9F Claimed MrBeast Profile via ZK-Proof',
  'Escrow Settlement: Lot #002 · $1,800,000 Released',
  '0xE2...1B Outbid on Lot #003 — Delta +$75,000',
  'ZK-Verification: 12 Sovereign Accounts Validated',
  'Staking Pool USDT: $4,200,000 Locked · APY 8.4%',
  '0x3D...6C Created Lot #007 — Dubai Penthouse',
  'Commission Sweep: $84,000 Distributed to Treasury',
  'New Sovereign: wbuffett.eth Verified & Onboarded',
  "Lot #006 Sotheby's Collection — 13 Active Bidders",
]

const doubled = [...EVENTS, ...EVENTS]

export default function LiveTicker() {
  return (
    <div
      className="overflow-hidden py-2.5 shrink-0"
      style={{ background: 'rgba(7,8,10,0.98)', borderTop: `1px solid ${GOLD_FAINT}` }}
    >
      <motion.div
        className="flex items-center whitespace-nowrap"
        animate={{ x: [0, '-50%'] }}
        transition={{ repeat: Infinity, duration: 42, ease: 'linear' }}
      >
        {doubled.map((ev, i) => (
          <span key={i} className="flex items-center shrink-0">
            <span className="text-[11px] font-mono font-medium px-5" style={{ color: 'rgba(212,175,55,0.72)' }}>
              {ev}
            </span>
            <span className="text-xs" style={{ color: 'rgba(212,175,55,0.2)' }}>──►</span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}
