import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
  const { data: globalAsset, error: globalAssetError } = await db
    .from('omnisight_global_assets')
    .upsert({
      display_name: input.assetName,
      canonical_key: assetKey,
      asset_class: assetClass,
    }, { onConflict: 'canonical_key' })
    .select('id')
    .single()
  if (globalAssetError || !globalAsset) throw new Error('OMNISIGHT_GLOBAL_ASSET_PERSIST_FAILED')

  const { data: asset, error: assetError } = await db
    .from('omnisight_assets')
    .upsert({
      owner_id: userId,
      global_asset_id: globalAsset.id,
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
  if (input.citations.length > 0) {
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
  entities.set('asset:' + assetKey, {
    entity_type: 'asset', canonical_key: assetKey, label: input.assetName, attributes: { asset_id: asset.id },
  })

  const evidenceByClientId = new Map(evidence.map(row => [row.client_record_id, row.id]))
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

  return { globalAssetId: globalAsset.id, identityState: identityResolution.identityState, assetId: asset.id, analysisId: savedAnalysis.id, evidenceCount: evidence.length, graphEntityCount: savedEntities.length, graphRelationshipCount: relationships.length, globalSourceCount }
}

function assetIdsafe(entityIds: Map<string, string>, assetKey: string) {
  const id = entityIds.get('asset:' + assetKey)
  if (!id) throw new Error('OMNISIGHT_ASSET_GRAPH_NODE_MISSING')
  return id
}
