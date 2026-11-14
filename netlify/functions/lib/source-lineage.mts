export type ResearchCitation = { title: string; url: string }

export type SourceLineageRecord = {
  title: string
  url: string
  hostname: string
  publisher_domain: string
  normalized_url: string
  title_fingerprint: string
  publisher_type: 'publisher' | 'distribution_platform' | 'unknown'
  independence_state: 'same_publisher' | 'potentially_dependent' | 'independence_unverified'
  dependency_reasons: string[]
}

export type SourceLineageReport = {
  records: SourceLineageRecord[]
  distinct_publisher_domains: number
  corroboration_candidate_domains: number
  potentially_dependent_groups: number
  limitations: string[]
}

const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au', 'edu.au',
  'co.nz', 'org.nz', 'co.jp', 'com.br',
  'com.sg', 'com.mx', 'co.za', 'com.tr',
])

const DISTRIBUTION_DOMAINS = new Set([
  'prnewswire.com',
  'globenewswire.com',
  'businesswire.com',
  'accesswire.com',
  'einpresswire.com',
  'prweb.com',
  'newsfilecorp.com',
  'globe24-7.com',
  'newswire.ca',
  'newswire.com',
])

function hostnameOf(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
  } catch {
    return ''
  }
}

function publisherDomain(hostname: string) {
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length < 2) return hostname
  const lastTwo = labels.slice(-2).join('.')
  return MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3
    ? labels.slice(-3).join('.')
    : lastTwo
}

function normalizedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|gclid|fbclid|mc_cid|mc_eid|ref|ref_src|source|campaign)$/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    url.protocol = 'https:'
    if ((url.port === '80') || (url.port === '443')) url.port = ''
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
    url.searchParams.sort()
    return url.toString()
  } catch {
    return ''
  }
}

function titleFingerprint(title: string) {
  return title.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 1 && !['the', 'and', 'for', 'with', 'from'].includes(token))
    .join(' ')
}

export function analyzeSourceLineage(citations: ResearchCitation[]): SourceLineageReport {
  const prepared = citations.flatMap(citation => {
    const hostname = hostnameOf(citation.url)
    if (!hostname) return []
    const domain = publisherDomain(hostname)
    const isDistribution = DISTRIBUTION_DOMAINS.has(domain)
    return [{
      title: citation.title.trim(),
      url: citation.url,
      hostname,
      publisher_domain: domain,
      normalized_url: normalizedUrl(citation.url),
      title_fingerprint: titleFingerprint(citation.title),
      publisher_type: isDistribution ? 'distribution_platform' as const : 'publisher' as const,
    }]
  })

  const titleDomains = new Map<string, Set<string>>()
  for (const record of prepared) {
    if (!record.title_fingerprint) continue
    const domains = titleDomains.get(record.title_fingerprint) ?? new Set<string>()
    domains.add(record.publisher_domain)
    titleDomains.set(record.title_fingerprint, domains)
  }

  const domainCounts = new Map<string, number>()
  for (const record of prepared) {
    domainCounts.set(record.publisher_domain, (domainCounts.get(record.publisher_domain) ?? 0) + 1)
  }

  const records: SourceLineageRecord[] = prepared.map(record => {
    const dependency_reasons: string[] = []
    if (record.publisher_type === 'distribution_platform') {
      dependency_reasons.push('Known press-release or news-distribution platform; publication does not establish independent reporting.')
    }
    if ((domainCounts.get(record.publisher_domain) ?? 0) > 1) {
      dependency_reasons.push('Multiple cited pages come from the same publisher domain.')
    }
    if (record.title_fingerprint && (titleDomains.get(record.title_fingerprint)?.size ?? 0) > 1) {
      dependency_reasons.push('Matching normalized headline appears across different publisher domains; possible syndication or shared origin.')
    }
    const independence_state = dependency_reasons.some(reason =>
      reason.startsWith('Known press-release') ||
      reason.startsWith('Matching normalized headline')
    ) ? 'potentially_dependent' as const
      : dependency_reasons.length ? 'same_publisher' as const
      : 'independence_unverified' as const
    return { ...record, independence_state, dependency_reasons }
  })

  const uniqueDomains = new Set(records.map(record => record.publisher_domain))
  const uniqueCandidateDomains = new Set(
    records
      .filter(record => record.publisher_type === 'publisher' && record.independence_state === 'independence_unverified')
      .map(record => record.publisher_domain)
  )
  const dependencyGroups = new Set(
    records.filter(record => record.independence_state === 'potentially_dependent')
      .map(record => record.title_fingerprint || record.publisher_domain)
  )

  return {
    records,
    distinct_publisher_domains: uniqueDomains.size,
    corroboration_candidate_domains: uniqueCandidateDomains.size,
    potentially_dependent_groups: dependencyGroups.size,
    limitations: [
      'Different publisher domains do not prove independent reporting or separate source origins.',
      'Matching headlines and known distribution platforms are dependency warnings, not proof that two pages share the same underlying source.',
      'Automated lineage checks cannot replace reading the articles, tracing their cited primary sources, and reviewing publication ownership.',
      'A publisher not flagged here is independence-unverified, not confirmed independent.',
    ],
  }
}
