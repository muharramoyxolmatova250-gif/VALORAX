import { motion } from 'framer-motion'
import { X } from 'lucide-react'

export const GOLD = '#D4AF37'
export const GOLD_DIM = 'rgba(212,175,55,0.55)'
export const GOLD_FAINT = 'rgba(212,175,55,0.13)'
export const CARD_BG = 'rgba(18,20,23,0.92)'
export const OBSIDIAN = '#0B0B0C'

export function GoldDivider() {
  return (
    <div
      className="h-px w-full"
      style={{ background: `linear-gradient(90deg, ${GOLD} 0%, transparent 100%)`, opacity: 0.22 }}
    />
  )
}

export function Tag({ children, color = GOLD_DIM }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-sm"
      style={{ border: `1px solid ${color}`, color, background: `${color}18` }}
    >
      {children}
    </span>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[8px] tracking-widest font-bold uppercase" style={{ color: GOLD_DIM }}>
      {children}
    </p>
  )
}

interface GoldBtnProps {
  children: React.ReactNode
  onClick?: (e?: React.MouseEvent) => void
  full?: boolean
  sm?: boolean
  xs?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}

export function GoldBtn({ children, onClick, full, sm, xs, variant = 'primary', disabled, type = 'button' }: GoldBtnProps) {
  const py = xs ? 'py-1.5' : sm ? 'py-2' : 'py-3'
  const textSize = xs ? 'text-[8px]' : sm ? 'text-[9px]' : 'text-[10px]'

  const styles =
    variant === 'primary'
      ? { background: `linear-gradient(135deg, #D4AF37 0%, #B8941E 100%)`, color: OBSIDIAN, boxShadow: `0 0 22px rgba(212,175,55,0.22)`, opacity: disabled ? 0.45 : 1 }
      : variant === 'ghost'
      ? { border: `1px solid rgba(212,175,55,0.32)`, color: GOLD, background: 'transparent', opacity: disabled ? 0.45 : 1 }
      : { border: `1px solid rgba(239,68,68,0.35)`, color: '#EF4444', background: 'rgba(239,68,68,0.06)', opacity: disabled ? 0.45 : 1 }

  return (
    <motion.button
      type={type}
      whileHover={disabled ? {} : { scale: 1.02, boxShadow: variant === 'primary' ? `0 0 32px rgba(212,175,55,0.4)` : undefined }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      className={`${full ? 'w-full' : ''} ${py} ${textSize} px-4 rounded-sm font-black tracking-widest uppercase flex items-center justify-center gap-2 transition-colors`}
      style={styles}
    >
      {children}
    </motion.button>
  )
}

export function StatBox({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="p-3 rounded-sm" style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD_FAINT}` }}>
      <SectionLabel>{label}</SectionLabel>
      <div className="font-black text-lg mt-1" style={{ color: GOLD }}>
        {value}
      </div>
      {sub && <p className="text-[9px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  )
}

export function ModalShell({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', stiffness: 310, damping: 34 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className={`w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} max-h-[92vh] rounded-xl overflow-hidden pointer-events-auto flex flex-col`}
          style={{ background: 'rgba(9,10,13,0.99)', border: `1px solid rgba(212,175,55,0.22)`, boxShadow: `0 0 100px rgba(212,175,55,0.07)` }}
        >
          {children}
        </div>
      </motion.div>
    </>
  )
}

export function DrawerShell({
  open,
  onClose,
  children,
  width = 'w-[420px]',
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 36 }}
        className={`fixed top-0 right-0 h-full z-[70] ${width} flex flex-col`}
        style={{ background: 'rgba(9,10,13,0.99)', borderLeft: `1px solid rgba(212,175,55,0.18)`, boxShadow: '-28px 0 60px rgba(0,0,0,0.55)' }}
      >
        {children}
      </motion.div>
    </>
  )
}

export function ModalHeader({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${GOLD_FAINT}` }}>
      <div>
        {sub && <SectionLabel>{sub}</SectionLabel>}
        <h3 className="text-white font-black text-sm tracking-wide mt-0.5">{title}</h3>
      </div>
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClose}>
        <X size={16} className="text-white/30 hover:text-white/70 transition-colors" />
      </motion.button>
    </div>
  )
}
