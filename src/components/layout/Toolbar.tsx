import { useState } from 'react'
import {
  FileText, FolderOpen, Save, Download, ChevronDown,
  Layers, Cpu,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useWizardStore } from '@/stores/wizardStore'
import { openFile, saveFile } from '@/services/fileService'

interface ToolbarProps {
  onExportBpmn: () => Promise<string | null>
  onExportSvg: () => Promise<string | null>
  onExportPng: () => Promise<void>
  onImportXml: (xml: string) => Promise<void>
}

export function Toolbar({ onExportBpmn, onExportSvg, onExportPng, onImportXml }: ToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const { processName, processVersion, isEditorMode, setEditorMode, reset } = useWizardStore()

  const handleOpen = async () => {
    const result = await openFile('.bpmn,.xml')
    if (result) await onImportXml(result.content)
  }

  const handleSave = async () => {
    const xml = await onExportBpmn()
    if (!xml) return
    const safeName = (processName || 'diagram').replace(/[^a-z0-9_-]/gi, '_')
    await saveFile(xml, `${safeName}.bpmn`, 'application/xml')
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

  const handleNewDiagram = () => {
    if (window.confirm('Start a new diagram? Unsaved changes will be lost.')) {
      reset()
    }
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

      <Button variant="ghost" size="sm" onClick={handleOpen} title="Open .bpmn file">
        <FolderOpen size={14} />
        <span className="hidden md:inline">Open</span>
      </Button>

      <Button variant="ghost" size="sm" onClick={handleSave} title="Save as .bpmn">
        <Save size={14} />
        <span className="hidden md:inline">Save</span>
      </Button>

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
    </header>
  )
}

