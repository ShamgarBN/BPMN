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

    useEffect(() => {
      if (!containerRef.current || modelerRef.current) return

      modelerRef.current = new BpmnModeler({
        container: containerRef.current,
        keyboard: { bindTo: document },
      })

      if (onDiagramChange) {
        modelerRef.current.on('commandStack.changed', onDiagramChange)
      }

      return () => {
        modelerRef.current?.destroy()
        modelerRef.current = null
      }
    }, [onDiagramChange])

    const importXml = useCallback(async (xml: string) => {
      if (!modelerRef.current) return
      try {
        await modelerRef.current.importXML(xml)
        fitView()
      } catch (err) {
        console.error('BPMN import error:', err)
      }
    }, [])

    const generateFromWizard = useCallback(async (_state: WizardState, rawXml: string) => {
      if (!modelerRef.current) return
      try {
        // Apply auto-layout to add diagram interchange (DI) coordinates
        const { xml: layoutedXml } = await bpmnLayoutProcess(rawXml)
        await modelerRef.current.importXML(layoutedXml)
        fitView()
      } catch (err) {
        console.warn('Auto-layout failed, importing raw XML:', err)
        // Fallback: import without layout
        try {
          await modelerRef.current.importXML(rawXml)
          fitView()
        } catch (innerErr) {
          console.error('BPMN import error:', innerErr)
        }
      }
    }, [])

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

    type BpmnCanvas = { zoom: (mode: string | number, center?: unknown) => number }

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
      const canvas = getCanvas()
      if (!canvas) return
      const current = canvas.zoom('fit-viewport')
      canvas.zoom(Math.min(current + 0.2, 5))
    }, [getCanvas])

    const zoomOut = useCallback(() => {
      const canvas = getCanvas()
      if (!canvas) return
      const current = canvas.zoom('fit-viewport')
      canvas.zoom(Math.max(current - 0.2, 0.1))
    }, [getCanvas])

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
