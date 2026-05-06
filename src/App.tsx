import { useRef, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Toolbar } from '@/components/layout/Toolbar'
import { WizardShell } from '@/components/wizard/WizardShell'
import { Step1Identity } from '@/components/wizard/Step1Identity'
import { Step2Participants } from '@/components/wizard/Step2Participants'
import { Step3Trigger } from '@/components/wizard/Step3Trigger'
import { Step4Tasks } from '@/components/wizard/Step4Tasks'
import { Step5Gateways } from '@/components/wizard/Step5Gateways'
import { Step6Flows } from '@/components/wizard/Step6Flows'
import { BpmnEditor, type BpmnEditorHandle } from '@/components/editor/BpmnEditor'
import { ValidationPanel } from '@/components/export/ValidationPanel'
import { useWizardStore } from '@/stores/wizardStore'
import { generateBpmnXml } from '@/services/bpmnGenerator'
import { validateWizardState } from '@/services/bpmnValidator'
import { saveSvgAsPng } from '@/services/fileService'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const STEP_COMPONENTS = [
  Step1Identity,
  Step2Participants,
  Step3Trigger,
  Step4Tasks,
  Step5Gateways,
  Step6Flows,
]

export default function App() {
  const editorRef = useRef<BpmnEditorHandle>(null)
  const [validationResult, setValidationResult] = useState<ReturnType<typeof validateWizardState> | null>(null)
  const [pendingGenerate, setPendingGenerate] = useState(false)

  const store = useWizardStore()
  const { currentStep, isEditorMode, setEditorMode, setHasGeneratedDiagram, processName } = store

  const handleGenerate = useCallback(async (forceGenerate = false) => {
    const state = useWizardStore.getState()
    const result = validateWizardState(state)

    if (!forceGenerate && result.issues.some((i) => i.severity === 'error')) {
      setValidationResult(result)
      setPendingGenerate(true)
      return
    }

    if (!forceGenerate && result.issues.some((i) => i.severity === 'warning')) {
      setValidationResult(result)
      setPendingGenerate(true)
      return
    }

    await doGenerate(state)
  }, [])

  const doGenerate = useCallback(async (state = useWizardStore.getState()) => {
    setValidationResult(null)
    setPendingGenerate(false)
    const xml = generateBpmnXml(state)
    setEditorMode(true)
    setHasGeneratedDiagram(true)
    // Small delay so the editor renders before we import
    setTimeout(async () => {
      if (editorRef.current) {
        await editorRef.current.generateFromWizard(state, xml)
      }
    }, 100)
  }, [setEditorMode, setHasGeneratedDiagram])

  const handleExportBpmn = useCallback(async (): Promise<string | null> => {
    if (editorRef.current) {
      return await editorRef.current.saveXml()
    }
    // If editor not yet initialized, generate from wizard state
    const state = useWizardStore.getState()
    return generateBpmnXml(state)
  }, [])

  const handleExportSvg = useCallback(async (): Promise<string | null> => {
    if (!editorRef.current) return null
    return await editorRef.current.saveSvg()
  }, [])

  const handleExportPng = useCallback(async (): Promise<void> => {
    if (!editorRef.current) return
    const svg = await editorRef.current.saveSvg()
    if (!svg) return
    const safeName = (processName || 'diagram').replace(/[^a-z0-9_-]/gi, '_')
    await saveSvgAsPng(svg, `${safeName}.png`)
  }, [processName])

  const handleImportXml = useCallback(async (xml: string) => {
    setEditorMode(true)
    setHasGeneratedDiagram(true)
    setTimeout(async () => {
      if (editorRef.current) {
        await editorRef.current.importXml(xml)
      }
    }, 100)
  }, [setEditorMode, setHasGeneratedDiagram])

  const CurrentStep = STEP_COMPONENTS[currentStep]

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        onExportBpmn={handleExportBpmn}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
        onImportXml={handleImportXml}
      />

      <div className="flex-1 overflow-hidden">
        <AppShell isEditorMode={isEditorMode}>
          {isEditorMode ? (
            /* Visual Editor View */
            <div className="relative flex-1 h-full">
              <BpmnEditor
                ref={editorRef}
                className="w-full h-full bpmn-canvas"
                onDiagramChange={() => {/* could set dirty flag here */}}
              />
              {/* Editor controls overlay */}
              <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  title="Zoom in (Ctrl +)"
                  onClick={() => editorRef.current?.zoomIn()}
                >
                  <ZoomIn size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Zoom out (Ctrl -)"
                  onClick={() => editorRef.current?.zoomOut()}
                >
                  <ZoomOut size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Fit to screen (Ctrl Shift F)"
                  onClick={() => editorRef.current?.fitView()}
                >
                  <Maximize2 size={14} />
                </Button>
              </div>
              {/* Back to wizard hint */}
              <div className="absolute bottom-4 left-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditorMode(false)}
                >
                  ← Back to Wizard
                </Button>
              </div>
            </div>
          ) : (
            /* Wizard View */
            <WizardShell onGenerate={() => handleGenerate(false)}>
              <CurrentStep />
            </WizardShell>
          )}
        </AppShell>
      </div>

      {/* Validation Panel */}
      {validationResult && (
        <ValidationPanel
          result={validationResult}
          onClose={() => { setValidationResult(null); setPendingGenerate(false) }}
          onProceed={pendingGenerate ? async () => { await doGenerate() } : undefined}
        />
      )}
    </div>
  )
}
