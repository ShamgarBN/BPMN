import {
  useEffect, useRef, useCallback, forwardRef, useImperativeHandle,
} from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { layoutProcess as bpmnLayoutProcess } from 'bpmn-auto-layout'
import type { WizardState } from '@/types/wizard'

export interface BpmnEditorHandle {
  importXml: (xml: string) => Promise<void>
  generateFromWizard: (state: WizardState, xml: string) => Promise<void>
  saveXml: () => Promise<string | null>
  saveSvg: () => Promise<string | null>
  fitView: () => void
  zoomIn: () => void
  zoomOut: () => void
}

interface BpmnEditorProps {
  className?: string
  onDiagramChange?: () => void
}

export const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(
  ({ className, onDiagramChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const modelerRef = useRef<BpmnModeler | null>(null)

    // ── Lifecycle ────────────────────────────────────────────────────────────

    // Create the modeler exactly once. Empty deps = only runs on mount/unmount.
    // This ensures a parent re-render never destroys a loaded diagram.
    useEffect(() => {
      if (!containerRef.current || modelerRef.current) return
      modelerRef.current = new BpmnModeler({
        container: containerRef.current,
        keyboard: { bindTo: document },
      })
      return () => {
        modelerRef.current?.destroy()
        modelerRef.current = null
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Attach / detach change listener separately (never recreates the modeler)
    useEffect(() => {
      const modeler = modelerRef.current
      if (!modeler || !onDiagramChange) return
      modeler.on('commandStack.changed', onDiagramChange)
      return () => modeler.off('commandStack.changed', onDiagramChange)
    }, [onDiagramChange])

    // ── Canvas helpers ────────────────────────────────────────────────────────

    type BpmnCanvas = {
      zoom(): number
      zoom(level: number | string, center?: unknown): number
    }

    const getCanvas = useCallback((): BpmnCanvas | null => {
      if (!modelerRef.current) return null
      try {
        return modelerRef.current.get('canvas') as BpmnCanvas
      } catch {
        return null
      }
    }, [])

    const fitView = useCallback(() => {
      getCanvas()?.zoom('fit-viewport', 'auto')
    }, [getCanvas])

    const zoomIn = useCallback(() => {
      const c = getCanvas()
      if (c) c.zoom(Math.min(c.zoom() + 0.2, 5))
    }, [getCanvas])

    const zoomOut = useCallback(() => {
      const c = getCanvas()
      if (c) c.zoom(Math.max(c.zoom() - 0.2, 0.1))
    }, [getCanvas])

    // ── Import / export ───────────────────────────────────────────────────────

    const importXml = useCallback(async (xml: string) => {
      if (!modelerRef.current) {
        throw new Error('Editor is not ready yet — please try again in a moment.')
      }
      try {
        await modelerRef.current.importXML(xml)
        // Two rAF frames: first for DOM update, second for bpmn-js measurement
        requestAnimationFrame(() => requestAnimationFrame(() => fitView()))
      } catch (err) {
        console.error('[BpmnEditor] importXML error:', err)
        // Re-throw so the caller can surface a user-facing notification
        // rather than silently failing.
        throw err
      }
    }, [fitView])

    const generateFromWizard = useCallback(async (_state: WizardState, rawXml: string) => {
      if (!modelerRef.current) return

      // If the XML already contains BPMNShape elements (swimlane DI was
      // pre-generated), skip bpmn-auto-layout — it strips pool/lane structure.
      const hasDi = rawXml.includes('<bpmndi:BPMNShape')
      let xmlToImport = rawXml

      if (!hasDi) {
        try {
          xmlToImport = await bpmnLayoutProcess(rawXml)
        } catch (err) {
          console.warn('[BpmnEditor] auto-layout failed, using raw XML:', err)
        }
      }

      try {
        await modelerRef.current.importXML(xmlToImport)
        requestAnimationFrame(() => requestAnimationFrame(() => fitView()))
      } catch (err) {
        console.error('[BpmnEditor] importXML failed:', err)
        throw err
      }
    }, [fitView])

    const saveXml = useCallback(async (): Promise<string | null> => {
      if (!modelerRef.current) return null
      try {
        const { xml } = await modelerRef.current.saveXML({ format: true })
        return xml
      } catch {
        return null
      }
    }, [])

    const saveSvg = useCallback(async (): Promise<string | null> => {
      if (!modelerRef.current) return null
      try {
        const { svg } = await modelerRef.current.saveSVG()
        return svg
      } catch {
        return null
      }
    }, [])

    // ── Imperative handle ─────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      importXml,
      generateFromWizard,
      saveXml,
      saveSvg,
      fitView,
      zoomIn,
      zoomOut,
    }))

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: '100%', height: '100%' }}
      />
    )
  }
)

BpmnEditor.displayName = 'BpmnEditor'
