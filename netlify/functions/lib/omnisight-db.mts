import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type OmnisightDb = SupabaseClient

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
  const assetKey = canonicalKey(input.assetName)
  if (!assetKey) throw new Error('OMNISIGHT_ASSET_KEY_EMPTY')

  const { data: asset, error: assetError } = await db
    .from('omnisight_assets')
    .upsert({
      owner_id: userId,
      display_name: input.assetName,
      canonical_key: assetKey,
      asset_class: /pagani|ferrari|bugatti|porsche|mclaren|lamborghini|\bcar\b|vehicle/i.test(input.assetName) ? 'automotive' : 'unclassified',
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
    recorded_at: record.recordedAt ? new Date(record.recordedAt).toISOString() : null,
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

  const entities = new Map<string, { entity_type: string; canonical_key: string; label: string; attributes: Record<string, unknown> }>()
  entities.set('asset:' + assetKey, {
    entity_type: 'asset', canonical_key: assetKey, label: input.assetName, attributes: { asset_id: asset.id },
  })

  for (const record of evidence) {
    const host = safeHost(record.source_url || '')
    if (host) entities.set('source:' + host, {
      entity_type: 'source', canonical_key: host, label: host, attributes: { hostname: host },
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

  return { assetId: asset.id, analysisId: savedAnalysis.id, evidenceCount: evidence.length, graphEntityCount: savedEntities.length, graphRelationshipCount: relationships.length }
}

function assetIdsafe(entityIds: Map<string, string>, assetKey: string) {
  const id = entityIds.get('asset:' + assetKey)
  if (!id) throw new Error('OMNISIGHT_ASSET_GRAPH_NODE_MISSING')
  return id
}
