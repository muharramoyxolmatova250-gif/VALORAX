 import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, CircleCheck, Activity } from 'lucide-react'
import {
  ModalShell,
  ModalHeader,
  GoldBtn,
  SectionLabel,
  GOLD,
  GOLD_DIM,
  GOLD_FAINT,
} from './ui'
import { supabase } from '../lib/supabase'
import type { AuctionLot } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (lot: AuctionLot) => void
  creatorHandle: string
}

const CATEGORIES = [
  'Hypercars',
  'Media',
  'Equity',
  'Real Estate',
] as const

type Cat = (typeof CATEGORIES)[number]

const CAT_ICONS: Record<Cat, string> = {
  Hypercars: '🏎',
  Media: '📺',
  Equity: '📈',
  'Real Estate': '🏛',
}

const CAT_IMAGES: Record<Cat, string> = {
  Hypercars:
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=500&fit=crop&auto=format',
  Media:
    'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&h=500&fit=crop&auto=format',
  Equity:
    'https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=800&h=500&fit=crop&auto=format',
  'Real Estate':
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=500&fit=crop&auto=format',
}

export default function CreateAuctionModal({
  open,
  onClose,
  onCreated,
  creatorHandle,
}: Props) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [category, setCategory] = useState<Cat>('Hypercars')
  const [reserve, setReserve] = useState('')
  const [duration, setDuration] = useState('24')
  const [stage, setStage] = useState<'form' | 'confirming' | 'live'>(
    'form'
  )
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!open) {
      setStage('form')
      setTitle('')
      setSubtitle('')
      setReserve('')
      setDuration('24')
      setCategory('Hypercars')
      setSaveError('')
    }
  }, [open])

  const valid =
    title.trim().length > 0 &&
    reserve.trim() !== '' &&
    Number.isFinite(Number(reserve)) &&
    Number(reserve) >= 10000

  const handleCreate = async () => {
    if (!valid || stage !== 'form') return

    setSaveError('')
    setStage('confirming')

    const endsAt = new Date(
      Date.now() + Number(duration) * 60 * 60 * 1000
    ).toISOString()

    try {
      const { data, error } = await supabase
        .from('auctions')
        .insert({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          category: category,
          image: CAT_IMAGES[category],
          current_bid: 0,
          reserve: Number(reserve),
          escrow: 0,
          bids_count: 0,
          creator: creatorHandle || 'sovereign.eth',
          ends_at: endsAt,
          status: 'live',
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      if (!data) {
        throw new Error('Supabase ma’lumot qaytarmadi.')
      }

      const lot: AuctionLot = {
        id: data.id,
        title: data.title,
        subtitle:
          data.subtitle ||
          ('Created by ' + (creatorHandle || 'Sovereign')),
        category: data.category as Cat,
        image: data.image || CAT_IMAGES[category],
        currentBid: Number(data.current_bid || 0),
        reserve: Number(data.reserve || 0),
        escrow: Number(data.escrow || 0),
        secondsLeft: data.ends_at
          ? Math.max(
              0,
              Math.floor(
                (new Date(data.ends_at).getTime() - Date.now()) /
                  1000
              )
            )
          : Number(duration) * 3600,
        bids: Number(data.bids_count || 0),
        verified: false,
        creator: data.creator || 'sovereign.eth',
      }

      onCreated(lot)
      setStage('live')
    } catch (err) {
      console.error('Auction save error:', err)

      setSaveError(
        err instanceof Error
          ? err.message
          : 'Auktsionni saqlab bo‘lmadi. Qayta urinib ko‘ring.'
      )

      setStage('form')
    }
  }
             return (
    <ModalShell open={open} onClose={onClose}>
      <ModalHeader
        title="AUCTION CREATION ENGINE"
        sub="BILLIONAIRE CREATOR PORTAL"
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <AnimatePresence mode="wait">
          {stage === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div>
                <SectionLabel>AUCTION CATEGORY</SectionLabel>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  {CATEGORIES.map((cat) => (
                    <motion.button
                      key={cat}
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setCategory(cat)}
                      className="p-3 rounded-sm flex items-center gap-2.5 text-left transition-all"
                      style={{
                        background:
                          category === cat
                            ? 'rgba(212,175,55,0.09)'
                            : 'rgba(212,175,55,0.03)',
                        border:
                          '1px solid ' +
                          (category === cat
                            ? 'rgba(212,175,55,0.38)'
                            : GOLD_FAINT),
                      }}
                    >
                      <span className="text-xl">
                        {CAT_ICONS[cat]}
                      </span>

                      <div>
                        <p
                          className="text-[10px] font-black tracking-wider"
                          style={{
                            color:
                              category === cat
                                ? GOLD
                                : 'rgba(255,255,255,0.5)',
                          }}
                        >
                          {cat}
                        </p>
                      </div>

                      {category === cat && (
                        <CircleCheck
                          size={12}
                          style={{ color: GOLD }}
                          className="ml-auto shrink-0"
                        />
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel>ASSET TITLE</SectionLabel>

                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Bugatti Chiron Super Sport"
                  className="w-full px-4 py-3 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none mt-2"
                  style={{
                    background: 'rgba(212,175,55,0.04)',
                    border: '1px solid ' + GOLD_FAINT,
                  }}
                />
              </div>

              <div>
                <SectionLabel>
                  SUBTITLE / SPECS (OPTIONAL)
                </SectionLabel>

                <input
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g. VIN #001 - 1600 BHP - 1 of 8"
                  className="w-full px-4 py-3 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none mt-2"
                  style={{
                    background: 'rgba(212,175,55,0.04)',
                    border: '1px solid ' + GOLD_FAINT,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SectionLabel>RESERVE PRICE (USD)</SectionLabel>
                       <div className="relative mt-2">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                      style={{ color: GOLD_DIM }}
                    >
                      $
                    </span>

                    <input
                      type="number"
                      min="10000"
                      value={reserve}
                      onChange={(e) => setReserve(e.target.value)}
                      placeholder="500000"
                      className="w-full pl-8 pr-4 py-3 rounded-sm text-sm font-mono text-white placeholder-white/20 outline-none"
                      style={{
                        background: 'rgba(212,175,55,0.04)',
                        border: '1px solid ' + GOLD_FAINT,
                      }}
                    />
                  </div>

                  {reserve !== '' &&
                    (!Number.isFinite(Number(reserve)) ||
                      Number(reserve) < 10000) && (
                      <p className="text-[9px] text-red-400/70 mt-1">
                        Minimum reserve: $10,000
                      </p>
                    )}
                </div>

                <div>
                  <SectionLabel>DURATION (HOURS)</SectionLabel>

                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full px-4 py-3 rounded-sm text-sm font-mono text-white outline-none mt-2 appearance-none"
                    style={{
                      background: 'rgba(212,175,55,0.04)',
                      border: '1px solid ' + GOLD_FAINT,
                      color: 'white',
                    }}
                  >
                    {['6', '12', '24', '48', '72'].map((h) => (
                      <option
                        key={h}
                        value={h}
                        style={{ background: '#0B0B0C' }}
                      >
                        {h}h
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {title.trim() && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-lg"
                  style={{
                    background: 'rgba(212,175,55,0.03)',
                    border: '1px solid ' + GOLD_FAINT,
                  }}
                >
                  <SectionLabel>AUCTION PREVIEW</SectionLabel>

                  <div className="mt-3 flex items-start gap-3">
                    <div className="w-16 h-12 rounded-sm overflow-hidden shrink-0">
                      <img
                        src={CAT_IMAGES[category]}
                        alt={category}
                        className="w-full h-full object-cover"
                        style={{ filter: 'brightness(0.6)' }}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="text-white font-black text-sm">
                        {title}
                      </p>

                      <p className="text-[10px] text-white/40 mt-0.5">
                        {subtitle.trim() || category}
                      </p>

                      <div className="flex items-center gap-3 mt-1.5">
                        <span
                          className="text-[9px] font-bold"
                          style={{ color: GOLD }}
                        >
                          Reserve $
                          {reserve
                            ? Number(reserve).toLocaleString()
                            : '-'}
                        </span>

                        <span className="text-[9px] text-white/30">
                          -
                        </span>
                              <span className="text-[9px] text-white/30">
                          {duration}h duration
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div
                className="p-3 rounded-sm text-[9px] leading-relaxed text-white/40"
                style={{
                  background: 'rgba(212,175,55,0.02)',
                  border: '1px solid ' + GOLD_FAINT,
                }}
              >
                Auction details will be saved to the database.
                Blockchain escrow, payment settlement, and the 2%
                commission are not activated by this form.
              </div>

              {saveError && (
                <p
                  className="text-sm text-red-400 break-words"
                  role="alert"
                >
                  Save error: {saveError}
                </p>
              )}

              <GoldBtn
                full
                onClick={handleCreate}
                disabled={!valid || stage !== 'form'}
              >
                <Plus size={13} /> SAVE AUCTION
              </GoldBtn>
            </motion.div>
          )}

          {stage === 'confirming' && (
            <motion.div
              key="confirming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center space-y-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Infinity,
                  duration: 1,
                  ease: 'linear',
                }}
                className="w-12 h-12 mx-auto"
              >
                <Activity size={48} style={{ color: GOLD }} />
              </motion.div>

              <p
                className="font-black tracking-widest text-sm"
                style={{ color: GOLD }}
              >
                SAVING AUCTION
              </p>

              <p className="text-[10px] text-white/35">
                Saving auction details to the database...
              </p>
            </motion.div>
          )}

          {stage === 'live' && (
            <motion.div
              key="live"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center space-y-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 22,
                }}
              >
                <CircleCheck
                  size={52}
                  className="text-emerald-400 mx-auto"
                />
              </motion.div>

              <div>
                <h3 className="text-white font-black text-lg">
                  AUCTION SAVED
                </h3>

                <p className="text-[11px] text-emerald-400 mt-1 font-mono">
                  {title}
                </p>
              </div>

              <div
                className="flex items-center justify-center gap-2 py-2 px-4 rounded-sm mx-auto w-fit"
                style={{
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.2)',
                }}
              >
                <CircleCheck
                  size={13}
                  className="text-emerald-400"
                />

                <span className="text-[10px] font-bold tracking-widest text-emerald-400">
                  DATABASE SAVE CONFIRMED
                </span>
              </div>

              <p className="text-[9px] text-white/30">
                The listing was saved. Bidding, bidder verification,
                and payment settlement require separate integrations.
              </p>
                    <GoldBtn full onClick={onClose}>
                <CircleCheck size={12} /> CLOSE
              </GoldBtn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ModalShell>
  )
}