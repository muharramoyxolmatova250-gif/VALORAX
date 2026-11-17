export type OmniSightVisionPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'high' }

/**
 * Build a bounded multimodal input for the Responses API.
 * Only HTTPS image URLs discovered on the lot page are accepted. This function
 * does not download, republish, or grant rights to any image.
 */
export function buildOmniSightVisionContent(
  prompt: string,
  imageUrls: unknown[],
  maxImages = 4,
): OmniSightVisionPart[] {
  const parts: OmniSightVisionPart[] = [{ type: 'input_text', text: prompt }]
  const seen = new Set<string>()

  for (const candidate of imageUrls) {
    if (parts.length > maxImages) break
    if (typeof candidate !== 'string' || candidate.length > 2048) continue

    try {
      const url = new URL(candidate)
      if (url.protocol !== 'https:' || url.username || url.password) continue
      if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) continue
      const normalized = url.href
      if (seen.has(normalized)) continue
      seen.add(normalized)
      parts.push({ type: 'input_image', image_url: normalized, detail: 'high' })
    } catch {
      // Ignore malformed image references; never fail the whole lot analysis.
    }
  }

  return parts
}
