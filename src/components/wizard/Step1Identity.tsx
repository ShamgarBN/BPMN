import { Input, Textarea } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useWizardStore } from '@/stores/wizardStore'

export function Step1Identity() {
  const {
    processName, processDescription, processVersion, processOwner,
    setProcessName, setProcessDescription, setProcessVersion, setProcessOwner,
  } = useWizardStore()

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Label htmlFor="processName">
          Process Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="processName"
          value={processName}
          onChange={(e) => setProcessName(e.target.value)}
          placeholder="e.g. Invoice Approval Process"
          autoFocus
        />
        <p className="text-xs text-gray-400 mt-1">
          A clear, descriptive name for this workflow.
        </p>
      </div>

      <div>
        <Label htmlFor="processDescription">Description</Label>
        <Textarea
          id="processDescription"
          value={processDescription}
          onChange={(e) => setProcessDescription(e.target.value)}
          rows={4}
          placeholder="Briefly describe what this process accomplishes and why it exists."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="processVersion">Version</Label>
          <Input
            id="processVersion"
            value={processVersion}
            onChange={(e) => setProcessVersion(e.target.value)}
            placeholder="1.0"
          />
        </div>
        <div>
          <Label htmlFor="processOwner">Process Owner</Label>
          <Input
            id="processOwner"
            value={processOwner}
            onChange={(e) => setProcessOwner(e.target.value)}
            placeholder="e.g. Finance Team"
          />
        </div>
      </div>
    </div>
  )
}
