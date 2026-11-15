import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { extractGraphCandidates } from './graph-extract.mts'

export type OmnisightDb = SupabaseClient

export type ExtractedAssetIdentifier = {
  identifier_type: 'vin_or_chassis' | 'production_serial'
  value: string
  normalized_value: string
}

export function extractAssetIdentifiers(text: string): ExtractedAssetIdentifier[] {
  const found = new Map<string, ExtractedAssetIdentifier>()
  const vin = /\b([A-HJ-NPR-Z0-9]{17})\b/g
  for (const match of text.matchAll(vin)) {
    const value = match[1].toUpperCase()
    found.set('vin_or_chassis:' + value, {
      identifier_type: 'vin_or_chassis',
      value,
      normalized_value: value,
    })
  }

  const serialPatterns = [
    /(?:serial(?:\s+no\.?|\s+number)?|production\s+serial)\s*[:#-]?\s*(\d{1,3}\s*\/\s*\d{1,3})/gi,
    /(?:numbered|number)\s+(\d{1,3})\s+(?:of|out of)\s+(\d{1,3})/gi,
  ]
  for (const pattern of serialPatterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[2] ? `${match[1]}/${match[2]}` : match[1].replace(/\s+/g, '')
      found.set('production_serial:' + value, {
        identifier_type: 'production_serial',
        value,
        normalized_value: value,
      })
    }
  }
  return [...found.values()]
}

export function createOmnisightAdmin(): OmnisightDb {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('OMNISIGHT_DATABASE_NOT_CONFIGURED')
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'valorax-omnisight-server' } },
  })
}

export async function authenticateOmnisightUser(db: OmnisightDb, authorization: string | null) {
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  if (!token || token.length > 8192) return null
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user || data.user.is_anonymous) return null
  return data.user
}

export async function consumeOmnisightRateLimit(db: OmnisightDb, userId: string) {
  const { data, error } = await db.rpc('omnisight_consume_rate_limit', {
    p_user_id: userId,
    p_limit: 3,
    p_window_seconds: 60,
  })
  if (error || !Array.isArray(data) || !data[0]) {
    throw new Error('OMNISIGHT_RATE_LIMIT_CHECK_FAILED')
  }
  return data[0] as { allowed: boolean; used: number; resets_at: string }
}

export async function consumeOmnisightCredit(db: OmnisightDb, userId: string) {
  const { data, error } = await db.rpc('omnisight_consume_monthly_credit', {
    p_user_id: userId,
    p_monthly_limit: 10,
  })
  if (error || !Array.isArray(data) || !data[0]) {
    throw new Error('OMNISIGHT_QUOTA_CHECK_FAILED')
  }
  return data[0] as { allowed: boolean; used: number; monthly_limit: number; resets_at: string }
}

export function resolveAssetCanonicalKey(assetName: string, recordTexts: string[]) {
  const modelKey = assetName.normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160)
  const identifiers = recordTexts.flatMap(text => extractAssetIdentifiers(text))
  const exactVins = [...new Set(identifiers
    .filter(item => item.identifier_type === 'vin_or_chassis')
    .map(item => item.normalized_value))]
  return {
    canonicalKey: exactVins.length === 1 ? 'identifier-' + exactVins[0].toLowerCase() : 'model-' + modelKey,
    identityState: exactVins.length === 1 ? 'single_vin_candidate' : exactVins.length > 1 ? 'multiple_vin_candidates' : 'model_only',
  }
}

function canonicalKey(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160)
}

function safeHost(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

export type CuratedMarketSale = {
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
}

export async function fetchCuratedMarketSales(db: OmnisightDb, assetName: string) {
  const normalized = assetName.toLowerCase()
  let make = ''
  let model = ''
  if (normalized.includes('pagani') && normalized.includes('huayra r')) {
    make = 'Pagani'
    model = 'Huayra R'
  } else if (normalized.includes('ferrari')) {
    make = 'Ferrari'
  } else if (normalized.includes('bugatti')) {
    make = 'Bugatti'
  } else if (normalized.includes('porsche')) {
    make = 'Porsche'
  } else if (normalized.includes('mclaren')) {
    make = 'McLaren'
  } else if (normalized.includes('lamborghini')) {
    make = 'Lamborghini'
  }
  if (!make) return { records: [] as CuratedMarketSale[], queryState: 'make_not_recognized' as const }

  let query = db.from('omnisight_market_sales')
    .select('make,model,model_year,chassis_identifier,production_serial,auction_house,auction_name,lot_number,sale_date,event_start,event_end,location,sale_amount,currency,result_status,source_url,source_title')
    .eq('make', make)
    .eq('verification_status', 'verified')
    .in('data_use_status', ['licensed', 'public_domain', 'permission_granted'])
    .order('sale_date', { ascending: false })
    .limit(25)
  if (model) query = query.eq('model', model)
  const { data, error } = await query
  if (error) throw new Error('OMNISIGHT_MARKET_DATA_QUERY_FAILED')
  return { records: (data || []) as CuratedMarketSale[], queryState: data?.length ? 'rights_cleared_records_found' as const : 'no_rights_cleared_records' as const }
}

export async function fetchLatestOmnisightResearch(db: OmnisightDb, userId: string, assetName: string) {
  const { data: asset, error: assetError } = await db
    .from('omnisight_assets')
    .select('id')
    .eq('owner_id', userId)
    .eq('display_name', assetName)
    .maybeSingle()
  if (assetError) throw new Error('OMNISIGHT_ASSET_HISTORY_LOOKUP_FAILED')
  if (!asset) return null

  const { data, error } = await db
    .from('omnisight_analyses')
    .select('id,model,verdict,confidence,report,citations,created_at')
    .eq('owner_id', userId)
    .eq('asset_id', asset.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('OMNISIGHT_REPORT_HISTORY_LOOKUP_FAILED')
  return data
}

export async function updateOmnisightResearchReport(
  db: OmnisightDb,
  userId: string,
  analysisId: string,
  report: Record<string, unknown>,
) {
  const { error } = await db
    .from('omnisight_analyses')
    .update({ report })
    .eq('id', analysisId)
    .eq('owner_id', userId)
  if (error) throw new Error('OMNISIGHT_FULL_REPORT_SAVE_FAILED')
}

export async function persistOmnisightResearch(
  db: OmnisightDb,
  userId: string,
  input: {
    assetName: string
    records: Array<{ id: string; claim: string; sourceName: string; sourceUrl: string; status: string; recordedAt: string }>
    analysis: { verdict: string; confidence: number; [key: string]: unknown }
    citations: Array<{ title: string; url: string }>
    model: string
  },
) {
  const modelKey = canonicalKey(input.assetName)
  if (!modelKey) throw new Error('OMNISIGHT_ASSET_KEY_EMPTY')
  // Use a chassis/VIN key only when the submitted evidence agrees on exactly one.
  // Multiple conflicting identifiers stay on a model-level key and remain unresolved.
  const identityResolution = resolveAssetCanonicalKey(
    input.assetName,
    input.records.map(record => [record.claim, record.sourceName].join(' ')),
  )
  const submittedIdentifiers = input.records.flatMap(record => extractAssetIdentifiers([record.claim, record.sourceName].join(' ')))
  const assetKey = identityResolution.canonicalKey

  const assetClass = /pagani|ferrari|bugatti|porsche|mclaren|lamborghini|\bcar\b|vehicle/i.test(input.assetName) ? 'automotive' : 'unclassified'
  // Never publish a user-entered asset name into the shared index.
  // Link to a global asset only when an exact, pre-curated public identifier already exists.
  const { data: globalAsset, error: globalAssetError } = await db
    .from('omnisight_global_assets')
    .select('id')
    .eq('canonical_key', assetKey)
    .maybeSingle()
  if (globalAssetError) throw new Error('OMNISIGHT_GLOBAL_ASSET_LOOKUP_FAILED')

  const { data: asset, error: assetError } = await db
    .from('omnisight_assets')
    .upsert({
      owner_id: userId,
      global_asset_id: globalAsset?.id ?? null,
      display_name: input.assetName,
      canonical_key: assetKey,
      asset_class: assetClass,
    }, { onConflict: 'owner_id,canonical_key' })
    .select('id')
    .single()
  if (assetError || !asset) throw new Error('OMNISIGHT_ASSET_PERSIST_FAILED')

  const evidenceRows = input.records.map(record => ({
    owner_id: userId,
    asset_id: asset.id,
    client_record_id: record.id,
    claim: record.claim,
    source_name: record.sourceName,
    source_url: record.sourceUrl || null,
    evidence_status: record.status,
    recorded_at: record.recordedAt && Number.isFinite(Date.parse(record.recordedAt)) ? new Date(record.recordedAt).toISOString() : null,
  }))
  const { data: evidence, error: evidenceError } = await db
    .from('omnisight_evidence')
    .upsert(evidenceRows, { onConflict: 'owner_id,asset_id,client_record_id' })
    .select('id,client_record_id,source_url,source_name')
  if (evidenceError || !evidence) throw new Error('OMNISIGHT_EVIDENCE_PERSIST_FAILED')

  const { data: savedAnalysis, error: analysisError } = await db
    .from('omnisight_analyses')
    .insert({
      owner_id: userId,
      asset_id: asset.id,
      model: input.model,
      verdict: input.analysis.verdict,
      confidence: input.analysis.confidence,
      report: input.analysis,
      citations: input.citations,
    })
    .select('id')
    .single()
  if (analysisError || !savedAnalysis) throw new Error('OMNISIGHT_ANALYSIS_PERSIST_FAILED')

  // Only URLs returned as web-search citations enter the shared public source index.
  // This records discovery, not factual verification or claim support.
  const citationDomains = [...new Set(input.citations.map(item => safeHost(item.url)).filter(Boolean))]
  let globalSourceCount = 0
  if (globalAsset && input.citations.length > 0) {
    const sourceRows = citationDomains.map(domain => ({
      domain,
      display_name: domain,
    }))
    const { data: globalSources, error: globalSourceError } = await db
      .from('omnisight_global_sources')
      .upsert(sourceRows, { onConflict: 'domain' })
      .select('id,domain')
    if (globalSourceError || !globalSources) throw new Error('OMNISIGHT_GLOBAL_SOURCE_PERSIST_FAILED')

    const sourceIds = new Map(globalSources.map(source => [source.domain, source.id]))
    const globalLinks = input.citations.flatMap(citation => {
      const domain = safeHost(citation.url)
      const sourceId = sourceIds.get(domain)
      if (!sourceId) return []
      return [{
        global_asset_id: globalAsset.id,
        global_source_id: sourceId,
        source_url: citation.url,
        source_title: citation.title,
        source_kind: 'web_search_citation',
        evidence_state: 'search_returned',
        last_seen_at: new Date().toISOString(),
      }]
    })
    if (globalLinks.length) {
      const { error: linkError } = await db
        .from('omnisight_global_asset_sources')
        .upsert(globalLinks, { onConflict: 'global_asset_id,source_url' })
      if (linkError) throw new Error('OMNISIGHT_GLOBAL_SOURCE_LINK_PERSIST_FAILED')
      globalSourceCount = globalLinks.length
    }
  }

  const entities = new Map<string, { entity_type: string; canonical_key: string; label: string; attributes: Record<string, unknown> }>()
  const graphCandidates = input.records.flatMap(record => extractGraphCandidates({
    id: record.id, claim: record.claim, sourceName: record.sourceName, sourceUrl: record.sourceUrl,
  }))
  entities.set('asset:' + assetKey, {
    entity_type: 'asset', canonical_key: assetKey, label: input.assetName, attributes: { asset_id: asset.id },
  })

  for (const record of evidence) {
    const host = safeHost(record.source_url || '')
    if (host) entities.set('source:' + host, {
      entity_type: 'source', canonical_key: host, label: host, attributes: { hostname: host },
    })
  }
  for (const record of input.records) {
    for (const identifier of extractAssetIdentifiers([record.claim, record.sourceName].join(' '))) {
      const key = identifier.identifier_type + ':' + identifier.normalized_value
      entities.set(key, {
        entity_type: 'identifier',
        canonical_key: key,
        label: identifier.value,
        attributes: { identifier_type: identifier.identifier_type, normalized_value: identifier.normalized_value },
      })
    }
  }

  for (const candidate of graphCandidates) {
    const key = candidate.entity_type + ':' + candidate.canonical_key
    const current = entities.get(key)
    entities.set(key, {
      entity_type: candidate.entity_type,
      canonical_key: candidate.canonical_key,
      label: candidate.label,
      attributes: {
        ...(current?.attributes ?? {}),
        ...candidate.attributes,
        extraction_state: 'candidate_only',
      },
    })
  }

  for (const citation of input.citations) {
    const host = safeHost(citation.url)
    if (host) entities.set('source:' + host, {
      entity_type: 'source', canonical_key: host, label: host, attributes: { hostname: host },
    })
  }

  const entityRows = [...entities.values()].map(entity => ({ owner_id: userId, ...entity }))
  const { data: savedEntities, error: entityError } = await db
    .from('omnisight_entities')
    .upsert(entityRows, { onConflict: 'owner_id,entity_type,canonical_key' })
    .select('id,entity_type,canonical_key')
  if (entityError || !savedEntities) throw new Error('OMNISIGHT_GRAPH_ENTITY_PERSIST_FAILED')

  const entityIds = new Map(savedEntities.map(entity => [entity.entity_type + ':' + entity.canonical_key, entity.id]))
  const relationships: Array<Record<string, unknown>> = []
  const evidenceByClientId = new Map(evidence.map(row => [row.client_record_id, row.id]))
  for (const candidate of graphCandidates) {
    const evidenceId = evidenceByClientId.get(candidate.evidence_record_id)
    const targetId = entityIds.get(candidate.entity_type + ':' + candidate.canonical_key)
    if (!evidenceId || !targetId) continue
    relationships.push({
      owner_id: userId,
      from_entity_id: assetIdsafe(entityIds, assetKey),
      to_entity_id: targetId,
      relationship_type: candidate.relationship_type,
      evidence_id: evidenceId,
      analysis_id: savedAnalysis.id,
      confidence: 0,
      review_status: 'candidate',
    })
  }

  for (const record of input.records) {
    const evidenceId = evidenceByClientId.get(record.id)
    if (!evidenceId) continue
    for (const identifier of extractAssetIdentifiers([record.claim, record.sourceName].join(' '))) {
      const key = identifier.identifier_type + ':' + identifier.normalized_value
      const identifierId = entityIds.get(key)
      if (!identifierId) continue
      relationships.push({
        owner_id: userId,
        from_entity_id: assetIdsafe(entityIds, assetKey),
        to_entity_id: identifierId,
        relationship_type: 'identifier_mentioned_in_submitted_record',
        evidence_id: evidenceId,
        analysis_id: savedAnalysis.id,
        confidence: 0,
        review_status: 'candidate',
      })
    }
  }
  for (const record of evidence) {
    const host = safeHost(record.source_url || '')
    const sourceId = host ? entityIds.get('source:' + host) : undefined
    if (sourceId) relationships.push({
      owner_id: userId,
      from_entity_id: assetIdsafe(entityIds, assetKey),
      to_entity_id: sourceId,
      relationship_type: 'documented_by_submitted_source',
      evidence_id: record.id,
      analysis_id: savedAnalysis.id,
      confidence: 0,
      review_status: 'candidate',
    })
  }
  for (const citation of input.citations) {
    const host = safeHost(citation.url)
    const sourceId = host ? entityIds.get('source:' + host) : undefined
    if (sourceId) relationships.push({
      owner_id: userId,
      from_entity_id: assetIdsafe(entityIds, assetKey),
      to_entity_id: sourceId,
      relationship_type: 'cited_by_research',
      analysis_id: savedAnalysis.id,
      confidence: 0,
      review_status: 'candidate',
    })
  }
  if (relationships.length) {
    const { error: relationError } = await db.from('omnisight_relationships').upsert(relationships, {
      onConflict: 'owner_id,from_entity_id,to_entity_id,relationship_type,evidence_id',
      ignoreDuplicates: true,
    })
    if (relationError) throw new Error('OMNISIGHT_GRAPH_RELATION_PERSIST_FAILED')
  }

  return { globalAssetId: globalAsset?.id ?? null, identityState: identityResolution.identityState, assetId: asset.id, analysisId: savedAnalysis.id, evidenceCount: evidence.length, graphEntityCount: savedEntities.length, graphRelationshipCount: relationships.length, discoveredGraphCandidateCount: graphCandidates.length, globalSourceCount }
}


export async function findCrossAssetConnections(
  db: OmnisightDb,
  userId: string,
  assetName: string,
  records: Array<{ id: string; claim: string; sourceName: string; sourceUrl: string }>,
) {
  const identity = resolveAssetCanonicalKey(assetName, records.map(record => [record.claim, record.sourceName].join(' ')))
  const { data: currentAssetNode, error: currentAssetError } = await db
    .from('omnisight_entities')
    .select('id')
    .eq('owner_id', userId)
    .eq('entity_type', 'asset')
    .eq('canonical_key', identity.canonicalKey)
    .maybeSingle()
  if (currentAssetError) throw new Error('OMNISIGHT_CROSS_ASSET_CURRENT_NODE_FAILED')
  if (!currentAssetNode) return { state: 'NO_SIGNAL' as const, links: [], limitations: ['Current asset has no persisted graph node yet.'] }

  const candidates = records.flatMap(record => extractGraphCandidates(record))
  const candidateKeys = [...new Set(candidates.map(item => item.entity_type + ':' + item.canonical_key))]
  const identifierKeys = records.flatMap(record => extractAssetIdentifiers([record.claim, record.sourceName].join(' ')))
    .map(item => 'identifier:' + item.identifier_type + ':' + item.normalized_value)
  const allKeys = [...new Set([...candidateKeys, ...identifierKeys])]
  if (!allKeys.length) return { state: 'NO_SIGNAL' as const, links: [], limitations: ['No explicit shared entity or identifier candidates were extracted from submitted evidence.'] }

  const { data: sharedNodes, error: sharedNodeError } = await db
    .from('omnisight_entities')
    .select('id,entity_type,canonical_key,label')
    .eq('owner_id', userId)
    .in('entity_type', ['person','organization','auction','document','event','identifier'])
    .in('canonical_key', allKeys.map(key => key.slice(key.indexOf(':') + 1)))
  if (sharedNodeError) throw new Error('OMNISIGHT_CROSS_ASSET_ENTITY_LOOKUP_FAILED')
  if (!sharedNodes?.length) return { state: 'NO_SIGNAL' as const, links: [], limitations: ['No matching graph entities were found in this user\'s saved research.'] }

  const { data: currentLinks, error: currentLinksError } = await db
    .from('omnisight_relationships')
    .select('to_entity_id')
    .eq('owner_id', userId)
    .eq('from_entity_id', currentAssetNode.id)
    .in('review_status', ['candidate','verified'])
  if (currentLinksError) throw new Error('OMNISIGHT_CROSS_ASSET_CURRENT_LINKS_FAILED')
  const currentTargetIds = new Set((currentLinks ?? []).map(item => item.to_entity_id))
  const sharedIds = sharedNodes.filter(node => currentTargetIds.has(node.id)).map(node => node.id)
  if (!sharedIds.length) return { state: 'NO_SIGNAL' as const, links: [], limitations: ['No persisted shared entity links exist for the current asset.'] }

  const { data: priorLinks, error: priorLinksError } = await db
    .from('omnisight_relationships')
    .select('from_entity_id,to_entity_id,relationship_type,evidence_id,review_status')
    .eq('owner_id', userId)
    .in('to_entity_id', sharedIds)
    .neq('from_entity_id', currentAssetNode.id)
    .in('review_status', ['candidate','verified'])
    .limit(100)
  if (priorLinksError) throw new Error('OMNISIGHT_CROSS_ASSET_RELATION_LOOKUP_FAILED')
  if (!priorLinks?.length) return { state: 'NO_SIGNAL' as const, links: [], limitations: ['No prior asset in saved research shares these evidence-linked entities.'] }

  const priorAssetIds = [...new Set(priorLinks.map(link => link.from_entity_id))]
  const { data: priorAssets, error: priorAssetsError } = await db
    .from('omnisight_entities')
    .select('id,label,canonical_key')
    .eq('owner_id', userId)
    .eq('entity_type', 'asset')
    .in('id', priorAssetIds)
  if (priorAssetsError) throw new Error('OMNISIGHT_CROSS_ASSET_ASSET_LOOKUP_FAILED')
  const assetsById = new Map((priorAssets ?? []).map(asset => [asset.id, asset]))
  const nodesById = new Map(sharedNodes.map(node => [node.id, node]))
  const links = priorLinks.flatMap(link => {
    const asset = assetsById.get(link.from_entity_id)
    const node = nodesById.get(link.to_entity_id)
    if (!asset || !node) return []
    return [{
      related_asset: asset.label,
      related_asset_key: asset.canonical_key,
      shared_entity: node.label,
      shared_entity_type: node.entity_type,
      relationship_type: link.relationship_type,
      evidence_id: link.evidence_id,
      review_status: link.review_status,
    }]
  })
  return {
    state: links.length ? 'ACTIONABLE' as const : 'NO_SIGNAL' as const,
    links,
    limitations: [
      'Connections are candidate leads from this user\'s saved graph, not proof of common ownership, authenticity or wrongdoing.',
      'A shared marque, auction house or event can be incidental; a human must inspect the cited evidence and relationship context.',
      'Only evidence previously saved in this user\'s OMNISIGHT workspace is searched; no global or private external database is queried.',
    ],
  }
}

function assetIdsafe(entityIds: Map<string, string>, assetKey: string) {
  const id = entityIds.get('asset:' + assetKey)
  if (!id) throw new Error('OMNISIGHT_ASSET_GRAPH_NODE_MISSING')
  return id
}
