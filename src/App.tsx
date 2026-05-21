import { useRef, useState, useCallback, useEffect } from 'react'
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
import { NLInputPanel } from '@/components/nlp/NLInputPanel'
import { NLRefinePanel } from '@/components/nlp/NLRefinePanel'
import { HelpPanel } from '@/components/help/HelpPanel'
import { useWizardStore } from '@/stores/wizardStore'
import { generateBpmnXml, generateBpmnXmlWithReport } from '@/services/bpmnGenerator'
import type { CleanupReport } from '@/services/visualCleanupService'
import { validateWizardState } from '@/services/bpmnValidator'
import { saveSvgAsPng, saveFile, openFile, readFileByPath } from '@/services/fileService'
import { generatePdf } from '@/services/pdfExportService'
import { formatBpmnImportError } from '@/services/bpmnImportError'
import {
  serializeProject,
  parseProject,
  projectToLoadable,
  ProjectParseError,
  PROJECT_FILE_EXTENSION,
} from '@/services/projectFileService'
import { recordRecent, type RecentFile } from '@/services/recentFilesService'
import { RecentMenu } from '@/components/layout/RecentMenu'
import { importBpmnXml, BpmnImportError } from '@/services/bpmnImporter'
import type { WizardState } from '@/types/wizard'
import { ZoomIn, ZoomOut, Maximize2, Layers, Wand2, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ToastStack } from '@/components/ui/Toast'
import { useToasts } from '@/hooks/useToasts'

const SAMPLE_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" name="Sample Approval" isExecutable="false">
    <startEvent id="SE1" name="Request Received"><outgoing>F1</outgoing></startEvent>
    <userTask id="T1" name="Review Request"><incoming>F1</incoming><outgoing>F2</outgoing></userTask>
    <exclusiveGateway id="GW1" name="Approved?"><incoming>F2</incoming><outgoing>F3</outgoing><outgoing>F4</outgoing></exclusiveGateway>
    <endEvent id="EE1" name="Approved"><incoming>F3</incoming></endEvent>
    <endEvent id="EE2" name="Rejected"><incoming>F4</incoming></endEvent>
    <sequenceFlow id="F1" sourceRef="SE1" targetRef="T1"/>
    <sequenceFlow id="F2" sourceRef="T1" targetRef="GW1"/>
    <sequenceFlow id="F3" name="Yes" sourceRef="GW1" targetRef="EE1"/>
    <sequenceFlow id="F4" name="No" sourceRef="GW1" targetRef="EE2"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="SE1_di" bpmnElement="SE1"><dc:Bounds x="152" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T1_di" bpmnElement="T1"><dc:Bounds x="240" y="60" width="120" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="GW1_di" bpmnElement="GW1" isMarkerVisible="true"><dc:Bounds x="415" y="75" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE1_di" bpmnElement="EE1"><dc:Bounds x="527" y="42" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE2_di" bpmnElement="EE2"><dc:Bounds x="527" y="122" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="188" y="100"/><di:waypoint x="240" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="360" y="100"/><di:waypoint x="415" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F3_di" bpmnElement="F3"><di:waypoint x="440" y="75"/><di:waypoint x="440" y="60"/><di:waypoint x="527" y="60"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F4_di" bpmnElement="F4"><di:waypoint x="440" y="125"/><di:waypoint x="440" y="140"/><di:waypoint x="527" y="140"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`

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
  const [nlPanelOpen, setNlPanelOpen] = useState(false)
  const [refinePanelOpen, setRefinePanelOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null)
  const { toasts, dismiss, error: toastError, success: toastSuccess } = useToasts()

  const store = useWizardStore()
  const { currentStep, isEditorMode, hasGeneratedDiagram, setEditorMode, setHasGeneratedDiagram, processName } = store

  const handleGenerate = useCallback(async (forceGenerate = false) => {
    const state = useWizardStore.getState()
    const result = validateWizardState(state)

    // Only hard-block on errors. Warnings show a panel but allow proceeding.
    const hasErrors = result.issues.some((i) => i.severity === 'error')
    const hasWarnings = result.issues.some((i) => i.severity === 'warning')

    if (!forceGenerate && (hasErrors || hasWarnings)) {
      setValidationResult(result)
      setPendingGenerate(true)
      return
    }

    await doGenerate(state)
  }, [])

  const doGenerate = useCallback(async (state = useWizardStore.getState()) => {
    setValidationResult(null)
    setPendingGenerate(false)
    const { xml, cleanup } = generateBpmnXmlWithReport(state as WizardState)
    console.log('[App] doGenerate called. editorRef.current:', !!editorRef.current)
    console.log('[App] Generated XML:\n', xml)
    if (cleanup) {
      console.log('[App] Visual cleanup report:', cleanup)
    }
    // Editor is always mounted (visibility:hidden), so the ref is always ready
    if (editorRef.current) {
      await editorRef.current.generateFromWizard(state, xml)
    } else {
      console.error('[App] editorRef.current is null — editor not mounted yet!')
    }
    setEditorMode(true)
    setHasGeneratedDiagram(true)
    setCleanupReport(cleanup)
  }, [setEditorMode, setHasGeneratedDiagram])

  // Called by the NL panel after parsing — load state then generate diagram
  const handleNlGenerate = useCallback(async (partial: Partial<WizardState>) => {
    setNlPanelOpen(false)
    const s = useWizardStore.getState()
    s.reset()
    s.loadState(partial)
    await new Promise(r => setTimeout(r, 50))
    await doGenerate(useWizardStore.getState())
  }, [doGenerate])

  // Called by the Refine panel — replace state with refined version, regenerate
  const handleRefineApply = useCallback(async (partial: Partial<WizardState>) => {
    setRefinePanelOpen(false)
    const s = useWizardStore.getState()
    s.reset()
    s.loadState(partial)
    await new Promise(r => setTimeout(r, 50))
    await doGenerate(useWizardStore.getState())
  }, [doGenerate])

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

  const handleExportPdf = useCallback(async (): Promise<void> => {
    if (!editorRef.current) return
    const svg = await editorRef.current.saveSvg()
    if (!svg) {
      toastError('PDF export failed', 'The diagram could not be captured. Try regenerating it.')
      return
    }
    const safeName = (processName || 'diagram').replace(/[^a-z0-9_-]/gi, '_')
    try {
      const blob = await generatePdf({ svg })
      await saveFile(blob, `${safeName}.pdf`, 'application/pdf')
    } catch (err) {
      console.error('PDF export failed:', err)
      toastError('PDF export failed', (err as Error).message || 'See the developer console for details.')
    }
  }, [processName, toastError])

  const handleImportXml = useCallback(async (
    xml: string,
    meta?: { path?: string; name?: string },
  ) => {
    if (!editorRef.current) {
      toastError('Cannot open file', 'The editor is still initialising. Please try again in a moment.')
      return
    }
    try {
      await editorRef.current.importXml(xml)
      setEditorMode(true)
      setHasGeneratedDiagram(true)
      if (meta?.name) {
        // Only track *real* user files in Recents — skip the Sample button
        // and other built-in canned diagrams.
        recordRecent({ kind: 'bpmn', name: meta.name, path: meta.path ?? '' })
      }
      toastSuccess('Diagram loaded')
    } catch (err) {
      console.error('[App] importXml failed:', err)
      toastError(
        'Could not open BPMN file',
        formatBpmnImportError(err) + '\n\nMake sure the file is valid BPMN 2.0 XML.',
      )
    }
  }, [setEditorMode, setHasGeneratedDiagram, toastError, toastSuccess])

  // ── Project save / open (.bpmnstudio JSON) ──────────────────────────────
  // Unlike the BPMN export, the project file preserves the editable wizard
  // state — participants, gateways, descriptions — so the user can pick up
  // where they left off.  BPMN is the lossy export; project is the source.

  const handleSaveProject = useCallback(async () => {
    try {
      const state = useWizardStore.getState()
      const json  = serializeProject(state, __APP_VERSION__)
      const safe  = (state.processName || 'project').replace(/[^a-z0-9_-]/gi, '_')
      const saved = await saveFile(json, `${safe}.${PROJECT_FILE_EXTENSION}`, 'application/json')
      recordRecent({ kind: 'project', name: saved.name, path: saved.path })
      toastSuccess('Project saved')
    } catch (err) {
      console.error('[App] saveProject failed:', err)
      toastError('Could not save project', (err as Error).message || 'See the developer console.')
    }
  }, [toastError, toastSuccess])

  const handleOpenProject = useCallback(async () => {
    try {
      const file = await openFile(`.${PROJECT_FILE_EXTENSION},.json`)
      if (!file) return
      await loadProjectContent(file.content, { path: file.path, name: file.name })
    } catch (err) {
      console.error('[App] openProject failed:', err)
      const msg = err instanceof ProjectParseError
        ? err.message
        : (err as Error).message || 'Unknown error'
      toastError('Could not open project', msg)
    }
  // loadProjectContent is declared below; the closure captures its latest ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastError])

  /** Shared body for "open project from disk" and "open project from Recents". */
  const loadProjectContent = useCallback(async (
    content: string,
    meta: { path: string; name: string },
  ) => {
    const project = parseProject(content)
    const partial = projectToLoadable(project)
    const s = useWizardStore.getState()
    s.reset()
    s.loadState(partial)
    setEditorMode(false)
    setHasGeneratedDiagram(false)
    recordRecent({ kind: 'project', name: meta.name, path: meta.path })
    toastSuccess(
      'Project loaded',
      project.savedAt ? `Saved ${new Date(project.savedAt).toLocaleString()}` : undefined,
    )
  }, [setEditorMode, setHasGeneratedDiagram, toastSuccess])

  /**
   * Import an existing BPMN file into the *wizard* (editable state), not just
   * the read-only editor.  Lets the user open `.bpmn` files and continue
   * editing them inside the guided wizard.  Falls back to the editor-only
   * path if the structural mapping fails.
   */
  const handleImportToWizard = useCallback(async () => {
    try {
      const file = await openFile('.bpmn,.xml')
      if (!file) return
      let partial: Partial<WizardState>
      try {
        partial = importBpmnXml(file.content)
      } catch (err) {
        // Structural import failed — fall back to editor-only display so the
        // user at least sees the diagram.  Toast the reason.
        console.warn('[App] BPMN → wizard import failed, falling back to editor view:', err)
        toastError(
          'Could not import this file into the wizard',
          (err instanceof BpmnImportError ? err.message : (err as Error).message || 'Unknown error') +
          '\n\nThe file will be opened in the visual editor instead.',
        )
        await handleImportXml(file.content, { path: file.path, name: file.name })
        return
      }
      const s = useWizardStore.getState()
      s.reset()
      s.loadState(partial)
      setEditorMode(false)
      setHasGeneratedDiagram(false)
      recordRecent({ kind: 'bpmn', name: file.name, path: file.path })
      toastSuccess(
        'BPMN file imported',
        `${partial.tasks?.length ?? 0} task${partial.tasks?.length === 1 ? '' : 's'}, ` +
        `${partial.participants?.length ?? 0} lane${partial.participants?.length === 1 ? '' : 's'} ` +
        `loaded into the wizard.`,
      )
    } catch (err) {
      console.error('[App] importToWizard failed:', err)
      toastError('Could not open file', (err as Error).message || 'Unknown error.')
    }
  }, [handleImportXml, setEditorMode, setHasGeneratedDiagram, toastError, toastSuccess])

  /** Called by the RecentMenu when a recent file is clicked. */
  const handleOpenRecent = useCallback(async (rec: RecentFile) => {
    // No path → can only happen in browser mode.  Tell the user to re-open
    // via the dialog so they can re-grant the file permission.
    if (!rec.path) {
      toastError(
        'Recent files need a path',
        'Use the Open button to re-select this file. The browser sandbox doesn\'t allow re-opening paths automatically.',
      )
      return
    }
    try {
      if (rec.kind === 'project') {
        const file = await readFileByPath(rec.path, ['bpmnstudio', 'json'])
        if (!file) return
        await loadProjectContent(file.content, { path: file.path, name: file.name })
      } else {
        const file = await readFileByPath(rec.path, ['bpmn', 'xml'])
        if (!file) return
        await handleImportXml(file.content, { path: file.path, name: file.name })
      }
    } catch (err) {
      console.error('[App] openRecent failed:', err)
      toastError('Could not open recent file', (err as Error).message || 'Unknown error.')
    }
  }, [handleImportXml, loadProjectContent, toastError])

  // After switching to editor mode, give the browser one animation frame to apply
  // visibility changes, then re-fit the diagram so it fills the visible canvas.
  useEffect(() => {
    if (isEditorMode && hasGeneratedDiagram) {
      // Two frames: first to apply visibility change, second to measure and fit
      requestAnimationFrame(() => requestAnimationFrame(() => {
        editorRef.current?.fitView()
      }))
    }
  }, [isEditorMode, hasGeneratedDiagram])

  const CurrentStep = STEP_COMPONENTS[currentStep]

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        onExportBpmn={handleExportBpmn}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        onImportXml={handleImportXml}
        onOpenNlPanel={() => setNlPanelOpen(true)}
        onOpenRefinePanel={() => setRefinePanelOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        onImportToWizard={handleImportToWizard}
        recentMenu={<RecentMenu onOpen={handleOpenRecent} />}
      />

      {nlPanelOpen && (
        <NLInputPanel
          onClose={() => setNlPanelOpen(false)}
          onGenerate={handleNlGenerate}
        />
      )}

      {refinePanelOpen && (
        <NLRefinePanel
          currentState={store as WizardState}
          onClose={() => setRefinePanelOpen(false)}
          onApply={handleRefineApply}
        />
      )}

      {helpOpen && (
        <HelpPanel onClose={() => setHelpOpen(false)} />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <div className="flex-1 overflow-hidden">
        <AppShell isEditorMode={isEditorMode}>
          {/*
            Use a single relative container with both views absolutely positioned
            so the bpmn-js canvas always has real pixel dimensions (never display:none).
            Visibility toggling with pointer-events prevents interaction when hidden.
          */}
          <div className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>

            {/* Wizard View — always in layout, hidden by visibility when editor is active */}
            <div
              className="absolute inset-0 flex flex-col overflow-auto"
              style={{ visibility: isEditorMode ? 'hidden' : 'visible', pointerEvents: isEditorMode ? 'none' : 'auto' }}
            >
              <WizardShell onGenerate={() => handleGenerate(false)}>
                <CurrentStep />
              </WizardShell>
            </div>

            {/* Editor View — always in layout, always has real dimensions */}
            <div
              className="absolute inset-0 flex flex-col"
              style={{ visibility: isEditorMode ? 'visible' : 'hidden', pointerEvents: isEditorMode ? 'auto' : 'none' }}
            >
              {/* bpmn-js canvas — always mounted */}
              <BpmnEditor
                ref={editorRef}
                className="flex-1 bpmn-canvas"
              />

              {/* Empty-state overlay — shown until a diagram is loaded */}
              {!hasGeneratedDiagram && isEditorMode && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                  <div className="text-center space-y-4 p-8 max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                      <Layers size={28} className="text-blue-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">No diagram yet</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Complete the wizard and click <strong>Generate Diagram</strong>, or load a sample to try the editor now.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="primary"
                        onClick={async () => {
                          if (editorRef.current) {
                            await editorRef.current.importXml(SAMPLE_BPMN)
                          }
                          setHasGeneratedDiagram(true)
                        }}
                      >
                        Load Sample Diagram
                      </Button>
                      <Button variant="outline" onClick={() => setEditorMode(false)}>
                        ← Back to Wizard
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Zoom controls */}
              <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
                <Button variant="outline" size="icon" title="Zoom in (Ctrl +)" onClick={() => editorRef.current?.zoomIn()}>
                  <ZoomIn size={14} />
                </Button>
                <Button variant="outline" size="icon" title="Zoom out (Ctrl -)" onClick={() => editorRef.current?.zoomOut()}>
                  <ZoomOut size={14} />
                </Button>
                <Button variant="outline" size="icon" title="Fit to screen" onClick={() => editorRef.current?.fitView()}>
                  <Maximize2 size={14} />
                </Button>
              </div>

              {/* Back to wizard */}
              {hasGeneratedDiagram && (
                <div className="absolute bottom-4 left-4">
                  <Button variant="outline" size="sm" onClick={() => setEditorMode(false)}>
                    ← Back to Wizard
                  </Button>
                </div>
              )}

              {/* Visual cleanup status banner */}
              {cleanupReport && hasGeneratedDiagram && (
                <CleanupBanner report={cleanupReport} onDismiss={() => setCleanupReport(null)} />
              )}
            </div>

          </div>
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

// ── Visual cleanup status banner ──────────────────────────────────────────────
// Auto-dismisses after a short delay; the user can close it manually too.
function CleanupBanner({
  report,
  onDismiss,
}: { report: CleanupReport; onDismiss: () => void }) {
  useEffect(() => {
    const timeout = setTimeout(onDismiss, 7000)
    return () => clearTimeout(timeout)
  }, [onDismiss])

  const total = report.fixed
  const allClean = total === 0 && report.unresolved === 0
  const hasUnresolved = report.unresolved > 0

  let title: string
  let detail: string
  if (allClean) {
    title  = 'Visual review passed'
    detail = 'No collisions detected — diagram is clean.'
  } else if (hasUnresolved) {
    title  = `Visual review: ${total} adjustment${total === 1 ? '' : 's'} applied`
    detail = `${report.unresolved} item${report.unresolved === 1 ? '' : 's'} could not be auto-resolved — see console for details.`
  } else {
    title  = `Visual review: ${total} adjustment${total === 1 ? '' : 's'} applied`
    const parts: string[] = []
    if (report.byCheck.crossesShape.fixed)    parts.push(`${report.byCheck.crossesShape.fixed} reroute${report.byCheck.crossesShape.fixed === 1 ? '' : 's'}`)
    if (report.byCheck.onLaneBoundary.fixed)  parts.push(`${report.byCheck.onLaneBoundary.fixed} off lane line${report.byCheck.onLaneBoundary.fixed === 1 ? '' : 's'}`)
    if (report.byCheck.parallelOverlap.fixed) parts.push(`${report.byCheck.parallelOverlap.fixed} stagger${report.byCheck.parallelOverlap.fixed === 1 ? '' : 's'}`)
    if (report.byCheck.labelOnShape.fixed)    parts.push(`${report.byCheck.labelOnShape.fixed} label${report.byCheck.labelOnShape.fixed === 1 ? '' : 's'} repositioned`)
    detail = parts.join(', ') + '.'
  }

  const tone = hasUnresolved
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900'

  return (
    <div className={`absolute top-4 left-1/2 -translate-x-1/2 max-w-md min-w-[280px] flex items-start gap-2 px-3 py-2 border ${tone} rounded-lg shadow-sm text-sm z-20`}>
      <Wand2 size={16} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs opacity-80 mt-0.5">{detail}</div>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-black/5 transition-colors"
        aria-label="Dismiss"
        type="button"
      >
        <XIcon size={14} />
      </button>
    </div>
  )
}
