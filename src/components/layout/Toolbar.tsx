import { useState, type ReactNode } from 'react'
import {
  FileText, FolderOpen, FolderInput, Save, Download, ChevronDown,
  Layers, Cpu, Sparkles, Wand2, FileDown, HelpCircle, FileJson,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useWizardStore } from '@/stores/wizardStore'
import { openFile, saveFile } from '@/services/fileService'

interface ImportMeta {
  /** Absolute filesystem path; empty in browser mode. */
  path?: string
  /** Display name (basename).  Used by the Recents tracker. */
  name?: string
}

interface ToolbarProps {
  onExportBpmn: () => Promise<string | null>
  onExportSvg: () => Promise<string | null>
  onExportPng: () => Promise<void>
  onExportPdf: () => Promise<void>
  onImportXml: (xml: string, meta?: ImportMeta) => Promise<void>
  /** Imports a BPMN file into the wizard (editable state), not just the editor. */
  onImportToWizard: () => Promise<void>
  onOpenNlPanel: () => void
  onOpenRefinePanel: () => void
  onOpenHelp: () => void
  onSaveProject: () => Promise<void>
  onOpenProject: () => Promise<void>
  /** Renders the Recent menu inline so we don't have to plumb it through here. */
  recentMenu: ReactNode
}

export function Toolbar({
  onExportBpmn, onExportSvg, onExportPng, onExportPdf, onImportXml,
  onImportToWizard,
  onOpenNlPanel, onOpenRefinePanel, onOpenHelp,
  onSaveProject, onOpenProject, recentMenu,
}: ToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const { processName, processVersion, isEditorMode, hasGeneratedDiagram, setEditorMode, reset } = useWizardStore()

  const handleOpen = async () => {
    try {
      const result = await openFile('.bpmn,.xml')
      if (result) await onImportXml(result.content, { path: result.path, name: result.name })
    } catch (err) {
      // openFile may throw on FS access errors (e.g. permission denied).  The
      // import-XML error path is already toasted inside onImportXml itself.
      console.error('[Toolbar] open failed:', err)
    }
  }

  const handleSave = async () => {
    const xml = await onExportBpmn()
    if (!xml) return
    const safeName = (processName || 'diagram').replace(/[^a-z0-9_-]/gi, '_')
    try {
      await saveFile(xml, `${safeName}.bpmn`, 'application/xml')
    } catch (err) {
      console.error('[Toolbar] save failed:', err)
    }
  }

  const handleExportSvg = async () => {
    setExportOpen(false)
    const svg = await onExportSvg()
    if (!svg) return
    const safeName = (processName || 'diagram').replace(/[^a-z0-9_-]/gi, '_')
    await saveFile(svg, `${safeName}.svg`, 'image/svg+xml')
  }

  const handleExportPng = async () => {
    setExportOpen(false)
    await onExportPng()
  }

  const handleExportPdf = async () => {
    setExportOpen(false)
    await onExportPdf()
  }

  const handleNewDiagram = () => {
    if (window.confirm('Start a new diagram? Unsaved changes will be lost.')) {
      reset()
    }
  }

  // Loads a hardcoded known-good BPMN to verify the canvas works
  const handleLoadSample = async () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" name="Start">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <userTask id="Task_1" name="Review Request">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </userTask>
    <exclusiveGateway id="Gateway_1" name="Approved?">
      <incoming>Flow_2</incoming>
      <outgoing>Flow_3</outgoing>
      <outgoing>Flow_4</outgoing>
    </exclusiveGateway>
    <endEvent id="EndEvent_1" name="Approved">
      <incoming>Flow_3</incoming>
    </endEvent>
    <endEvent id="EndEvent_2" name="Rejected">
      <incoming>Flow_4</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gateway_1"/>
    <sequenceFlow id="Flow_3" name="Yes" sourceRef="Gateway_1" targetRef="EndEvent_1"/>
    <sequenceFlow id="Flow_4" name="No" sourceRef="Gateway_1" targetRef="EndEvent_2"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="240" y="60" width="120" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true">
        <dc:Bounds x="415" y="75" width="50" height="50"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="522" y="42" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_2_di" bpmnElement="EndEvent_2">
        <dc:Bounds x="522" y="122" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100"/>
        <di:waypoint x="240" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="360" y="100"/>
        <di:waypoint x="415" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="440" y="75"/>
        <di:waypoint x="440" y="60"/>
        <di:waypoint x="522" y="60"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="440" y="125"/>
        <di:waypoint x="440" y="140"/>
        <di:waypoint x="522" y="140"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`
    await onImportXml(sampleXml)
  }

  const title = processName
    ? `${processName}${processVersion ? ` v${processVersion}` : ''}`
    : 'BPMN Studio'

  return (
    <header className="flex items-center h-12 px-3 border-b border-gray-200 bg-white gap-2 shrink-0 z-10">
      {/* App logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
          <Layers size={14} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-900 hidden sm:block">BPMN Studio</span>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* File actions */}
      <Button variant="ghost" size="sm" onClick={handleNewDiagram} title="New diagram">
        <FileText size={14} />
        <span className="hidden md:inline">New</span>
      </Button>

      <Button variant="ghost" size="sm" onClick={handleOpen} title="Open .bpmn file in the visual editor (preserves layout)">
        <FolderOpen size={14} />
        <span className="hidden md:inline">Open</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onImportToWizard}
        title="Import a .bpmn file into the wizard so you can edit participants, tasks, and gateways with forms (layout will be regenerated)"
      >
        <FolderInput size={14} />
        <span className="hidden md:inline">To Wizard</span>
      </Button>

      <Button variant="ghost" size="sm" onClick={handleLoadSample} title="Load a sample diagram to verify the editor works">
        <span className="hidden md:inline text-xs text-blue-500">Sample</span>
      </Button>

      <Button variant="ghost" size="sm" onClick={handleSave} title="Save as .bpmn">
        <Save size={14} />
        <span className="hidden md:inline">Save</span>
      </Button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Project (.bpmnstudio) — preserves the editable wizard state */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenProject}
        title="Open a saved .bpmnstudio project"
      >
        <FileJson size={14} />
        <span className="hidden md:inline">Open Project</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onSaveProject}
        title="Save the current process as a .bpmnstudio project (preserves wizard data for later editing)"
      >
        <FileJson size={14} />
        <span className="hidden md:inline">Save Project</span>
      </Button>

      {recentMenu}

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Export dropdown */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportOpen((v) => !v)}
          title="Export diagram"
        >
          <Download size={14} />
          <span className="hidden md:inline">Export</span>
          <ChevronDown size={12} />
        </Button>
        {exportOpen && (
          <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
            <button
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={async () => { setExportOpen(false); await handleSave() }}
            >
              <FileText size={13} className="text-blue-500" />
              BPMN 2.0 (.bpmn)
            </button>
            <button
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={handleExportPdf}
            >
              <FileDown size={13} className="text-red-500" />
              PDF document
            </button>
            <div className="border-t border-gray-100" />
            <button
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={handleExportSvg}
            >
              <Download size={13} className="text-green-500" />
              SVG image
            </button>
            <button
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={handleExportPng}
            >
              <Download size={13} className="text-purple-500" />
              PNG image
            </button>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Document title */}
      <span className="text-sm text-gray-600 font-medium truncate max-w-xs hidden lg:block">
        {title}
      </span>

      {/* AI Assist */}
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenNlPanel}
        title="Describe your process in plain text and let AI build the diagram"
        className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
      >
        <Sparkles size={13} />
        <span className="hidden sm:inline">AI Assist</span>
      </Button>

      {/* Refine — only available after a diagram exists */}
      {hasGeneratedDiagram && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenRefinePanel}
          title="Apply natural-language changes to the current diagram"
          className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
        >
          <Wand2 size={13} />
          <span className="hidden sm:inline">Refine</span>
        </Button>
      )}

      <div className="flex-1" />

      {/* Mode toggle */}
      <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
        <Button
          variant={!isEditorMode ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setEditorMode(false)}
          title="Wizard mode"
        >
          <Cpu size={13} />
          <span className="hidden sm:inline">Wizard</span>
        </Button>
        <Button
          variant={isEditorMode ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setEditorMode(true)}
          title="Visual editor mode"
        >
          <Layers size={13} />
          <span className="hidden sm:inline">Editor</span>
        </Button>
      </div>

      {/* Help */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenHelp}
        title="Open the user manual"
        className="ml-1"
      >
        <HelpCircle size={14} />
      </Button>
    </header>
  )
}

