/**
 * Shared JSON-extraction helper for LLM responses.
 *
 * Local LLMs sometimes wrap JSON in markdown code fences or add prose around
 * the response.  This helper finds the actual JSON object payload.
 */
export function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = raw.indexOf('{')
  const end   = raw.lastIndexOf('}')
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1)
  return raw.trim()
}
