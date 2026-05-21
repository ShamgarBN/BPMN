/**
 * Ollama local LLM API client.
 * Ollama runs on localhost:11434 and requires no authentication.
 * All calls are local — no data leaves the machine.
 */

const BASE = 'http://localhost:11434'
const TIMEOUT_MS = 4000

export interface OllamaModel {
  name: string
  size: number
}

export interface OllamaStatus {
  available: boolean
  models: OllamaModel[]
  error?: string
}

/** Check whether Ollama is running and return available models. */
export async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${BASE}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { available: false, models: [], error: `HTTP ${res.status}` }
    const data = await res.json() as { models?: Array<{ name: string; size: number }> }
    return {
      available: true,
      models: (data.models ?? []).map(m => ({ name: m.name, size: m.size })),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { available: false, models: [], error: msg }
  }
}

/**
 * Generate a completion from Ollama.
 * `onChunk` enables streaming output — each chunk of text is passed as it arrives.
 * Returns the full response text when complete.
 */
export async function generateCompletion(
  prompt: string,
  model: string,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      // BPMN extraction needs deterministic, structured output.
      // Low temperature reduces hallucination; large context lets the model
      // hold the full prompt + multi-paragraph user description.
      options: {
        temperature: 0.1,
        top_p: 0.9,
        num_ctx: 8192,
        num_predict: 4096,
      },
    }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama error ${res.status}: ${body}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as { response?: string; done?: boolean }
        if (obj.response) {
          full += obj.response
          onChunk?.(obj.response)
        }
      } catch { /* ignore incomplete JSON chunks */ }
    }
  }

  return full
}
