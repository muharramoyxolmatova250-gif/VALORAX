type WebSearchTraceItem = {
  action: 'search' | 'open_page' | 'find_in_page' | 'unknown'
  queries: string[]
  url: string | null
  pattern: string | null
  source_urls: string[]
}

export function extractOpenAiResponse(payload: any): {
  text: string
  citations: Array<{ title: string; url: string }>
  searchQueries: string[]
  searchTrace: WebSearchTraceItem[]
  providerUsage: { input_tokens: number; output_tokens: number; total_tokens: number } | null
} {
  const chunks: string[] = []
  const citations: Array<{ title: string; url: string }> = []
  const searchTrace: WebSearchTraceItem[] = []
  for (const item of payload?.output ?? []) {
    if (item.type === 'web_search_call') {
      const action = item.action ?? {}
      const actionType = action.type
      const queries = Array.isArray(action.queries)
        ? action.queries.filter((query: unknown): query is string => typeof query === 'string' && Boolean(query.trim()))
        : typeof action.query === 'string' && action.query.trim() ? [action.query] : []
      const sourceUrls = Array.isArray(action.sources)
        ? action.sources.flatMap((source: any) => {
            if (typeof source?.url !== 'string') return []
            try {
              const url = new URL(source.url)
              return ['http:', 'https:'].includes(url.protocol) ? [url.href] : []
            } catch {
              return []
            }
          })
        : []
      let url: string | null = null
      if (typeof action.url === 'string') {
        try {
          const parsed = new URL(action.url)
          if (['http:', 'https:'].includes(parsed.protocol)) url = parsed.href
        } catch {
          // Ignore malformed tool trace URLs.
        }
      }
      searchTrace.push({
        action: actionType === 'search' || actionType === 'open_page' || actionType === 'find_in_page' ? actionType : 'unknown',
        queries,
        url,
        pattern: typeof action.pattern === 'string' ? action.pattern : null,
        source_urls: [...new Set(sourceUrls)],
      })
      continue
    }
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string') {
        chunks.push(part.text)
        for (const annotation of part.annotations ?? []) {
          if (annotation.type === 'url_citation' && typeof annotation.url === 'string') {
            try {
              const citationUrl = new URL(annotation.url)
              if (citationUrl.protocol === 'http:' || citationUrl.protocol === 'https:') {
                citations.push({
                  title: typeof annotation.title === 'string' ? annotation.title : annotation.url,
                  url: citationUrl.href,
                })
              }
            } catch {
              // Ignore malformed or non-web citation references.
            }
          }
        }
      }
    }
  }
  const unique = [...new Map(citations.map(item => [item.url, item])).values()]
  const searchQueries = [...new Set(searchTrace.flatMap(item => item.queries))]
  const usage = payload?.usage
  const providerUsage = usage &&
    Number.isFinite(usage.input_tokens) &&
    Number.isFinite(usage.output_tokens) &&
    Number.isFinite(usage.total_tokens)
    ? {
        input_tokens: Math.max(0, Math.floor(usage.input_tokens)),
        output_tokens: Math.max(0, Math.floor(usage.output_tokens)),
        total_tokens: Math.max(0, Math.floor(usage.total_tokens)),
      }
    : null
  return { text: chunks.join('\n'), citations: unique, searchQueries, searchTrace, providerUsage }
}

