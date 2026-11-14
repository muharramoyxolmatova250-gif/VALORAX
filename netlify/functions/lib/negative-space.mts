export type NegativeSpaceCoverage = {
  key: string
  label: string
  status: 'PRESENT_IN_SUBMITTED_RECORDS' | 'NOT_PRESENT_IN_SUBMITTED_RECORDS'
  record_ids: string[]
  note: string
}

export type NegativeSpaceTraceItem = {
  action: 'search' | 'open_page' | 'find_in_page' | 'unknown'
  queries: string[]
  url: string | null
  pattern: string | null
  source_urls: string[]
}

export type NegativeSpaceAudit = {
  search_method: string
  search_scope: string[]
  searched_source_domains: string[]
  searched_source_urls: string[]
  search_queries: string[]
  search_trace: NegativeSpaceTraceItem[]
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

const GAP_GUIDANCE: Record<string, { significance: NegativeSpaceAudit['gaps'][number]['significance']; why: string; next: string }> = {
  identity: { significance: 'IDENTITY_CRITICAL', why: 'Without exact identifiers, sources may refer to a different example of the same model.', next: 'Obtain a manufacturer/build record or a legible identifier photograph, then match it to the primary source.' },
  factory: { significance: 'IDENTITY_CRITICAL', why: 'Model-level specifications cannot establish this individual example’s factory configuration.', next: 'Request a factory build sheet, certificate or marque archive confirmation where available.' },
  provenance: { significance: 'DILIGENCE_CRITICAL', why: 'An incomplete ownership timeline leaves periods and transfers unexplained.', next: 'Request dated invoices, ownership records and auction catalogues covering the missing periods.' },
  transactions: { significance: 'DILIGENCE_CRITICAL', why: 'Without completed-sale evidence, asking prices cannot establish market value.', next: 'Locate primary auction result pages or licensed verified transaction records.' },
  condition: { significance: 'DILIGENCE_CRITICAL', why: 'Public catalogues do not establish current mechanical or physical condition.', next: 'Request a recent independent inspection, service invoices and restoration records.' },
  legal: { significance: 'DILIGENCE_CRITICAL', why: 'Public web research does not establish clean title or lawful transfer.', next: 'Use qualified legal/title checks and inspect original registration and import/export documents.' },
  history: { significance: 'RESEARCH_GAP', why: 'Claimed competition, exhibition or event history may be incomplete.', next: 'Search event organisers, archives, period reports and dated photographic records.' },
}

export function buildNegativeSpaceAudit(
  coverage: NegativeSpaceCoverage[],
  citations: Array<{ title: string; url: string }>,
  searchQueries: string[] = [],
  searchTrace: NegativeSpaceTraceItem[] = [],
): NegativeSpaceAudit {
  const domains = new Set<string>()
  const sourceUrls = new Set<string>()
  for (const trace of searchTrace) {
    for (const rawUrl of [...trace.source_urls, ...(trace.url ? [trace.url] : [])]) {
      try {
        const url = new URL(rawUrl)
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          sourceUrls.add(url.href)
          domains.add(url.hostname.toLowerCase().replace(/^www\\./, ''))
        }
      } catch {
        // Ignore invalid trace URLs.
      }
    }
  }
  for (const citation of citations) {
    try {
      const url = new URL(citation.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        domains.add(url.hostname.toLowerCase().replace(/^www\./, ''))
        sourceUrls.add(url.href)
      }
    } catch {
      // Invalid citations are excluded from the search trace.
    }
  }
  const gaps = coverage
    .filter(item => item.status === 'NOT_PRESENT_IN_SUBMITTED_RECORDS')
    .map(item => {
      const guidance = GAP_GUIDANCE[item.key] ?? {
        significance: 'RESEARCH_GAP' as const,
        why: 'This expected evidence topic is not represented in the submitted evidence ledger.',
        next: 'Identify the relevant primary registry, archive or qualified specialist source and document the search.',
      }
      return {
        key: item.key,
        label: item.label,
        state: 'NOT_PRESENT_IN_SUBMITTED_RECORDS' as const,
        significance: guidance.significance,
        why_it_matters: guidance.why,
        recommended_next_evidence: guidance.next,
      }
    })
  return {
    search_method: 'OpenAI web-search research plus deterministic comparison against the submitted evidence ledger.',
    search_scope: [
      'The model was instructed to search public web sources for expected traces for the named asset and asset class.',
      searchQueries.length > 0
        ? 'The API exposed the listed web-search queries; it does not expose a complete log of every page opened, inaccessible result or the exact evidence each page supported.'
        : 'The API response did not expose query strings for this run; citation annotations alone are not a complete search audit trail.',
      'Coverage status means present or absent in the user-submitted evidence ledger; it does not prove a record was or was not found on the entire web.',
    ],
    searched_source_domains: [...domains].sort(),
    searched_source_urls: [...sourceUrls].sort(),
    search_queries: [...new Set(searchQueries.map(query => query.trim()).filter(Boolean))],
    search_trace: searchTrace,
    opened_page_urls: [...new Set(searchTrace.filter(item => item.action === 'open_page' && item.url).map(item => item.url as string))],
    find_in_page_checks: searchTrace.filter(item => item.action === 'find_in_page').map(item => ({ url: item.url, pattern: item.pattern || '' })),
    expected_trace_count: coverage.length,
    submitted_trace_count: coverage.filter(item => item.status === 'PRESENT_IN_SUBMITTED_RECORDS').length,
    gaps,
    limitations: [
      'A missing submitted record is a documentation gap, not evidence of fraud, tampering or non-existence.',
      'No result in web search does not prove that a record does not exist in private archives, paid databases, registries or offline files.',
      'Only web_search_call actions included in the API response are recorded. The trace may omit unexposed pages, inaccessible results, search-provider internals or sources not returned by the tool.',
      'Resolve high-impact gaps with primary records and human review before changing any verdict.',
    ],
  }
}
