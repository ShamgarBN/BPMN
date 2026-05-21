/**
 * BPMN Studio user manual — single source of truth.
 *
 * Sections render in-app via the help panel and are also exported to
 * Markdown / HTML / PDF without duplication.
 *
 * Keep prose terse; prefer scannable bullets and short paragraphs.
 */

export interface ManualBlock {
  type: 'p' | 'h3' | 'ul' | 'ol' | 'note' | 'code' | 'kbd-table'
  /** Plain text for p/h3/note/code; bullet array for ul/ol; rows for kbd-table. */
  content: string | string[] | Array<[string, string]>
}

export interface ManualTopic {
  id:    string
  title: string
  blocks: ManualBlock[]
}

export interface ManualSection {
  id:     string
  title:  string
  topics: ManualTopic[]
}

export const MANUAL_TITLE     = 'BPMN Studio User Manual'
export const MANUAL_SUBTITLE  = 'Build BPMN 2.0 process diagrams with guided forms or natural language'
// Kept in lockstep with package.json version — the manual is generated
// by the app and shipped with it, so there's no reason to maintain a
// separate version number.  Update both together when cutting a release.
export const MANUAL_VERSION   = '1.1.0'

export const MANUAL: ManualSection[] = [

  // ── Section 1 ─────────────────────────────────────────────────────────────
  {
    id: 'overview',
    title: 'Overview',
    topics: [
      {
        id: 'what-is-bpmn-studio',
        title: 'What is BPMN Studio?',
        blocks: [
          { type: 'p', content:
            'BPMN Studio is an offline tool for authoring BPMN 2.0 process ' +
            'diagrams. You can build a diagram three ways: a step-by-step ' +
            'guided wizard, a visual editor, or by describing the process ' +
            'in plain English and letting a local AI model build it.' },
          { type: 'h3', content: 'Built for' },
          { type: 'ul', content: [
            'Process owners who need a shareable handoff document',
            'Analysts who want to capture an existing process quickly',
            'Teams that need an offline tool with no cloud dependency',
          ]},
          { type: 'h3', content: 'What you can produce' },
          { type: 'ul', content: [
            'BPMN 2.0 XML (.bpmn) — the open standard, openable in Camunda, Signavio, bpmn.io, etc.',
            'PDF — multi-page handoff document with cover, diagram, and documentation',
            'SVG / PNG — drop into slides, wikis, or tickets',
          ]},
          { type: 'note', content:
            'No data ever leaves your machine. The optional AI features run ' +
            'against a local Ollama server you install yourself.' },
        ],
      },
      {
        id: 'system-requirements',
        title: 'System requirements',
        blocks: [
          { type: 'h3', content: 'Browser version' },
          { type: 'ul', content: [
            'Chromium-based browser (Chrome, Edge, Brave, Opera) for the best file-save experience',
            'Firefox or Safari work too — saving uses standard download instead',
            'No internet connection required after the page loads',
          ]},
          { type: 'h3', content: 'Desktop version' },
          { type: 'ul', content: [
            'Windows 10/11, macOS 12+, or modern Linux (Ubuntu 20.04+, Fedora 36+)',
            'Approximately 200 MB free disk space',
            'No admin install needed for the portable build',
          ]},
          { type: 'h3', content: 'Optional — for AI features' },
          { type: 'ul', content: [
            'Ollama installed locally (https://ollama.ai)',
            'A pulled model — llama3.2, mistral, qwen2.5, or phi3 work well',
            '8 GB RAM minimum; 16 GB recommended for larger models',
          ]},
        ],
      },
    ],
  },

  // ── Section 2 ─────────────────────────────────────────────────────────────
  {
    id: 'getting-started',
    title: 'Getting Started',
    topics: [
      {
        id: 'first-diagram',
        title: 'Build your first diagram',
        blocks: [
          { type: 'p', content:
            'The fastest way to see results is the AI Assist feature. ' +
            'Start there, then refine in the visual editor.' },
          { type: 'ol', content: [
            'Click "AI Assist" in the toolbar',
            'Paste or type a description of your process',
            'Click "Parse Process" — the model extracts elements (two-pass for accuracy)',
            'Review the parsed preview, then click "Generate Diagram"',
            'The visual editor opens with your diagram laid out in swimlanes',
          ]},
          { type: 'h3', content: 'No Ollama? Use the wizard instead' },
          { type: 'ol', content: [
            'Click "Wizard" in the top-right toggle',
            'Walk through the six steps: Identity, Participants, Trigger, Tasks, Gateways, Flows',
            'Click "Generate Diagram" at the end',
          ]},
        ],
      },
      {
        id: 'modes',
        title: 'Wizard vs. Editor mode',
        blocks: [
          { type: 'p', content:
            'Switch any time using the toggle in the top-right of the toolbar. ' +
            'Your work is preserved across switches.' },
          { type: 'h3', content: 'Wizard mode' },
          { type: 'ul', content: [
            'Six guided steps with structured forms',
            'Best for new diagrams when you know exactly what you want',
            'Generates the diagram on demand from your inputs',
          ]},
          { type: 'h3', content: 'Editor mode' },
          { type: 'ul', content: [
            'Full bpmn-js visual editor — drag, drop, click to edit',
            'Best for fine-tuning AI-generated diagrams or importing existing files',
            'Changes here become the source of truth',
          ]},
        ],
      },
    ],
  },

  // ── Section 3 ─────────────────────────────────────────────────────────────
  {
    id: 'ai-assist',
    title: 'AI Assist',
    topics: [
      {
        id: 'install-ollama',
        title: 'Install Ollama',
        blocks: [
          { type: 'p', content:
            'AI Assist runs entirely locally via Ollama. Nothing is sent to ' +
            'the cloud. Once installed, BPMN Studio detects it automatically.' },
          { type: 'ol', content: [
            'Download Ollama from https://ollama.ai',
            'Install for your OS (Windows installer, macOS .dmg, Linux script)',
            'Open a terminal and run: ollama pull llama3.2',
            'Verify Ollama is running: ollama list (should show llama3.2)',
            'Reopen BPMN Studio — the AI Assist panel shows a green "Ollama connected" badge',
          ]},
          { type: 'h3', content: 'Recommended models (any will work)' },
          { type: 'ul', content: [
            'llama3.2  — best balance of quality and speed (3 GB)',
            'mistral   — strong instruction following (4 GB)',
            'qwen2.5   — excellent at structured output (4 GB)',
            'phi3      — smallest viable option for low-RAM machines (2 GB)',
          ]},
          { type: 'note', content:
            'Larger models (7B+ parameters) produce more accurate diagrams ' +
            'but take longer. The two-pass verification adds time, not noise.' },
        ],
      },
      {
        id: 'writing-prompts',
        title: 'Writing good prompts',
        blocks: [
          { type: 'p', content:
            'Describe the process the way you would to a coworker. The AI ' +
            'extracts every action as a task, decisions as exclusive gateways, ' +
            'and parallel work as parallel gateways. A few rules of thumb:' },
          { type: 'ul', content: [
            'Mention every role explicitly — "the manager", "Finance", "the vendor"',
            'Use action verbs — "submits", "reviews", "approves", "issues"',
            'Make decisions explicit — "if approved... if rejected..."',
            'Note parallel work — "at the same time" or "in parallel"',
            'Mention thresholds — "under $5,000", "over $25,000"',
            'Identify the trigger and the end states clearly',
          ]},
          { type: 'h3', content: 'Example prompt' },
          { type: 'code', content:
            'When an employee needs reimbursement, they fill out an expense ' +
            'report and attach receipts, then submit it. Their manager reviews ' +
            'it. If rejected, the employee fixes and resubmits. If approved, ' +
            'Finance verifies the receipts, processes payment, and the ' +
            'employee gets a confirmation email.' },
        ],
      },
      {
        id: 'refining',
        title: 'Refining a diagram with AI',
        blocks: [
          { type: 'p', content:
            'After a diagram exists, an amber "Refine" button appears in the ' +
            'toolbar. Use it to make targeted changes in plain English ' +
            'without rewriting the whole prompt.' },
          { type: 'h3', content: 'Refinement patterns the AI understands' },
          { type: 'ul', content: [
            '"The VP handles task X" — reassigns a task to a different role',
            '"Add a step where Y does Z" — inserts a new task in the right lane',
            '"Change the threshold to $X" — updates gateway and flow labels',
            '"Remove the X step" — removes the task and reconnects flows around it',
            '"Rename X to Y" — updates the name everywhere it appears',
            '"Make X parallel with Y" — wraps in AND-Split / AND-Join',
            '"If X then Y, otherwise Z" — adds an exclusive decision',
          ]},
          { type: 'note', content:
            'Refinement preserves everything you didn\'t ask to change. ' +
            'Repeat the refinement step as many times as needed to dial in ' +
            'the diagram.' },
        ],
      },
      {
        id: 'closing-gateways',
        title: 'Closing (joining) gateways',
        blocks: [
          { type: 'p', content:
            'Per the BPMN 2.0 spec (and the Camunda BPMN reference), every ' +
            'diverging gateway should be matched by a converging gateway of ' +
            'the same type before paths can flow back into a single task or ' +
            'end event. BPMN Studio enforces this automatically.' },
          { type: 'h3', content: 'Why it matters' },
          { type: 'p', content:
            'If you split a process with an AND-gateway (parallel) and the two ' +
            'branches converge directly into the next task, the BPMN engine ' +
            'will fire that task once per branch instead of waiting for both ' +
            'to finish. The same applies to XOR and OR splits: skipping the ' +
            'closing gateway makes the diagram ambiguous and the runtime ' +
            'behavior unpredictable.' },
          { type: 'h3', content: 'What BPMN Studio does' },
          { type: 'ul', content: [
            'After parsing (and after every Refine), the post-processor walks the model.',
            'Any task or end event with two or more incoming flows gets a closing gateway inserted in front of it.',
            'The closing gateway type is chosen by tracing the branches back to their nearest split: AND-split → AND-join, XOR-split → XOR-merge, OR-split → OR-join.',
            'When the branches trace to splits of different types, an exclusive (XOR) merge is used as a safe default.',
            'If the join structure is already in place (the incoming flows already come from a converging gateway), the rule is a no-op — your model is preserved as-is.',
          ]},
          { type: 'h3', content: 'Wizard validation' },
          { type: 'p', content:
            'In wizard mode, hand-built diagrams aren\'t auto-corrected, but ' +
            'the validator surfaces a warning so you know to add the closing ' +
            'gateway yourself: "Task X has multiple incoming flows that ' +
            'aren\'t merged through a converging gateway."' },
        ],
      },
      {
        id: 'visual-review',
        title: 'Visual review pass',
        blocks: [
          { type: 'p', content:
            'BPMN Studio runs two automatic checks every time a diagram is ' +
            'generated. The first happens during parsing — the model ' +
            're-reads its own output and fixes logic errors before any ' +
            'shapes are placed. The second runs on the visual layout itself ' +
            'and tidies up the diagram before it reaches the canvas.' },
          { type: 'h3', content: 'What the visual review checks' },
          { type: 'ul', content: [
            'Connecting lines crossing the inside of any task, gateway, or event',
            'Lines riding on a swimlane boundary (where they get lost in the line)',
            'Two parallel lines stacked on the same axis (overlapping segments)',
            'Sequence-flow labels that would land on top of another shape',
            'Task labels that wouldn\'t fit in the default task width — boxes are widened so the text reads cleanly',
          ]},
          { type: 'h3', content: 'How fixes are applied' },
          { type: 'ol', content: [
            'The cleanup pass walks every flow segment and compares it against every shape\'s bounds.',
            'When a violation is detected, the segment is rerouted through the nearest empty column gap or in-lane gutter.',
            'If two parallel segments overlap, one is staggered by 8–16 pixels.',
            'If a flow label would cover a shape, an explicit label position is emitted to push it above, below, or beside the path.',
            'The whole pass runs up to six iterations, stopping as soon as no further fixes are needed.',
          ]},
          { type: 'h3', content: 'Status banner' },
          { type: 'p', content:
            'After each generation a small banner appears at the top of the ' +
            'canvas summarizing what the visual review did:' },
          { type: 'ul', content: [
            '"Visual review passed" — no collisions detected, diagram is clean',
            '"N adjustments applied" — count + a short breakdown of fixes (e.g. "2 reroutes, 1 stagger")',
            'Amber tint with "could not be auto-resolved" — extremely dense diagrams may have residual issues; the editor lets you nudge connections manually',
          ]},
          { type: 'note', content:
            'The visual review prioritizes accuracy over speed and runs ' +
            'fully on your machine. It adds at most a few hundred ' +
            'milliseconds to generation time even for large diagrams.' },
        ],
      },
      {
        id: 'silent-improvements',
        title: 'Silent improvements during generation',
        blocks: [
          { type: 'p', content:
            'After parsing your description, the app applies a few automatic ' +
            'corrections before drawing the diagram. These run in the ' +
            'background — they never produce a notification, an error ' +
            'message, or anything you have to dismiss. Their only job is to ' +
            'turn well-understood AI translation imperfections into a ' +
            'cleaner diagram.' },
          { type: 'h3', content: 'What gets corrected' },
          { type: 'ul', content: [
            'Parallel-vs-exclusive gateway type — if the AI picks a parallel (AND) gateway but the description uses "if / otherwise / unless" language with no parallelism phrase ("in parallel", "at the same time", "simultaneously", "while", "concurrently"), the gateway is flipped to exclusive (XOR).',
            'Outgoing flows on end events — BPMN end events terminate the process, so any outgoing flow the AI invents is dropped.',
            'Empty swimlanes — participants the AI declared but never assigned tasks to are removed so they don\'t leave blank lanes in the diagram.',
            'Visual collisions and label overlaps — see the "Visual review pass" topic above.',
          ]},
          { type: 'h3', content: 'Why there is no error panel' },
          { type: 'p', content:
            'Earlier versions of the app surfaced a "diagram quality audit" ' +
            'listing things like bundled task names, vague names, or ' +
            'object-as-actor participants. In practice every one of those ' +
            'findings reflected an AI translation choice, not a gap you ' +
            'could only fix by editing the description — and the fastest ' +
            'way to handle them is always to look at the diagram and use ' +
            'Refine if anything is wrong.' },
          { type: 'p', content:
            'The app now trusts you to evaluate the diagram visually. If ' +
            'parsing succeeds, you go straight to the editor — no ' +
            'pre-flight checklist, no error tally. If parsing fails ' +
            'outright (the AI couldn\'t produce a valid model from your ' +
            'text), you\'ll see a parse error in the natural-language ' +
            'panel and can adjust your description.' },
          { type: 'h3', content: 'When you see something off in the diagram' },
          { type: 'p', content:
            'Use the Refine button. Describe the change in plain language:' },
          { type: 'ul', content: [
            '"Split Process Payment into two tasks: Match Invoice and Process Payment."',
            '"Remove the System swimlane and reassign its tasks to Procurement."',
            '"Rename Step 1 to Create Purchase Request."',
            '"The threshold for auto-approval should be $10,000 instead of $5,000."',
          ]},
          { type: 'p', content:
            'Refine preserves the rest of the diagram and applies just the ' +
            'change you asked for, so iterating is cheap.' },
          { type: 'note', content:
            'A successfully generated diagram does not mean it perfectly ' +
            'matches your real-world process. Always sanity-check the ' +
            'diagram visually before sharing.' },
        ],
      },
    ],
  },

  // ── Section 4 ─────────────────────────────────────────────────────────────
  {
    id: 'wizard',
    title: 'Wizard Mode',
    topics: [
      {
        id: 'wizard-steps',
        title: 'The six wizard steps',
        blocks: [
          { type: 'h3', content: '1. Identity' },
          { type: 'p', content: 'Process name, description, version, and owner. The name shows on the cover page of every export.' },
          { type: 'h3', content: '2. Participants' },
          { type: 'p', content: 'Add each role or department as a swimlane. Order here is the top-to-bottom order in the diagram.' },
          { type: 'h3', content: '3. Trigger' },
          { type: 'p', content: 'The start event — what kicks the process off. Choose the event type (none, message, timer, signal, conditional, error).' },
          { type: 'h3', content: '4. Tasks' },
          { type: 'p', content: 'Each action in the process. Assign each to a participant (lane). Choose the type — user task, service task, script task, etc.' },
          { type: 'h3', content: '5. Gateways' },
          { type: 'p', content: 'Decision points. Exclusive (XOR) for branching, Parallel (AND) for fork/join, Inclusive (OR) for one-or-more, Event-Based for waiting on multiple events.' },
          { type: 'h3', content: '6. Flows' },
          { type: 'p', content: 'Connect the elements. Add labels on gateway branches ("Yes" / "No", "Approved" / "Rejected", etc.). Click Generate to render.' },
        ],
      },
    ],
  },

  // ── Section 5 ─────────────────────────────────────────────────────────────
  {
    id: 'editor',
    title: 'Visual Editor',
    topics: [
      {
        id: 'editor-basics',
        title: 'Editor basics',
        blocks: [
          { type: 'p', content:
            'The visual editor is bpmn-js — the same engine used by Camunda ' +
            'and bpmn.io. Everything you can do in those tools you can do here.' },
          { type: 'h3', content: 'Common actions' },
          { type: 'ul', content: [
            'Click any element to see context-action icons (delete, append, change type)',
            'Drag from the left palette to add new elements',
            'Drag elements to reposition; flows reroute automatically',
            'Double-click to edit names',
            'Right-click for the full action menu',
          ]},
        ],
      },
      {
        id: 'shortcuts',
        title: 'Keyboard shortcuts',
        blocks: [
          { type: 'kbd-table', content: [
            ['Ctrl/Cmd + Z',  'Undo'],
            ['Ctrl/Cmd + Y',  'Redo'],
            ['Ctrl/Cmd + +',  'Zoom in'],
            ['Ctrl/Cmd + -',  'Zoom out'],
            ['Ctrl/Cmd + 0',  'Fit to viewport'],
            ['Delete',        'Remove selected element'],
            ['Arrow keys',    'Pan the canvas'],
            ['Enter',         'Edit element name'],
            ['Esc',           'Cancel current action'],
          ]},
        ],
      },
    ],
  },

  // ── Section 6 ─────────────────────────────────────────────────────────────
  {
    id: 'exports',
    title: 'Importing & Exporting',
    topics: [
      {
        id: 'export-formats',
        title: 'Export formats',
        blocks: [
          { type: 'h3', content: 'BPMN 2.0 (.bpmn)' },
          { type: 'p', content: 'The open standard. Use this to share with anyone using Camunda, Signavio, Bizagi, IBM BAW, or any BPMN-compatible tool. It\'s also the format that round-trips through BPMN Studio without loss.' },
          { type: 'h3', content: 'PDF' },
          { type: 'p', content: 'Multi-page handoff document: cover (with title, version, owner, date, counts), the diagram (vector-rendered for crisp print), and the full process documentation (participants, tasks, gateways, end events, sequence flows).' },
          { type: 'h3', content: 'SVG' },
          { type: 'p', content: 'Vector image. Best for slides, documentation, or anywhere you want to scale without pixelation.' },
          { type: 'h3', content: 'PNG' },
          { type: 'p', content: 'Raster image at 2× resolution. Drop into any tool that doesn\'t take SVG.' },
        ],
      },
      {
        id: 'importing',
        title: 'Importing existing diagrams',
        blocks: [
          { type: 'p', content:
            'Click "Open" in the toolbar to load any .bpmn or .xml file. ' +
            'BPMN Studio reads the diagram interchange (DI) information when ' +
            'present, otherwise it auto-lays out elements.' },
          { type: 'note', content:
            'Files exported from other BPMN tools may include extension ' +
            'attributes (e.g. Camunda execution properties) that are ' +
            'preserved on round-trip but not edited in the visual editor.' },
        ],
      },
    ],
  },

  // ── Section 7 ─────────────────────────────────────────────────────────────
  {
    id: 'reference',
    title: 'BPMN Element Reference',
    topics: [
      {
        id: 'events',
        title: 'Events',
        blocks: [
          { type: 'p', content: 'Events represent something that happens during the process.' },
          { type: 'h3', content: 'Start event' },
          { type: 'p', content: 'Triggers the process. Empty circle. Subtypes: message, timer, signal, conditional, error.' },
          { type: 'h3', content: 'End event' },
          { type: 'p', content: 'Concludes a path. Thick-bordered circle. Subtypes: terminate (ends entire process), error, signal, escalation, message.' },
          { type: 'h3', content: 'Intermediate event' },
          { type: 'p', content: 'Something that happens between start and end. Double-bordered circle. Used for waiting (timers, messages) or signaling.' },
        ],
      },
      {
        id: 'tasks',
        title: 'Tasks',
        blocks: [
          { type: 'p', content: 'Tasks are the work performed in the process.' },
          { type: 'ul', content: [
            'User Task — a person does the work',
            'Service Task — a system does the work',
            'Script Task — automated script execution',
            'Send / Receive Task — sends or waits for a message',
            'Manual Task — work outside the system',
            'Business Rule Task — invokes a decision rules engine',
          ]},
        ],
      },
      {
        id: 'gateways',
        title: 'Gateways',
        blocks: [
          { type: 'p', content: 'Gateways control the flow — splitting paths or merging them.' },
          { type: 'h3', content: 'Exclusive (XOR) — diamond with X' },
          { type: 'p', content: 'Pick exactly one path based on a condition. The most common gateway.' },
          { type: 'h3', content: 'Parallel (AND) — diamond with +' },
          { type: 'p', content: 'All outgoing paths execute simultaneously. Use a matching parallel gateway downstream to join them.' },
          { type: 'h3', content: 'Inclusive (OR) — diamond with circle' },
          { type: 'p', content: 'One or more outgoing paths execute based on conditions. Less common; use sparingly.' },
          { type: 'h3', content: 'Event-Based — diamond with pentagon' },
          { type: 'p', content: 'The path taken depends on which event fires first.' },
        ],
      },
    ],
  },

  // ── Section 8 ─────────────────────────────────────────────────────────────
  {
    id: 'tips',
    title: 'Tips & Best Practices',
    topics: [
      {
        id: 'modeling-tips',
        title: 'Modeling tips',
        blocks: [
          { type: 'ul', content: [
            'Name tasks as imperative verb phrases — "Approve Request", not "Approval"',
            'Every gateway split should converge — don\'t leave parallel branches dangling',
            'Avoid more than 7-9 elements per lane — split into sub-processes if needed',
            'Use exclusive gateways for "if this then that" — don\'t use multiple gateways for the same decision',
            'End events come last in the flow, never at the same X position as the start event',
            'Loops should target a task, never the start event',
          ]},
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        blocks: [
          { type: 'h3', content: 'AI Assist shows "Ollama offline"' },
          { type: 'ul', content: [
            'Confirm Ollama is running: open a terminal and run "ollama list"',
            'Check the default port (11434) is not blocked',
            'Restart Ollama if it was just installed',
          ]},
          { type: 'h3', content: 'Diagram looks bunched or overlapping' },
          { type: 'ul', content: [
            'Switch to editor mode and use Ctrl/Cmd + 0 to fit view',
            'For complex diagrams from the AI, run a refinement asking to "split into clearer parallel branches"',
            'Imported third-party diagrams may need manual repositioning',
          ]},
          { type: 'h3', content: 'PDF export fails or looks wrong' },
          { type: 'ul', content: [
            'Try exporting SVG first to confirm the diagram itself is fine',
            'If the diagram contains unusual characters in names, simplify them',
            'Re-export with a simpler diagram to isolate the issue',
          ]},
        ],
      },
    ],
  },

  // ── Section 9 ─────────────────────────────────────────────────────────────
  {
    id: 'about',
    title: 'About',
    topics: [
      {
        id: 'about-bpmn-studio',
        title: 'About BPMN Studio',
        blocks: [
          { type: 'p', content:
            'BPMN Studio is built on top of bpmn-js (the open-source BPMN ' +
            'rendering engine from Camunda) and runs entirely in your ' +
            'browser. It produces standards-compliant BPMN 2.0 XML.' },
          { type: 'h3', content: 'Privacy' },
          { type: 'ul', content: [
            'No analytics, no telemetry, no network calls',
            'AI features run against a local Ollama server you control',
            'All files stay on your machine',
          ]},
          { type: 'h3', content: 'Open standard' },
          { type: 'p', content:
            'BPMN 2.0 is an OMG specification. Files produced by BPMN ' +
            'Studio open in Camunda Modeler, Signavio, Bizagi, IBM BAW, ' +
            'and any BPMN-compatible tool.' },
        ],
      },
    ],
  },
]
