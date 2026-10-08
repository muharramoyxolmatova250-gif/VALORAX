 import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Clock,
  Gavel,
  ExternalLink,
  Radio,
} from 'lucide-react'

import {
  GOLD,
  GOLD_DIM,
  GOLD_FAINT,
  CARD_BG,
} from './ui'

import type {
  AuctionCategory,
  AuctionLot,
} from '../types'

interface AuctionDirectoryProps {
  lots: AuctionLot[]
  onSelect: (lot: AuctionLot) => void
}

const TABS: AuctionCategory[] = [
  'ALL',
  'Cars',
  'Watches',
  'Jewelry',
  'Fine Art',
  'Real Estate',
  'Collectibles',
  'Historical',
  'Digital Assets',
  'Aircraft',
  'Wine & Spirits',
  'Motorcycles',
  'Luxury',
]

const CATEGORY_ICONS: Record<string, string> = {
  ALL: '◆',
  Cars: '🚗',
  Watches: '⌚',
  Jewelry: '💎',
  'Fine Art': '🎨',
  'Real Estate': '🏙️',
  Collectibles: '🏆',
  Historical: '🏛️',
  'Digital Assets': '◇',
  Aircraft: '✈️',
  'Wine & Spirits': '🍷',
  Motorcycles: '🏍️',
  Luxury: '♛',
}

const CATEGORY_COLORS: Record<string, string> = {
  Cars: '#D4AF37',
  Watches: '#C9A227',
  Jewelry: '#E8D28A',
  'Fine Art': '#BFA76F',
  'Real Estate': '#A98C45',
  Collectibles: '#D6B85A',
  Historical: '#B89B5E',
  'Digital Assets': '#D4AF37',
  Aircraft: '#C6A85B',
  'Wine & Spirits': '#A88942',
  Motorcycles: '#D1AF45',
  Luxury: '#E0C568',
}

function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(
    Math.max(0, initialSeconds)
  )

  useEffect(() => {
    setSeconds(Math.max(0, initialSeconds))
  }, [initialSeconds])

  useEffect(() => {
    if (seconds <= 0) return

    const timer = window.setInterval(() => {
      setSeconds(prev => Math.max(0, prev - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [seconds])

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return {
    days,
    hours,
    minutes,
    seconds: secs,
  }
}

function formatCountdown(
  days: number,
  hours: number,
  minutes: number,
  seconds: number
) {
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h`
  }

  return `${String(hours).padStart(2, '0')}:${String(
    minutes
  ).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function LotCard({
  lot,
  onSelect,
}: {
  lot: AuctionLot
  onSelect: (lot: AuctionLot) => void
}) {
  const countdown = useCountdown(lot.secondsLeft)

  const categoryColor =
    CATEGORY_COLORS[lot.category] || GOLD

  const isLive =
    lot.status === 'LIVE' ||
    (!lot.status && lot.secondsLeft > 0)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        y: -4,
        boxShadow: '0 18px 50px rgba(212,175,55,0.10)',
      }}
      className="group rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: CARD_BG,
        border: '1px solid rgba(212,175,55,0.14)',
      }}
      onClick={() => onSelect(lot)}
    >
      {/* Image */}
      <div className="relative h-56 overflow-hidden">

        <img
          src={lot.image}
          alt={lot.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{
            filter: 'brightness(0.68) saturate(0.82)',
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-transparent to-transparent" />

        {/* Category */}
        <div
          className="absolute top-3 left-3 px-2.5 py-1 rounded-sm"
          style={{
            background: 'rgba(7,8,10,0.78)',
            border: `1px solid ${categoryColor}55`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            className="text-[9px] font-black tracking-widest uppercase"
            style={{ color: categoryColor }}
          >
            {CATEGORY_ICONS[lot.category]} {lot.category}
          </span>
        </div>

        {/* Status */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
[15.09.2026 21:15] Humoyun: <span
            className="px-2 py-1 rounded-sm text-[8px] font-black tracking-widest"
            style={{
              background: isLive
                ? 'rgba(16,185,129,0.10)'
                : 'rgba(255,255,255,0.06)',
              border: isLive
                ? '1px solid rgba(16,185,129,0.25)'
                : '1px solid rgba(255,255,255,0.10)',
              color: isLive
                ? '#34D399'
                : 'rgba(255,255,255,0.45)',
            }}
          >
            {isLive ? (
              <span className="inline-flex items-center gap-1">
                <Radio size={8} />
                LIVE
              </span>
            ) : (
              lot.status || 'AUCTION'
            )}
          </span>

        </div>

        {/* Bottom title */}
        <div className="absolute bottom-4 left-4 right-4">

          <p className="text-white font-black text-lg leading-tight">
            {lot.title}
          </p>

          <p className="text-[10px] text-white/45 mt-1 line-clamp-1">
            {lot.subtitle}
          </p>

        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">

        {/* Source */}
        <div className="flex items-center justify-between">

          <div className="flex items-center gap-2">

            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: GOLD,
                boxShadow:
                  '0 0 8px rgba(212,175,55,0.6)',
              }}
            />

            <span
              className="text-[9px] font-bold tracking-widest uppercase"
              style={{ color: GOLD_DIM }}
            >
              {lot.source || 'GLOBAL AUCTION'}
            </span>

          </div>

          {lot.currency && (
            <span className="text-[8px] text-white/30">
              {lot.currency}
            </span>
          )}

        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">

          <div
            className="p-3 rounded-sm"
            style={{
              background: 'rgba(212,175,55,0.035)',
              border: `1px solid ${GOLD_FAINT}`,
            }}
          >
            <p
              className="text-[8px] tracking-widest font-bold uppercase"
              style={{ color: GOLD_DIM }}
            >
              CURRENT BID
            </p>

            <p
              className="font-black text-base mt-1"
              style={{ color: GOLD }}
            >
              {lot.currentBid > 0
                ? '$' + lot.currentBid.toLocaleString()
                : '—'}
            </p>
          </div>

          <div
            className="p-3 rounded-sm"
            style={{
              background: 'rgba(212,175,55,0.035)',
              border: `1px solid ${GOLD_FAINT}`,
            }}
          >
            <p
              className="text-[8px] tracking-widest font-bold uppercase"
              style={{ color: GOLD_DIM }}
            >
              <Clock
                size={8}
                className="inline mr-1"
              />
              TIME
            </p>

            <p
              className="font-black text-base mt-1"
              style={{ color: GOLD }}
            >
              {formatCountdown(
                countdown.days,
                countdown.hours,
                countdown.minutes,
                countdown.seconds
              )}
            </p>
          </div>

        </div>

        {/* Bottom information */}
        <div className="flex items-center justify-between">

          <div className="flex items-center gap-2">

            <Gavel
              size={11}
              style={{ color: GOLD_DIM }}
            />

            <span className="text-[9px] text-white/35">
              {lot.bids > 0
                ? `${lot.bids} bids`
                : 'Auction data'}
            </span>

          </div>
[15.09.2026 21:15] Humoyun: <motion.span
            whileHover={{ x: 2 }}
            className="flex items-center gap-1 text-[9px] font-black tracking-widest uppercase"
            style={{ color: GOLD }}
          >
            VIEW LOT
            <ExternalLink size={9} />
          </motion.span>

        </div>

      </div>
    </motion.div>
  )
}

export default function AuctionDirectory({
  lots,
  onSelect,
}: AuctionDirectoryProps) {
  const [activeTab, setActiveTab] =
    useState<AuctionCategory>('ALL')

  const filteredLots =
    activeTab === 'ALL'
      ? lots
      : lots.filter(
          lot => lot.category === activeTab
        )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">

        <div>
          <p
            className="text-[9px] tracking-[0.25em] font-bold uppercase mb-2"
            style={{ color: GOLD_DIM }}
          >
            GLOBAL AUCTION NETWORK
          </p>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Live Auction Vaults
          </h2>

          <p className="text-xs text-white/35 mt-2 max-w-xl">
            Curated access to rare assets across global
            auction markets.
          </p>
        </div>

        <div
          className="text-[9px] font-mono tracking-widest"
          style={{ color: GOLD_DIM }}
        >
          {filteredLots.length} LOTS
        </div>

      </div>

      {/* Categories */}
      <div
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
      >
        {TABS.map(tab => {

          const active = activeTab === tab

          const count =
            tab === 'ALL'
              ? lots.length
              : lots.filter(
                  lot => lot.category === tab
                ).length

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="shrink-0 px-3.5 py-2 rounded-sm transition-all"
              style={{
                background: active
                  ? 'rgba(212,175,55,0.10)'
                  : 'rgba(255,255,255,0.025)',
                border: active
                  ? '1px solid rgba(212,175,55,0.35)'
                  : '1px solid rgba(255,255,255,0.07)',
                color: active
                  ? GOLD
                  : 'rgba(255,255,255,0.42)',
              }}
            >
              <span className="text-[9px] font-black tracking-widest uppercase">
                {CATEGORY_ICONS[tab]} {tab}
              </span>

              <span
                className="ml-1.5 text-[8px]"
                style={{
                  opacity: 0.5,
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Lots */}
      {filteredLots.length > 0 ? (
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {filteredLots.map(lot => (
            <LotCard
              key={lot.id}
              lot={lot}
              onSelect={onSelect}
            />
          ))}
        </motion.div>
      ) : (
        <div
          className="rounded-xl py-16 text-center"
          style={{
            background: CARD_BG,
            border:
              '1px solid rgba(212,175,55,0.10)',
          }}
        >
          <div className="text-3xl mb-3">
            ◇
          </div>

          <p className="text-sm font-bold text-white/60">
            No auction lots available
          </p>

          <p className="text-[10px] text-white/25 mt-2">
            Auction inventory will appear here when
            the global data feed is connected.
          </p>
        </div>
      )}

    </div>
  )
}