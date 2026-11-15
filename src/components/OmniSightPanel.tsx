import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { Activity, AlertTriangle, ArrowUpRight, Database, Plus, ShieldCheck, X } from 'lucide-react'
import { auditEvidence, isHttpUrl, type EvidenceRecord, type EvidenceStatus } from '../omnisight/evidence'
import type { AuctionLot } from '../types'
import { ADVANCED_ANALYSIS_FUNCTIONS, INTELLIGENCE_MODULES, type IntelligenceFinding } from '../omnisight/intelligence'

const STORAGE_KEY = 'valorax.omnisight.evidence.v1'

type DeterministicModuleSignal = {
  module: string
  state: 'ACTIONABLE' | 'LIMITED' | 'NO_SIGNAL'
  observations: string[]
  checks: string[]
  evidence_record_ids: string[]
  limitations: string[]
  conflicts?: Array<{ attribute: string; values: string[]; record_ids: string[]; source_domains: string[] }>
  connections?: Array<{ related_asset: string; related_asset_key: string; shared_entity: string; shared_entity_type: string; relationship_type: string; evidence_id: string | null; review_status: string }>
}
type DeterministicModuleReport = {
  generated_by: 'deterministic_rules_v1'
  modules: Record<string, DeterministicModuleSignal>
}

type AnalysisResponse = {
  deterministic_modules: DeterministicModuleReport
  analysis: {
    verdict: 'GOOD' | 'BAD' | 'UNCERTAIN'
    confidence: number
    summary: string
    provider_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null
    web_search_call_count: number
    conflicts: Array<{ topic: string; evidence_a: string; evidence_b: string; significance: string }>
    source_assessments: Array<{ source: string; finding: string; reliability: 'strong' | 'medium' | 'weak' | 'unknown' }>
    unknowns: string[]
    next_checks: string[]
    intelligence: Record<string, IntelligenceFinding>
    service_layers: {
      global_asset_discovery: { summary: string; priorities: string[]; limitations: string[] }
      private_collector_intelligence: { summary: string; priorities: string[]; limitations: string[] }
    }
    advanced_analysis: Record<string, IntelligenceFinding>
  }
  expected_evidence_checklist: {
    asset_class: string
    expected_traces: string[]
    interpretation: string
  }
  negative_space_audit: {
    search_method: string
    search_scope: string[]
    searched_source_domains: string[]
    searched_source_urls: string[]
    search_queries: string[]
    search_trace: Array<{
      action: 'search' | 'open_page' | 'find_in_page' | 'unknown'
      queries: string[]
      url: string | null
      pattern: string | null
      source_urls: string[]
    }>
    opened_page_urls: string[]
    find_in_page_checks: Array<{ url: string | null; pattern: string }>
    expected_trace_count: number
    submitted_trace_count: number
    gaps: Array<{
      key: string
      label: string
      state: 'NOT_PRESENT_IN_SUBMITTED_RECORDS'
      significance: 'RESEARCH_GAP' | 'IDENTITY_CRITICAL' | 'DILIGENCE_CRITICAL'
      why_it_matters: string
      recommended_next_evidence: string
    }>
    limitations: string[]
  }
  submitted_evidence_coverage: Array<{
    key: string
    label: string
    status: 'PRESENT_IN_SUBMITTED_RECORDS' | 'NOT_PRESENT_IN_SUBMITTED_RECORDS'
    record_ids: string[]
    note: string
  }>
  market_summary: {
    total_records: number
    sold_records: number
    unsold_records: number
    withdrawn_records: number
    currency_groups: Array<{
      currency: string
      count: number
      minimum: number
      median: number
      maximum: number
      sale_dates: string[]
    }>
    limitations: string[]
  }
  curated_market_comparables: {
    records: Array<{
      make: string
      model: string
      model_year: number | null
      chassis_identifier: string | null
      production_serial: string | null
      auction_house: string
      auction_name: string
      lot_number: string | null
      sale_date: string | null
      event_start: string | null
      event_end: string | null
      location: string | null
      sale_amount: number
      currency: string
      result_status: 'sold' | 'unsold' | 'withdrawn'
      source_url: string
      source_title: string
    }>
    queryState: 'make_not_recognized' | 'rights_cleared_records_found' | 'no_rights_cleared_records'
  }
  identity_identifiers: Array<{
    identifier_type: 'vin_or_chassis' | 'production_serial'
    value: string
    normalized_value: string
  }>
  persistence: { globalAssetId: string | null; identityState: 'single_vin_candidate' | 'multiple_vin_candidates' | 'model_only'; assetId: string; analysisId: string; evidenceCount: number; graphEntityCount: number; graphRelationshipCount: number; globalSourceCount: number }
  usage: { used: number; limit: number; resets_at: string }
  citations: Array<{ title: string; url: string }>
  source_lineage: {
    records: Array<{
      title: string
      url: string
      hostname: string
      publisher_domain: string
      normalized_url: string
      title_fingerprint: string
      publisher_type: 'publisher' | 'distribution_platform' | 'unknown'
      independence_state: 'same_publisher' | 'potentially_dependent' | 'independence_unverified'
      dependency_reasons: string[]
    }>
    distinct_publisher_domains: number
    corroboration_candidate_domains: number
    potentially_dependent_groups: number
    limitations: string[]
  }
  verdict_guard: {
    applied: boolean
    reasons: string[]
    policy: string
  }
  checkedAt: string
  model: string
  disclaimer: string
}

interface Props {
  open: boolean
  onClose: () => void
  lots: AuctionLot[]
  initialLot?: AuctionLot | null
}

const statusLabels: Record<EvidenceStatus, string> = {
  seller_claim: 'Seller claim',
  source_observed: 'Observed in source',
  independently_corroborated: 'Independently corroborated',
  disputed: 'Disputed',
  unknown: 'Unknown',
}

export default function OmniSightPanel({ open, onClose, lots, initialLot = null }: Props) {
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
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    } catch {
      setError('This browser could not save the evidence records.')
    }
  }, [records])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    }).catch(() => {
      if (active) setAuthMessage('Could not read the secure account session.')
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) setAuthMessage('Secure account connected.')
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const audit = useMemo(() => auditEvidence(records), [records])

  const runAnalysis = async () => {
    setAnalysisError('')
    setAnalysisResult(null)
    if (records.length === 0) {
      setAnalysisError('Add at least one evidence record before analysis.')
      return
    }

    if (!session?.access_token) {
      setAnalysisError('Sign in to your VALORAX account before starting private research.')
      return
    }

    const assetNameForAnalysis = assetName.trim() || records[0].assetName
    const assetRecords = records.filter(record => record.assetName === assetNameForAnalysis).slice(0, 12)
    if (assetRecords.length === 0) {
      setAnalysisError('No evidence records are available for this selected lot yet.')
      return
    }
    setAnalysisLoading(true)
    try {
      const response = await fetch('/api/omnisight/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ assetName: assetNameForAnalysis, records: assetRecords }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Analysis request failed.')
      }
      setAnalysisResult(payload as AnalysisResponse)
    } catch (caught) {
      setAnalysisError(caught instanceof Error ? caught.message : 'Could not complete analysis.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const sendMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthMessage('')
    if (!supabaseConfigured) {
      setAuthMessage('Supabase is not configured for this deployment yet.')
      return
    }
    setAuthLoading(true)
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (authError) throw authError
      setAuthMessage('Sign-in link sent. Open the email on this device to securely connect your account.')
    } catch (caught) {
      setAuthMessage(caught instanceof Error ? caught.message : 'Could not send sign-in link.')
    } finally {
      setAuthLoading(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setAuthMessage('Signed out.')
  }

  const importLotEvidence = (lot: AuctionLot) => {
    const alreadyImported = records.some(record =>
      record.assetName === lot.title && record.sourceUrl === (lot.sourceUrl || '')
    )
    if (alreadyImported) {
      setAssetName(lot.title)
      return
    }
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
    setAssetName(lot.title)
  }

  useEffect(() => {
    if (open && initialLot) importLotEvidence(initialLot)
  }, [open, initialLot?.id])

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
            <strong className="block text-amber-200">Evidence workspace — server setup required</strong>
            Draft evidence records are saved in this browser. Independent server research is currently unavailable until the Netlify server keys and AI model settings are configured. After setup, submitted research is processed server-side and saved to the private VALORAX account. AI findings are research leads, not proof of authenticity, ownership or condition.
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold tracking-widest text-white">PRIVATE COLLECTOR ACCOUNT</h2>
              <p className="mt-1 text-xs text-white/45">Research is private to your signed-in account and saved securely.</p>
            </div>
            {session ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-emerald-200">{session.user.email || 'Authenticated account'}</span>
                <button type="button" onClick={signOut} className="rounded border border-white/15 px-3 py-2 text-[10px] text-white/70 hover:border-[#D4AF37]/50">SIGN OUT</button>
              </div>
            ) : (
              <form onSubmit={sendMagicLink} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input type="email" required value={authEmail} onChange={event => setAuthEmail(event.target.value)} placeholder="Your email address" className="min-w-0 rounded border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-[#D4AF37] sm:w-64" />
                <button type="submit" disabled={authLoading || !supabaseConfigured} className="rounded bg-[#D4AF37] px-4 py-2 text-[10px] font-black tracking-widest text-black disabled:opacity-50">{authLoading ? 'SENDING...' : 'SEND SECURE LINK'}</button>
              </form>
            )}
          </div>
          {authMessage && <p role="status" className="mt-3 text-xs text-amber-200/80">{authMessage}</p>}
          {!session && <p className="mt-2 text-[10px] leading-relaxed text-white/35">{supabaseConfigured ? 'A one-time sign-in link will be sent by Supabase Auth. Research is unavailable until the link is confirmed.' : 'Supabase URL and anon key must be configured before account sign-in is available.'}</p>}
        </section>

        <section className="mb-6 rounded-xl border border-[#D4AF37]/20 bg-[#111113] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold tracking-widest text-white">SERVER-SIDE INTELLIGENCE</h2>
              <p className="mt-1 text-xs text-white/40">Research sources, compare claims and identify evidence conflicts · 10 analyses/month</p>
            </div>
            <button type="button" onClick={runAnalysis} disabled={analysisLoading || records.length === 0 || !session} className="rounded-md bg-gradient-to-r from-[#D4AF37] to-[#A98522] px-4 py-3 text-[10px] font-black tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-40">
              {analysisLoading ? 'RESEARCHING...' : 'ANALYZE LATEST ASSET'}
            </button>
          </div>
          {!analysisResult && (
            <section className="mt-5 rounded-xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#17140B] to-[#0B0B0D] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] font-bold tracking-[0.24em] text-[#D4AF37]">VALORAX PRIVATE MEMBERSHIP · OMNISIGHT</p>
                  <h3 className="mt-1 text-lg font-black tracking-widest text-white">PRIVATE ASSET REPORT</h3>
                  <p className="mt-1 text-[10px] text-white/40">The six-part research report appears here after an evidence-based analysis.</p>
                </div>
                <span className="rounded border border-[#D4AF37]/30 px-2 py-1 text-[9px] font-bold tracking-widest text-[#D4AF37]">{analysisLoading ? 'ANALYSIS IN PROGRESS' : 'AWAITING ANALYSIS'}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['GOOD · SUPPORTED SIGNALS', 'Verified positive findings supported by cited evidence.', 'border-emerald-400/25', 'text-emerald-200'],
                  ['BAD · MATERIAL CONCERNS', 'Conflicts, defects or adverse findings identified in available sources.', 'border-rose-400/25', 'text-rose-200'],
                  ['RISKS · DUE DILIGENCE', 'Financial, legal, technical and liquidity checks that may be required.', 'border-amber-400/25', 'text-amber-200'],
                  ['UNCERTAINTIES · NOT VERIFIED', 'Missing records, unresolved claims and evidence gaps.', 'border-white/15', 'text-white/75'],
                ].map(([title, description, borderTone, titleTone]) => (
                  <div key={title} className={`space-y-2 rounded-lg border ${borderTone} bg-black/25 p-3`}>
                    <h4 className={`text-[10px] font-black tracking-[0.15em] ${titleTone}`}>{title}</h4>
                    <p className="text-xs leading-relaxed text-white/45">{description}</p>
                    <p className="text-[9px] font-bold tracking-widest text-white/25">AWAITING EVIDENCE ANALYSIS</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-[#D4AF37]/20 bg-black/30 p-4">
                <h4 className="text-[10px] font-black tracking-[0.18em] text-[#D4AF37]">MARKET ANALYSIS</h4>
                <p className="mt-2 text-xs leading-relaxed text-white/45">Historical comparables, sold/unsold results and price ranges will appear only when rights-cleared records are available. No unsupported estimate will be shown.</p>
                <p className="mt-2 text-[9px] font-bold tracking-widest text-white/25">AWAITING MARKET DATA</p>
              </div>
              <div className="mt-3 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[.06] p-4">
                <p className="text-[9px] font-bold tracking-[0.2em] text-[#D4AF37]">FINAL OMNISIGHT VERDICT</p>
                <p className="mt-2 text-xs leading-relaxed text-white/45">A GOOD, BAD or UNCERTAIN conclusion with confidence level and evidence limitations will be shown after analysis.</p>
                <p className="mt-2 text-[9px] font-bold tracking-widest text-white/25">VERDICT NOT YET AVAILABLE</p>
              </div>
            </section>
          )}
          {analysisError && <p role="alert" className="mt-3 text-xs text-red-300">{analysisError}</p>}
          {analysisResult && (
            <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded border px-3 py-1 text-xs font-black tracking-widest ${analysisResult.analysis.verdict === 'BAD' ? 'border-red-400/40 text-red-300' : analysisResult.analysis.verdict === 'GOOD' ? 'border-emerald-400/40 text-emerald-300' : 'border-amber-300/40 text-amber-200'}`}>{analysisResult.analysis.verdict}</span>
                <span className="text-[10px] text-white/40">Confidence: {Math.round(analysisResult.analysis.confidence * 100)}%</span>
                <span className="text-[10px] text-white/30">{new Date(analysisResult.checkedAt).toLocaleString()}</span>
              </div>
              <p className="text-sm leading-relaxed text-white/80">{analysisResult.analysis.summary}</p>
              <section className="rounded-xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#17140B] to-[#0B0B0D] p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.24em] text-[#D4AF37]">VALORAX PRIVATE MEMBERSHIP · OMNISIGHT</p>
                    <h3 className="mt-1 text-lg font-black tracking-widest text-white">PRIVATE ASSET REPORT</h3>
                  </div>
                  <span className="rounded border border-[#D4AF37]/30 px-2 py-1 text-[9px] font-bold tracking-widest text-[#D4AF37]">EVIDENCE-LED</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ReportSection title="GOOD · SUPPORTED SIGNALS" tone="good">
                    {Object.entries(analysisResult.analysis.intelligence).filter(([, finding]) => finding.status === 'SUPPORTED' && finding.findings.length > 0).length > 0 ? (
                      Object.entries(analysisResult.analysis.intelligence).filter(([, finding]) => finding.status === 'SUPPORTED' && finding.findings.length > 0).map(([key, finding]) => (
                        <div key={key} className="border-b border-white/10 pb-2 last:border-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">{key.replace(/_/g, ' ')}</p>
                          <p className="mt-1 text-xs leading-relaxed text-white/70">{finding.summary}</p>
                          {finding.findings.map((item, index) => <p key={index} className="mt-1 text-[11px] text-white/55">• {item}</p>)}
                        </div>
                      ))
                    ) : <p className="text-xs text-white/50">No supported positive signals were established from the submitted research. This is not a negative verdict.</p>}
                  </ReportSection>
                  <ReportSection title="BAD · MATERIAL CONCERNS" tone="bad">
                    {analysisResult.analysis.conflicts.length > 0 ? analysisResult.analysis.conflicts.map((item, index) => (
                      <div key={index} className="border-b border-white/10 pb-2 last:border-0">
                        <p className="text-xs font-bold text-rose-200">{item.topic}</p>
                        <p className="mt-1 text-[11px] text-white/65">A: {item.evidence_a}</p>
                        <p className="text-[11px] text-white/65">B: {item.evidence_b}</p>
                        <p className="mt-1 text-[10px] text-white/40">{item.significance}</p>
                      </div>
                    )) : <p className="text-xs text-white/50">No material contradiction was identified in the returned evidence. This does not prove the asset is free of defects or risk.</p>}
                  </ReportSection>
                  <ReportSection title="RISKS · DUE DILIGENCE" tone="risk">
                    {analysisResult.analysis.next_checks.length > 0 ? analysisResult.analysis.next_checks.map((item, index) => <p key={index} className="text-xs leading-relaxed text-white/65">• {item}</p>) : <p className="text-xs text-white/50">No next-check items were returned. Independent inspection and document review may still be necessary.</p>}
                    {analysisResult.analysis.source_assessments.filter(item => item.reliability === 'weak' || item.reliability === 'unknown').map((item, index) => <p key={'source-' + index} className="text-[11px] text-amber-100/70">Source caution · {item.source}: {item.finding}</p>)}
                  </ReportSection>
                  <ReportSection title="UNCERTAINTIES · NOT VERIFIED" tone="unknown">
                    {analysisResult.analysis.unknowns.length > 0 || analysisResult.negative_space_audit.gaps.length > 0 ? (
                      <>
                        {analysisResult.analysis.unknowns.map((item, index) => <p key={'unknown-' + index} className="text-xs leading-relaxed text-white/65">• {item}</p>)}
                        {analysisResult.negative_space_audit.gaps.map((item, index) => <p key={'gap-' + index} className="text-xs leading-relaxed text-amber-100/65">• {item.label}: {item.why_it_matters} Recommended evidence: {item.recommended_next_evidence}</p>)}
                      </>
                    ) : <p className="text-xs text-white/50">No explicit unknowns were returned. Review the evidence coverage and source limitations before relying on this report.</p>}
                  </ReportSection>
                </div>
                <div className="mt-3 rounded-lg border border-[#D4AF37]/20 bg-black/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[10px] font-black tracking-[0.18em] text-[#D4AF37]">MARKET ANALYSIS</h4>
                    <span className="text-[9px] text-white/35">Rights-cleared database comparables only</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MarketMetric label="RECORDS" value={analysisResult.market_summary.total_records} />
                    <MarketMetric label="SOLD" value={analysisResult.market_summary.sold_records} />
                    <MarketMetric label="UNSOLD" value={analysisResult.market_summary.unsold_records} />
                    <MarketMetric label="WITHDRAWN" value={analysisResult.market_summary.withdrawn_records} />
                  </div>
                  {analysisResult.market_summary.currency_groups.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {analysisResult.market_summary.currency_groups.map(group => (
                        <div key={group.currency} className="rounded border border-white/10 p-3 text-xs text-white/65">
                          <strong className="text-white">{group.currency}</strong> · {group.count} records · low {group.minimum.toLocaleString()} · median {group.median.toLocaleString()} · high {group.maximum.toLocaleString()}
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-xs text-amber-100/65">No rights-cleared historical sale records are currently available in the database. No market price estimate is presented.</p>}
                  {analysisResult.market_summary.limitations.map((item, index) => <p key={index} className="mt-2 text-[10px] text-white/40">{item}</p>)}
                  {analysisResult.curated_market_comparables.records.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {analysisResult.curated_market_comparables.records.map((sale, index) => (
                        <a key={sale.source_url + index} href={sale.source_url} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 p-3 text-xs hover:border-[#D4AF37]/40">
                          <span className="text-white/75">{sale.model_year || 'Year n/a'} {sale.make} {sale.model} · {sale.auction_house}</span>
                          <span className="text-[#D4AF37]">{sale.currency} {sale.sale_amount.toLocaleString()} · {sale.result_status.toUpperCase()}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-3 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[.06] p-4">
                  <p className="text-[9px] font-bold tracking-[0.2em] text-[#D4AF37]">FINAL OMNISIGHT VERDICT</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className={`text-xl font-black tracking-widest ${analysisResult.analysis.verdict === 'GOOD' ? 'text-emerald-300' : analysisResult.analysis.verdict === 'BAD' ? 'text-rose-300' : 'text-amber-200'}`}>{analysisResult.analysis.verdict}</span>
                    <span className="text-[10px] text-white/45">Confidence {Math.round(analysisResult.analysis.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/65">{analysisResult.analysis.summary}</p>
                  <p className="mt-2 text-[10px] text-white/35">Research assessment only — not authentication, a condition report, legal advice or a guaranteed valuation.</p>
                </div>
                {analysisResult.citations.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-[9px] font-bold tracking-widest text-white/40">REPORT SOURCES</p>
                    <div className="space-y-1">{analysisResult.citations.map((citation, index) => <a key={citation.url + index} href={citation.url} target="_blank" rel="noreferrer" className="block break-all text-[10px] text-[#D4AF37] hover:underline">{citation.title || citation.url}</a>)}</div>
                  </div>
                )}
              </section>
              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <h3 className="text-[10px] font-bold tracking-[0.18em] text-white/55">API USAGE & COST TRANSPARENCY</h3>
                {analysisResult.analysis.provider_usage ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                    <div><span className="block text-white/35">Input tokens</span><span className="text-white">{analysisResult.analysis.provider_usage.input_tokens.toLocaleString()}</span></div>
                    <div><span className="block text-white/35">Output tokens</span><span className="text-white">{analysisResult.analysis.provider_usage.output_tokens.toLocaleString()}</span></div>
                    <div><span className="block text-white/35">Total tokens</span><span className="text-white">{analysisResult.analysis.provider_usage.total_tokens.toLocaleString()}</span></div>
                    <div><span className="block text-white/35">Web-search calls</span><span className="text-[#D4AF37]">{analysisResult.analysis.web_search_call_count}</span></div>
                  </div>
                ) : <p className="mt-2 text-xs text-white/45">Provider token usage was not exposed for this response.</p>}
                <p className="mt-2 text-[10px] leading-relaxed text-white/35">Actual currency cost is not estimated here because it depends on the configured model, search calls and current provider pricing. Check the OpenAI project usage dashboard.</p>
              </section>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <h3 className="text-[10px] font-bold tracking-[0.18em] text-[#D4AF37]">SERVER VERDICT EVIDENCE GATE</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{analysisResult.verdict_guard.policy}</p>
                {analysisResult.verdict_guard.applied && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200">
                    {analysisResult.verdict_guard.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
                  </ul>
                )}
              </div>

              {analysisResult.analysis.conflicts.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[10px] font-bold tracking-widest text-red-200">POTENTIAL CONFLICTS</h3>
                  <div className="space-y-2">
                    {analysisResult.analysis.conflicts.map((item, index) => <div key={index} className="rounded border border-red-300/15 bg-red-300/[0.04] p-3 text-xs text-white/70"><strong className="text-white">{item.topic}</strong><p className="mt-1">A: {item.evidence_a}</p><p>B: {item.evidence_b}</p><p className="mt-1 text-white/45">{item.significance}</p></div>)}
                  </div>
                </div>
              )}
              {analysisResult.analysis.source_assessments.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[10px] font-bold tracking-widest text-[#D4AF37]">SOURCE ASSESSMENTS</h3>
                  <ul className="space-y-2">{analysisResult.analysis.source_assessments.map((item,index)=><li key={index} className="text-xs text-white/65"><strong className="text-white">{item.source}</strong> · {item.reliability} — {item.finding}</li>)}</ul>
                </div>
              )}
              {analysisResult.analysis.unknowns.length > 0 && <div><h3 className="mb-2 text-[10px] font-bold tracking-widest text-amber-200">UNKNOWNS</h3><ul className="list-disc space-y-1 pl-5 text-xs text-white/60">{analysisResult.analysis.unknowns.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
              {analysisResult.analysis.next_checks.length > 0 && <div><h3 className="mb-2 text-[10px] font-bold tracking-widest text-white/65">NEXT CHECKS</h3><ul className="list-disc space-y-1 pl-5 text-xs text-white/60">{analysisResult.analysis.next_checks.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
              <section className="rounded-lg border border-[#D4AF37]/15 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">IDENTITY REGISTER · EXACT IDENTIFIERS</h3>
                  <span className="text-[10px] text-white/35">Monthly analyses: {analysisResult.usage.used}/{analysisResult.usage.limit}</span>
                </div>
                {analysisResult.identity_identifiers.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-100/65">No explicitly labelled VIN/chassis or production serial was found in submitted evidence. Do not infer a serial from digits inside a VIN.</p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {analysisResult.identity_identifiers.map(item => (
                      <div key={item.identifier_type + item.normalized_value} className="rounded border border-white/10 p-3">
                        <span className="text-[9px] font-bold tracking-widest text-white/40">{item.identifier_type === 'vin_or_chassis' ? 'VIN / CHASSIS IDENTIFIER' : 'FACTORY PRODUCTION SERIAL'}</span>
                        <p className="mt-1 break-all font-mono text-sm text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[10px] text-white/35">Public registry: {analysisResult.persistence.globalAssetId ? 'matched curated asset' : 'no curated exact-asset match'} · Identity key: {analysisResult.persistence.identityState.replace(/_/g, ' ')} · Saved evidence: {analysisResult.persistence.evidenceCount} · Private graph: {analysisResult.persistence.graphEntityCount} entities / {analysisResult.persistence.graphRelationshipCount} links · Global sources indexed: {analysisResult.persistence.globalSourceCount}</p>
              </section>
              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">CURATED HISTORICAL SALES</h3>
                  <span className="text-[10px] text-white/35">{analysisResult.curated_market_comparables.records.length} rights-cleared records</span>
                </div>
                {analysisResult.curated_market_comparables.records.length === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-white/45">No rights-cleared comparable sales are currently available in the database. This does not mean no historical sales exist; use the cited public auction research separately.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {analysisResult.curated_market_comparables.records.map((sale, index) => (
                      <div key={sale.source_url} className="rounded border border-white/10 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{sale.model_year || ''} {sale.make} {sale.model} · {sale.production_serial || 'serial not recorded'}</span>
                          <span className="font-mono text-xs text-[#D4AF37]">{sale.currency} {sale.sale_amount.toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-white/45">{sale.auction_house} · {sale.auction_name} · {sale.sale_date || 'sale day not recorded'} · {sale.result_status.toUpperCase()}</p>
                        <p className="mt-1 text-[10px] text-white/40">Chassis: {sale.chassis_identifier || 'not recorded'} · Lot: {sale.lot_number || 'not recorded'}</p>
                        <a href={sale.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] text-[#D4AF37] hover:underline">{sale.source_title}</a>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-[10px] font-bold tracking-[0.18em] text-[#D4AF37]">VALUATION INTELLIGENCE · VERIFIED SALES SUMMARY</h3>
                <p className="mt-2 text-xs text-white/55">{analysisResult.market_summary.sold_records} sold · {analysisResult.market_summary.unsold_records} unsold · {analysisResult.market_summary.withdrawn_records} withdrawn records</p>
                {analysisResult.market_summary.currency_groups.length === 0 ? (
                  <p className="mt-2 text-xs text-white/45">No eligible rights-cleared sold comparables were returned. OMNISIGHT will not estimate a price from asking prices or uncleared records.</p>
                ) : analysisResult.market_summary.currency_groups.map(group => (
                  <div key={group.currency} className="mt-3 rounded border border-white/10 p-3">
                    <p className="text-xs font-semibold text-white">{group.currency} · {group.count} verified sold comparables</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div><span className="block text-white/35">Low</span><span className="text-white">{group.minimum.toLocaleString()}</span></div>
                      <div><span className="block text-white/35">Median</span><span className="text-[#D4AF37]">{group.median.toLocaleString()}</span></div>
                      <div><span className="block text-white/35">High</span><span className="text-white">{group.maximum.toLocaleString()}</span></div>
                    </div>
                  </div>
                ))}
                {analysisResult.market_summary.limitations.map(item => <p key={item} className="mt-2 text-[10px] leading-relaxed text-white/35">• {item}</p>)}
              </section>
              <section className="rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-4">
                <h3 className="text-[10px] font-bold tracking-[0.2em] text-amber-200">EXPECTED EVIDENCE MAP · {analysisResult.expected_evidence_checklist.asset_class.replace(/_/g, ' ')}</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/55">{analysisResult.expected_evidence_checklist.interpretation}</p>
                <ul className="mt-3 grid gap-2 text-xs text-white/70 md:grid-cols-2">
                  {analysisResult.expected_evidence_checklist.expected_traces.map((item, index) => <li key={index} className="flex gap-2"><span className="text-amber-200">•</span>{item}</li>)}
                </ul>
              </section>
              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">SUBMITTED EVIDENCE COVERAGE · DETERMINISTIC CHECK</h3>
                <p className="mt-2 text-xs text-white/45">This checks only the records entered into this evidence workspace. It does not claim to measure every public record worldwide.</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {analysisResult.submitted_evidence_coverage.map(item => (
                    <div key={item.key} className="rounded border border-white/10 bg-black/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white/80">{item.label}</span>
                        <span className={`text-[9px] font-bold tracking-wider ${item.status === 'PRESENT_IN_SUBMITTED_RECORDS' ? 'text-emerald-300' : 'text-amber-200'}`}>{item.status === 'PRESENT_IN_SUBMITTED_RECORDS' ? 'RECORD MATCHED' : 'NO RECORD MATCH'}</span>
                      </div>
                      <p className="mt-2 text-[10px] leading-relaxed text-white/45">{item.note}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="space-y-3 border-t border-[#D4AF37]/20 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">8 DETERMINISTIC MODULE CHECKS</h3>
                  <span className="text-[9px] tracking-wider text-white/35">RULE ENGINE · {analysisResult.deterministic_modules.generated_by}</span>
                </div>
                <p className="text-[10px] leading-relaxed text-white/45">Independent rule-based checks over submitted evidence and cleared sale records. These checks do not replace source verification or specialist review.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(analysisResult.deterministic_modules.modules).map(([key, item]) => (
                    <div key={key} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-white">{item.module}</h4>
                        <span className={item.state === 'ACTIONABLE' ? 'text-[9px] font-bold tracking-wider text-amber-200' : item.state === 'LIMITED' ? 'text-[9px] font-bold tracking-wider text-white/45' : 'text-[9px] font-bold tracking-wider text-white/35'}>{item.state.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {item.observations.map((line, index) => <p key={index} className="text-[10px] leading-relaxed text-white/70">{line}</p>)}
                      </div>
                      {item.evidence_record_ids.length > 0 && <p className="mt-2 text-[9px] text-emerald-200/60">MATCHED RECORDS: {item.evidence_record_ids.join(', ')}</p>}
                      {item.connections?.map((connection, index) => (
                        <div key={index} className="mt-2 rounded border border-sky-300/20 bg-sky-300/[0.04] p-2">
                          <p className="text-[9px] font-bold tracking-wider text-sky-200">SAVED-GRAPH CONNECTION · {connection.review_status.toUpperCase()}</p>
                          <p className="mt-1 text-[10px] text-white/75">{connection.related_asset} ↔ {connection.shared_entity} ({connection.shared_entity_type})</p>
                          <p className="mt-1 text-[9px] text-white/40">{connection.relationship_type} · Evidence ID: {connection.evidence_id || 'not linked'}</p>
                        </div>
                      ))}
                      {item.conflicts?.map((conflict, index) => (
                        <div key={index} className="mt-2 rounded border border-amber-300/20 bg-amber-300/[0.04] p-2">
                          <p className="text-[9px] font-bold tracking-wider text-amber-200">CONFLICT CANDIDATE · {conflict.attribute.replace(/_/g, ' ')}</p>
                          <p className="mt-1 text-[10px] text-white/70">{conflict.values.join(' ≠ ')}</p>
                          <p className="mt-1 text-[9px] text-white/40">Records: {conflict.record_ids.join(', ')} · Domains: {conflict.source_domains.filter(Boolean).join(', ') || 'not supplied'}</p>
                        </div>
                      ))}
                      <MiniList title="NEXT CHECKS" items={item.checks} />
                      <MiniList title="LIMITATIONS" items={item.limitations} />
                    </div>
                  ))}
                </div>
              </section>
              <section className="space-y-4 border-t border-white/10 pt-4">
                <div>
                  <h3 className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">8 INTELLIGENCE MODULES</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {INTELLIGENCE_MODULES.map(module => {
                      const finding = analysisResult.analysis.intelligence[module.key]
                      return <FindingCard key={module.key} title={module.name} finding={finding} />
                    })}
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">2 SERVICE LAYERS</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {Object.entries(analysisResult.analysis.service_layers).map(([key, layer]) => (
                      <div key={key} className="rounded-lg border border-[#D4AF37]/15 bg-black/20 p-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-white">{key.replace(/_/g, ' ')}</h4>
                        <p className="mt-2 text-xs leading-relaxed text-white/65">{layer.summary}</p>
                        <MiniList title="PRIORITIES" items={layer.priorities} />
                        <MiniList title="LIMITATIONS" items={layer.limitations} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">7 ADVANCED ANALYSIS FUNCTIONS</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {ADVANCED_ANALYSIS_FUNCTIONS.map(module => (
                      <FindingCard key={module.key} title={module.name} finding={analysisResult.analysis.advanced_analysis[module.key]} />
                    ))}
                  </div>
                </div>
              </section>
              <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold tracking-[0.18em] text-[#D4AF37]">SOURCE LINEAGE & INDEPENDENCE SCREEN</h3>
                  <span className="text-[10px] text-white/40">{analysisResult.source_lineage.corroboration_candidate_domains} unverified candidate domains</span>
                </div>
                <p className="mt-2 text-xs text-white/55">{analysisResult.source_lineage.distinct_publisher_domains} publisher domains · {analysisResult.source_lineage.potentially_dependent_groups} possible dependency groups</p>
                <div className="mt-3 space-y-2">
                  {analysisResult.source_lineage.records.map((source, index) => (
                    <div key={source.normalized_url || source.url} className="rounded border border-white/10 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-white">{source.publisher_domain}</span>
                        <span className={source.independence_state === 'potentially_dependent' ? 'text-[10px] text-amber-200' : 'text-[10px] text-white/40'}>{source.independence_state.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-white/55">{source.title}</p>
                      {source.dependency_reasons.map(reason => <p key={reason} className="mt-1 text-[10px] text-amber-100/60">{reason}</p>)}
                    </div>
                  ))}
                </div>
                {analysisResult.source_lineage.limitations.map(item => <p key={item} className="mt-2 text-[10px] leading-relaxed text-white/35">• {item}</p>)}
              </section>
              <section className="rounded-lg border border-amber-300/15 bg-amber-300/[0.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold tracking-[0.18em] text-amber-200">NEGATIVE-SPACE / MISSING TRACE AUDIT</h3>
                  <span className="text-[10px] text-white/45">{analysisResult.negative_space_audit.gaps.length} documentation gaps</span>
                </div>
                <p className="mt-2 text-xs text-white/60">{analysisResult.negative_space_audit.submitted_trace_count} of {analysisResult.negative_space_audit.expected_trace_count} expected topics appear in submitted records</p>
                <div className="mt-3 space-y-2">
                  {analysisResult.negative_space_audit.gaps.map(gap => (
                    <div key={gap.key} className="rounded border border-white/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-white">{gap.label}</span>
                        <span className={gap.significance === 'IDENTITY_CRITICAL' ? 'text-[10px] text-amber-200' : 'text-[10px] text-white/40'}>{gap.significance.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/55">{gap.why_it_matters}</p>
                      <p className="mt-1 text-[11px] text-white/75">Next evidence: {gap.recommended_next_evidence}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-white/45">Searched citation domains: {analysisResult.negative_space_audit.searched_source_domains.join(', ') || 'No citation domains returned'}</p>
                <div className="mt-2">
                  <p className="text-[10px] text-white/45">Web-search queries exposed by the API:</p>
                  {analysisResult.negative_space_audit.search_queries.length ? analysisResult.negative_space_audit.search_queries.map((query, index) => (
                    <p key={index} className="mt-1 text-[10px] text-white/65">• {query}</p>
                  )) : <p className="mt-1 text-[10px] text-white/35">No query strings were exposed for this run.</p>}
                </div>
                <div className="mt-2">
                  <p className="text-[10px] text-white/45">Pages opened by the research tool:</p>
                  {analysisResult.negative_space_audit.opened_page_urls.length ? analysisResult.negative_space_audit.opened_page_urls.map(url => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[10px] text-[#D4AF37] hover:underline">{url}</a>
                  )) : <p className="mt-1 text-[10px] text-white/35">No open-page actions were exposed.</p>}
                </div>
                {analysisResult.negative_space_audit.find_in_page_checks.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-white/45">In-page checks:</p>
                    {analysisResult.negative_space_audit.find_in_page_checks.map((check, index) => <p key={index} className="mt-1 text-[10px] text-white/60">{check.pattern} · {check.url || 'URL not exposed'}</p>)}
                  </div>
                )}
                {analysisResult.negative_space_audit.limitations.map(item => <p key={item} className="mt-2 text-[10px] leading-relaxed text-white/35">• {item}</p>)}
              </section>
              {analysisResult.citations.length > 0 && <div><h3 className="mb-2 text-[10px] font-bold tracking-widest text-white/65">RESEARCH SOURCES</h3><ul className="space-y-1">{analysisResult.citations.map((item,index)=><li key={index}><a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-[#D4AF37] hover:underline">{item.title}</a></li>)}</ul></div>}
              <p className="border-t border-white/10 pt-3 text-[10px] leading-relaxed text-white/30">{analysisResult.disclaimer}</p>
            </div>
          )}
        </section>

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

function ReportSection({ title, tone, children }: { title: string; tone: 'good' | 'bad' | 'risk' | 'unknown'; children: React.ReactNode }) {
  const toneClass = tone === 'good' ? 'border-emerald-400/25' : tone === 'bad' ? 'border-rose-400/25' : tone === 'risk' ? 'border-amber-400/25' : 'border-white/15'
  const titleClass = tone === 'good' ? 'text-emerald-200' : tone === 'bad' ? 'text-rose-200' : tone === 'risk' ? 'text-amber-200' : 'text-white/75'
  return <div className={`space-y-2 rounded-lg border ${toneClass} bg-black/25 p-3`}><h4 className={`text-[10px] font-black tracking-[0.15em] ${titleClass}`}>{title}</h4><div className="space-y-2">{children}</div></div>
}

function MarketMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-white/10 bg-white/[0.02] p-2"><p className="text-[8px] tracking-widest text-white/35">{label}</p><p className="mt-1 text-lg font-black text-[#D4AF37]">{value.toLocaleString()}</p></div>
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="mb-2 block text-[10px] font-bold tracking-widest text-white/50">{label}</label>
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition focus:border-[#D4AF37]/60" />
    </div>
  )
}

function FindingCard({ title, finding }: { title: string; finding: IntelligenceFinding }) {
  const statusClass = finding.status === 'SUPPORTED'
    ? 'border-emerald-400/30 text-emerald-300'
    : finding.status === 'CONFLICT'
      ? 'border-red-400/30 text-red-300'
      : finding.status === 'NOT_FOUND'
        ? 'border-amber-300/30 text-amber-200'
        : 'border-white/20 text-white/60'
  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-white">{title}</h4>
        <span className={`rounded border px-2 py-1 text-[9px] font-bold tracking-wider ${statusClass}`}>{finding.status}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/70">{finding.summary}</p>
      <p className="mt-2 text-[10px] text-white/40">Confidence: {Math.round(finding.confidence * 100)}%</p>
      <MiniList title="FINDINGS" items={finding.findings} />
      <MiniList title="LIMITATIONS" items={finding.limitations} />
      <MiniList title="NEXT ACTIONS" items={finding.next_actions} />
      {finding.evidence_refs.length > 0 && <ul className="mt-2 space-y-1">{finding.evidence_refs.map((url, index) => <li key={index}><a href={url} target="_blank" rel="noreferrer" className="break-all text-[10px] text-[#D4AF37] hover:underline">Evidence reference {index + 1}</a></li>)}</ul>}
    </article>
  )
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return <div className="mt-2"><h5 className="text-[9px] font-bold tracking-widest text-white/35">{title}</h5><ul className="mt-1 list-disc space-y-1 pl-4 text-[10px] leading-relaxed text-white/55">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
}
