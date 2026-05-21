/**
 * Turn an exception from `BpmnModeler.importXML()` into a short, user-friendly
 * message that we can render in a toast.
 *
 * bpmn-js attaches a `warnings` array on the thrown error.  We surface the
 * first warning when the message itself isn't descriptive (the bare message is
 * usually `unparsable content <foo> detected` which doesn't mean much to the
 * end user without context).
 */
export function formatBpmnImportError(err: unknown): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) {
    const warnings = (err as Error & { warnings?: Array<{ message?: string }> }).warnings
    if (Array.isArray(warnings) && warnings.length > 0) {
      const first = warnings.find((w) => w?.message)?.message
      if (first) {
        return warnings.length > 1
          ? `${first} (+${warnings.length - 1} more issue${warnings.length - 1 === 1 ? '' : 's'})`
          : first
      }
    }
    return err.message || 'Failed to read BPMN file'
  }
  try {
    return String(err)
  } catch {
    return 'Failed to read BPMN file'
  }
}
