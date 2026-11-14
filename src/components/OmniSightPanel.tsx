import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, AlertTriangle, ArrowUpRight, Database, Plus, ShieldCheck, X } from 'lucide-react'
import { auditEvidence, isHttpUrl, type EvidenceRecord, type EvidenceStatus } from '../omnisight/evidence'
import type { AuctionLot } from '../types'

const STORAGE_KEY = 'valorax.omnisight.evidence.v1'

interface Props {
  open: boolean
  onClose: () => void
  lots: AuctionLot[]
}

const statusLabels: Record<EvidenceStatus, string> = {
  seller_claim: 'Seller claim',
  source_observed: 'Observed in source',
  independently_corroborated: 'Independently corroborated',
  disputed: 'Disputed',
  unknown: 'Unknown',
}

export default function OmniSightPanel({ open, onClose, lots }: Props) {
  const [records, setRecords] = useState<EvidenceRecord[]>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      return saved ? (JSON.parse(saved) as EvidenceRecord[]) : []
    } catch {
      return []
    }
  })
  const [assetName, setAssetName] = useState('')
  const [claim, setClaim] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [status, setStatus] = useState<EvidenceStatus>('seller_claim')
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch {
      setError('This browser could not save the evidence records.')
    }
  }, [records])

  const audit = useMemo(() => auditEvidence(records), [records])

  const importLotEvidence = (lot: AuctionLot) => {
    const record: EvidenceRecord = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
      assetName: lot.title,
      claim: [
        lot.subtitle ? `Listing description: ${lot.subtitle}` : '',
        `Displayed current bid: ${lot.currency || 'USD'} ${lot.currentBid.toLocaleString()}`,
        `Displayed bid count: ${lot.bids}`,
        'Imported from the listing feed. These details are source-reported and have not been independently verified.',
      ].filter(Boolean).join(' | '),
      sourceName: lot.source || lot.creator || 'External auction source',
      sourceUrl: lot.sourceUrl || '',
      status: 'source_observed',
      createdAt: new Date().toISOString(),
    }
    setRecords(current => [record, ...current])
  }

  if (!open) return null

  const addRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!assetName.trim() || !claim.trim() || !sourceName.trim()) {
      setError('Asset, claim and source name are required.')
      return
    }
    if (sourceUrl.trim() && !isHttpUrl(sourceUrl.trim())) {
      setError('Source URL must begin with http:// or https://.')
      return
    }

    const record: EvidenceRecord = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
      assetName: assetName.trim(),
      claim: claim.trim(),
      sourceName: sourceName.trim(),
      sourceUrl: sourceUrl.trim(),
      status,
      createdAt: new Date().toISOString(),
    }

    setRecords(current => [record, ...current])
    setAssetName('')
    setClaim('')
    setSourceName('')
    setSourceUrl('')
    setStatus('seller_claim')
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#050506]/95 backdrop-blur-xl">
      <div className="mx-auto min-h-full max-w-[1180px] px-4 py-6 sm:px-8">
        <header className="mb-8 flex items-start justify-between border-b border-[#D4AF37]/20 pb-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] text-[#D4AF37]">
              <Activity size={14} /> VALORAX INTELLIGENCE SYSTEM
            </div>
            <h1 className="text-2xl font-black tracking-[0.12em] text-white sm:text-3xl">OMNISIGHT</h1>
            <p className="mt-2 text-xs tracking-[0.16em] text-white/45">THE INDEPENDENT ASSET INTELLIGENCE · EVIDENCE ENGINE v0.1</p>
          </div>
          <button onClick={onClose} aria-label="Close OmniSight" className="rounded-full border border-white/15 p-2 text-white/70 transition hover:border-[#D4AF37]/60 hover:text-[#D4AF37]">
            <X size={20} />
          </button>
        </header>

        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100/80">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <strong className="block text-amber-200">Evidence workspace — prototype</strong>
            Records are saved only in this browser. This version captures and classifies evidence; it does not crawl sources, verify documents, authenticate assets, or use an AI model.
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['EVIDENCE RECORDS', audit.total],
            ['SOURCE-LINKED', audit.sourceLinked],
            ['INDEPENDENTLY CORROBORATED', audit.independentlyCorroborated],
            ['DISPUTED', audit.disputed],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#D4AF37]/15 bg-white/[0.025] p-4">
              <div className="text-[9px] font-bold tracking-[0.16em] text-white/40">{label}</div>
              <div className="mt-2 text-2xl font-black text-[#D4AF37]">{value}</div>
            </div>
          ))}
        </div>

        <section className="mb-6 rounded-xl border border-[#D4AF37]/20 bg-[#111113] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold tracking-widest text-white">LIVE SOURCE FEED</h2>
              <p className="mt-1 text-xs text-white/40">Import a currently loaded VALORAX listing into the evidence ledger</p>
            </div>
            <span className="text-[10px] text-white/40">{lots.length} LOTS</span>
          </div>
          {lots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-white/40">No auction listings are currently loaded.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {lots.slice(0, 8).map(lot => (
                <div key={lot.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">{lot.title}</p>
                    <p className="mt-1 truncate text-[10px] text-white/40">{lot.source || lot.creator || 'Source not provided'}</p>
                  </div>
                  <button type="button" onClick={() => importLotEvidence(lot)} className="shrink-0 rounded border border-[#D4AF37]/35 px-3 py-2 text-[9px] font-bold tracking-wider text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black">
                    ADD EVIDENCE
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <section className="rounded-xl border border-[#D4AF37]/20 bg-[#111113] p-5">
            <div className="mb-5 flex items-center gap-2 text-sm font-bold tracking-widest text-white">
              <Plus size={16} className="text-[#D4AF37]" /> ADD EVIDENCE
            </div>
            <form onSubmit={addRecord} className="space-y-4">
              <Field label="ASSET NAME" value={assetName} onChange={setAssetName} placeholder="e.g. 1962 Ferrari 250 GTO" />
              <div>
                <label className="mb-2 block text-[10px] font-bold tracking-widest text-white/50">CLAIM OR OBSERVATION</label>
                <textarea value={claim} onChange={event => setClaim(event.target.value)} rows={3} placeholder="Write the exact claim or what the source states..." className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition focus:border-[#D4AF37]/60" />
              </div>
              <Field label="SOURCE NAME" value={sourceName} onChange={setSourceName} placeholder="Auction house, catalogue, report..." />
              <Field label="SOURCE URL (OPTIONAL)" value={sourceUrl} onChange={setSourceUrl} placeholder="https://..." />
              <div>
                <label className="mb-2 block text-[10px] font-bold tracking-widest text-white/50">EVIDENCE CLASSIFICATION</label>
                <select value={status} onChange={event => setStatus(event.target.value as EvidenceStatus)} className="w-full rounded-md border border-white/10 bg-[#171719] px-3 py-3 text-sm text-white outline-none focus:border-[#D4AF37]/60">
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[#D4AF37] to-[#A98522] px-4 py-3 text-xs font-black tracking-[0.18em] text-black transition hover:brightness-110">
                <Plus size={15} /> SAVE EVIDENCE RECORD
              </button>
            </form>
          </section>

          <section className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-[#111113] p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold tracking-widest text-white">
                <ShieldCheck size={16} className="text-[#D4AF37]" /> EVIDENCE REVIEW
              </div>
              {audit.warnings.length === 0 ? (
                <p className="text-sm text-white/60">No current warnings.</p>
              ) : (
                <ul className="space-y-2">
                  {audit.warnings.map(warning => (
                    <li key={warning} className="flex gap-2 text-xs leading-relaxed text-amber-100/75">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" /> {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111113] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-white">
                  <Database size={16} className="text-[#D4AF37]" /> EVIDENCE LEDGER
                </div>
                <span className="text-[9px] tracking-widest text-white/35">LOCAL RECORDS</span>
              </div>
              {records.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/35">
                  No evidence added yet. Start with one asset claim and its original source.
                </div>
              ) : (
                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {records.map(record => (
                    <article key={record.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-white">{record.assetName}</h3>
                        <span className="rounded border border-[#D4AF37]/20 px-2 py-1 text-[9px] uppercase tracking-wider text-[#D4AF37]">{statusLabels[record.status]}</span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-white/70">{record.claim}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] text-white/40">
                        <span>{record.sourceName}</span>
                        {record.sourceUrl && (
                          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#D4AF37] hover:underline">
                            OPEN SOURCE <ArrowUpRight size={11} />
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
        <footer className="mt-8 border-t border-white/10 pt-4 text-[10px] leading-relaxed tracking-wider text-white/30">
          VALORAX DOES NOT SELL, OWN OR REPRESENT THE ASSETS LISTED by third parties. Evidence labels describe the record supplied to this workspace, not a guarantee of authenticity, title, condition or value.
        </footer>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="mb-2 block text-[10px] font-bold tracking-widest text-white/50">{label}</label>
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition focus:border-[#D4AF37]/60" />
    </div>
  )
}
