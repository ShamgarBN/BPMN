/**
 * Natural-language → WizardState parser.
 *
 * Primary path:  Ollama local LLM with a structured JSON prompt.
 * Fallback path: Rule-based heuristic parser (works offline, handles common patterns).
 *
 * The output is a Partial<WizardState> ready to be loaded into the Zustand store.
 */

import { generateCompletion } from './ollamaService'
import { insertClosingGatewaysBeforeConvergence } from './gatewayRepairService'
// Note: runFullAudit is deliberately not invoked from this file — see the
// comment in parseProcessText for context.  The type is kept so the public
// ParseProcessResult shape remains stable for callers.
import { type AuditReport } from './auditService'
import { autoFixModel } from './autoFixService'
import { extractJsonBlock } from './jsonExtractUtil'
import type {
  WizardState, Participant, Task, Gateway, FlowConnection,
  StartEvent, EndEvent, TaskType, GatewayType, EndEventType, StartEventType,
} from '@/types/wizard'
import { PARTICIPANT_COLORS } from '@/types/wizard'

// ── Intermediate parsed structure ──────────────────────────────────────────────

export interface ParsedParticipant  { name: string }
export interface ParsedTask         { name: string; participantName: string; type?: string }
export interface ParsedGateway      { name: string; type?: string }
export interface ParsedFlow         { from: string; to: string; label?: string }
export interface ParsedEndEvent     { name: string }

export interface ParsedProcess {
  processName: string
  processDescription: string
  participants: ParsedParticipant[]
  startEvent: { name: string; type?: string }
  tasks: ParsedTask[]
  gateways: ParsedGateway[]
  flows: ParsedFlow[]
  endEvents: ParsedEndEvent[]
}

// ── Ollama prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert BPMN 2.0 process analyst. Read the description carefully and extract a complete, valid BPMN process model.

Return ONLY a raw JSON object — no markdown, no explanation, no code fences. Start with { and end with }.

=== STEP-BY-STEP METHOD ===
Before writing JSON, do this analysis (silently):
  1. List EVERY action verb in the description ("creates", "sends", "notifies", "ships", "picks up", "attends", "signs", "follows up", "runs", "adds", "scoops", "hits", "pours"…). Each action verb = one task. Comma-and lists like "add a filter, scoop in the grounds, and hit the start button" expand to THREE tasks, not one.
  2. List every distinct PERSON, ROLE, TEAM, or AUTONOMOUS SYSTEM mentioned. Tools and equipment (coffee maker, oven, app, web form, database) are NOT participants. If a description has only a single actor (e.g. "you" / "the user"), produce ONE participant such as "User".
  3. Identify decision points (words like "if", "depending on", "in case", "either/or", "otherwise", "missing or incorrect"). Each = one exclusiveGateway. TWO separate "if" decisions in a row = TWO exclusive gateways, not one parallel block.
  4. Identify TRUE parallelism (words like "in parallel", "at the same time", "simultaneously", "while X is happening"). Each split = one parallelGateway split + one parallelGateway join. If the description is just sequential steps with conditions, there is NO parallelism.
  5. Connect everything end-to-end with flows. Trace from start event through every branch to every end event.

Then output the JSON.

=== JSON SCHEMA ===
{
  "processName": "Concise name (3-6 words)",
  "processDescription": "One-sentence summary",
  "participants": [ { "name": "Role or team name" } ],
  "startEvent": { "name": "Trigger noun phrase", "type": "none" },
  "tasks": [
    { "name": "Verb phrase (3-6 words)", "participantName": "EXACT participant name", "type": "userTask" }
  ],
  "gateways": [
    { "name": "Question ending in ? for exclusive, or 'AND Split'/'AND Join' for parallel", "type": "exclusiveGateway | parallelGateway" }
  ],
  "flows": [
    { "from": "EXACT source name", "to": "EXACT target name", "label": "Condition label for exclusive branches, else empty" }
  ],
  "endEvents": [ { "name": "How this path ends" } ]
}

=== WORKED EXAMPLE 1 — Linear with one decision ===
Input: "A customer submits an order. Finance checks credit. If approved, ship the order. If declined, notify the customer."

Output:
{
  "processName": "Order Approval Process",
  "processDescription": "Process customer orders with credit check.",
  "participants": [{"name":"Customer"},{"name":"Finance"}],
  "startEvent": {"name":"Order Submitted","type":"none"},
  "tasks": [
    {"name":"Check Credit","participantName":"Finance","type":"userTask"},
    {"name":"Ship Order","participantName":"Finance","type":"userTask"},
    {"name":"Notify Customer","participantName":"Finance","type":"userTask"}
  ],
  "gateways": [{"name":"Credit Approved?","type":"exclusiveGateway"}],
  "flows": [
    {"from":"Order Submitted","to":"Check Credit","label":""},
    {"from":"Check Credit","to":"Credit Approved?","label":""},
    {"from":"Credit Approved?","to":"Ship Order","label":"Approved"},
    {"from":"Ship Order","to":"Order Shipped","label":""},
    {"from":"Credit Approved?","to":"Notify Customer","label":"Declined"},
    {"from":"Notify Customer","to":"Order Rejected","label":""}
  ],
  "endEvents": [{"name":"Order Shipped"},{"name":"Order Rejected"}]
}

=== WORKED EXAMPLE 2 — Parallelism + decision + loop ===
Input: "When a claim is filed, the agent verifies coverage and the adjuster inspects damage at the same time. After both finish, a manager reviews. If complete, payment is issued. If documents missing, agent collects more info and resubmits for review."

Output:
{
  "processName": "Insurance Claim Processing",
  "processDescription": "Process insurance claims with parallel verification and review.",
  "participants": [{"name":"Agent"},{"name":"Adjuster"},{"name":"Manager"}],
  "startEvent": {"name":"Claim Filed","type":"none"},
  "tasks": [
    {"name":"Verify Coverage","participantName":"Agent","type":"userTask"},
    {"name":"Inspect Damage","participantName":"Adjuster","type":"userTask"},
    {"name":"Review Claim","participantName":"Manager","type":"userTask"},
    {"name":"Issue Payment","participantName":"Manager","type":"userTask"},
    {"name":"Collect More Info","participantName":"Agent","type":"userTask"}
  ],
  "gateways": [
    {"name":"AND Split","type":"parallelGateway"},
    {"name":"AND Join","type":"parallelGateway"},
    {"name":"Documents Complete?","type":"exclusiveGateway"}
  ],
  "flows": [
    {"from":"Claim Filed","to":"AND Split","label":""},
    {"from":"AND Split","to":"Verify Coverage","label":""},
    {"from":"AND Split","to":"Inspect Damage","label":""},
    {"from":"Verify Coverage","to":"AND Join","label":""},
    {"from":"Inspect Damage","to":"AND Join","label":""},
    {"from":"AND Join","to":"Review Claim","label":""},
    {"from":"Review Claim","to":"Documents Complete?","label":""},
    {"from":"Documents Complete?","to":"Issue Payment","label":"Yes"},
    {"from":"Issue Payment","to":"Claim Paid","label":""},
    {"from":"Documents Complete?","to":"Collect More Info","label":"No"},
    {"from":"Collect More Info","to":"Review Claim","label":""}
  ],
  "endEvents": [{"name":"Claim Paid"}]
}

=== WORKED EXAMPLE 3 — Single actor, sequential XOR decisions, comma-and action list ===
Input: "When I want a sandwich, I check the bread. If there's none, I run to the store and buy more. Otherwise I go straight on. Then I check the deli drawer — if it's empty I open a fresh pack, if not I skip ahead. Finally I lay out the bread, add the meat, add cheese, and take a bite."

Output:
{
  "processName": "Make A Sandwich",
  "processDescription": "Single-actor sandwich preparation with two sequential conditional checks.",
  "participants": [{"name":"User"}],
  "startEvent": {"name":"Wants Sandwich","type":"none"},
  "tasks": [
    {"name":"Check Bread","participantName":"User","type":"userTask"},
    {"name":"Buy More Bread","participantName":"User","type":"userTask"},
    {"name":"Check Deli Drawer","participantName":"User","type":"userTask"},
    {"name":"Open Fresh Pack","participantName":"User","type":"userTask"},
    {"name":"Lay Out Bread","participantName":"User","type":"userTask"},
    {"name":"Add Meat","participantName":"User","type":"userTask"},
    {"name":"Add Cheese","participantName":"User","type":"userTask"}
  ],
  "gateways": [
    {"name":"Bread Available?","type":"exclusiveGateway"},
    {"name":"Deli Drawer Empty?","type":"exclusiveGateway"}
  ],
  "flows": [
    {"from":"Wants Sandwich","to":"Check Bread","label":""},
    {"from":"Check Bread","to":"Bread Available?","label":""},
    {"from":"Bread Available?","to":"Buy More Bread","label":"No"},
    {"from":"Buy More Bread","to":"Check Deli Drawer","label":""},
    {"from":"Bread Available?","to":"Check Deli Drawer","label":"Yes"},
    {"from":"Check Deli Drawer","to":"Deli Drawer Empty?","label":""},
    {"from":"Deli Drawer Empty?","to":"Open Fresh Pack","label":"Yes"},
    {"from":"Open Fresh Pack","to":"Lay Out Bread","label":""},
    {"from":"Deli Drawer Empty?","to":"Lay Out Bread","label":"No"},
    {"from":"Lay Out Bread","to":"Add Meat","label":""},
    {"from":"Add Meat","to":"Add Cheese","label":""},
    {"from":"Add Cheese","to":"Sandwich Ready","label":""}
  ],
  "endEvents": [{"name":"Sandwich Ready"}]
}
KEY POINTS in Example 3:
  - One participant ("User") because there is one actor. The bread, drawer, and meat are NOT participants.
  - TWO exclusiveGateways back-to-back (NOT one parallel split) because the source uses "if / otherwise / if / not".
  - Each comma-and action ("lay out the bread, add the meat, add cheese") becomes a distinct task.
  - Each XOR branch converges before the next sequential step.

=== MANDATORY RULES ===

RULE 1 — EXTRACT EVERY ACTION VERB AS A TASK.
"creates a record, sends a packet, notifies IT, provisions accounts, ships laptop, assigns desk, orders badge, prepares plan, assigns buddy, picks up badge, attends orientation, signs documents, follows up, runs kickoff meeting" = 14+ separate tasks. Do NOT merge or skip actions.
Comma-and lists are NOT one task: "add a filter, scoop in the grounds, and hit the start button" = THREE tasks ("Add Filter", "Scoop In Grounds", "Hit Start Button"). "Pour into mug, add cream and sugar, and enjoy" = THREE tasks. Never collapse a list of actions into a single summary task like "Brew Coffee" or "Prepare Drink".

RULE 2 — PARALLELISM (AND) vs DECISION (XOR) — PICK CAREFULLY.
Use parallelGateway ONLY when the text explicitly says work happens at the same time:
  TRIGGERS for parallelGateway: "in parallel", "at the same time", "simultaneously", "while X is happening", "concurrently", "both X AND Y must be done" (where both are required, no choice).
Use exclusiveGateway for ANY conditional branching:
  TRIGGERS for exclusiveGateway: "if", "otherwise", "or else", "depending on", "in case", "when X but not Y", "either ... or", "if X, do A; if Y, do B", "if low, fill it; if full, skip".
ANTI-PATTERN — DO NOT DO THIS:
  Text: "If the reservoir is low, fill it; if full, skip." → WRONG to use AND Split/AND Join. CORRECT: ONE exclusiveGateway "Reservoir Low?" with branches "Yes" → Fill Reservoir → next step, and "No" → next step directly.
ANTI-PATTERN — DO NOT DO THIS:
  Two sequential conditions ("Check beans. If empty, refill. Then check water. If low, fill.") = TWO exclusiveGateways back-to-back. NOT one parallel split.
If you produce a parallelGateway, you MUST be able to quote the explicit "in parallel" / "at the same time" / "simultaneously" / "while" phrase from the source text. If you cannot, change it to exclusiveGateway.

RULE 3 — ONE EXCLUSIVE GATEWAY PER DECISION.
One decision = ONE exclusiveGateway + N outgoing labeled flows. Never split a decision into multiple gateways.

RULE 3b — PARTICIPANTS ARE ACTORS, NOT OBJECTS.
A participant is a PERSON, ROLE, TEAM, DEPARTMENT, or AUTONOMOUS SYSTEM that performs actions.
NEVER make a participant out of:
  - Equipment / appliances (coffee maker, printer, oven, server rack)
  - Documents / forms / records (purchase request, expense report, application)
  - Software UI surfaces (button, dashboard, screen, page)
  - Materials / supplies (beans, water, coffee, paper)
If the description uses a single actor like "you" or "the user", create ONE participant named "User" (or the role implied by context such as "Employee", "Customer", "Driver"). Do NOT invent extra participants from objects the actor uses.

RULE 4 — EVERY ELEMENT MUST BE CONNECTED.
Every task, gateway, and end event needs incoming flow(s) and (except end events) outgoing flow(s). No floating elements.

RULE 5 — LOOPS POINT TO TASKS, NEVER THE START EVENT.
Loop-back targets must be a previous TASK. The start event has exactly ONE outgoing flow and ZERO incoming flows.

RULE 6 — END EVENTS HAVE INCOMING FLOWS ONLY.
End events have ≥1 incoming flow and 0 outgoing flows.

RULE 7 — EXACT NAME MATCHING.
Flow "from" and "to" must be character-for-character identical to names in startEvent, tasks, gateways, or endEvents.

RULE 8 — PARTICIPANT ASSIGNMENT.
Assign each task to the role that PERFORMS it (the active subject of the verb).
  - "Manager approves" → Manager task (NOT Employee)
  - "VP signs off" → VP task (NOT Manager)
  - "Procurement issues PO" → Procurement task (NOT Employee)
  - "Vendor delivers goods" → Vendor task (NOT Employee)
  - "Accounts Payable processes payment" → Accounts Payable task (NOT Employee)
EVERY participant you declare must have at least ONE task. If a role doesn't perform any action, don't declare it.

RULE 9 — TIERED DECISIONS CONVERGE.
When a decision has tiered branches (e.g. small/medium/large approval thresholds), ALL branches must converge back to the next sequential step. Example:
  - "Under $5k → Manager approves" — branch reaches Approve Manager task
  - "$5k–$25k → Manager + Director approve" — branch
  - "Over $25k → Manager + Director + Finance + VP approve" — branch
  After all three branches finish their approvals, they ALL flow into the next step ("Procurement reviews"), NOT to an end event. The process only ends after the FINAL step (payment).

RULE 10 — VERIFY BEFORE RETURNING.
Trace every path from the start event. Each must reach an end event AFTER all sequential steps in the description have been performed. No premature endings.`

function buildPrompt(text: string): string {
  return `${SYSTEM_PROMPT}\n\nProcess description:\n${text}`
}

// ── Verification prompt ────────────────────────────────────────────────────────
// Second-pass prompt: takes the original text and the first-pass JSON,
// asks the model to critically verify and correct the model.  Focused
// heavily on decision logic since that's where extraction errors hurt most.
const VERIFY_PROMPT = `You are a senior BPMN 2.0 quality reviewer. Below is a process description and a candidate JSON BPMN model. Find errors and return a CORRECTED JSON.

YOUR PRIORITY: ACCURACY OVER SPEED. Re-read the description carefully. Trace every path. Validate every role. Do not be lazy.

=== CRITICAL CHECKS — work through each one ===

CHECK A — DECISION LOGIC
For EACH gateway in the JSON, re-read the original text and answer:
  1. Is this gateway describing an actual decision in the text?
  2. What are ALL the EXACT outcomes mentioned in the text?
  3. Does the JSON have one outgoing flow per outcome, with correct labels?
  4. Are tiered decisions (e.g. "if under $5k", "if $5k–$25k", "if over $25k") modeled as ONE exclusiveGateway with three outgoing branches — NOT three separate gateways?
  5. Does each branch lead to the right downstream tasks? Trace it from the branch out to where it joins the rest of the process.
  6. After tiered decisions, do all branches CONVERGE back to the next sequential step (e.g. all approval branches must reach "Procurement reviews request"), not end early?

CHECK A2 — GATEWAY TYPE (AND vs XOR) — DO THIS FOR EVERY GATEWAY
For EACH gateway, answer:
  1. What exact phrase in the source text triggered this gateway? Quote it.
  2. If the trigger phrase is "if", "otherwise", "or else", "in case", "either/or", "depending on", "when ... but not ...", "if X then ..., if Y then ..." → the gateway MUST be exclusiveGateway. If JSON has parallelGateway, FIX to exclusiveGateway and rename to a question ending in "?".
  3. Only keep parallelGateway when the text literally says "in parallel", "at the same time", "simultaneously", "concurrently", "while X is happening", or "BOTH X AND Y must be done" with no choice.
  4. If you cannot quote an explicit parallelism phrase from the source, change every parallelGateway to exclusiveGateway.
  5. Two sequential "if" decisions = TWO exclusiveGateways back-to-back. NEVER model them as one parallel block.

CHECK A3 — PARTICIPANTS ARE ACTORS
For EACH participant:
  1. Is this a PERSON, ROLE, TEAM, DEPARTMENT, or AUTONOMOUS SYSTEM that performs an action?
  2. If it's equipment (coffee maker, printer), an object (form, request, beans), a UI element (button, dashboard), or a material (water, paper) — REMOVE it. Reassign any tasks falsely placed in it to the actual actor (often "User", "Employee", or the implied human in the description).
  3. If the source has only one actor ("you" / "the user"), the JSON should have exactly one participant.

CHECK B — PARTICIPANT-TASK ASSIGNMENT (CRITICAL — empty lanes are unacceptable)
For EACH participant declared in the JSON:
  1. Does this participant have at least ONE task with participantName matching exactly?
  2. If NOT, find the action this participant performs in the text and ADD a task for them. Examples:
     - "VP signs off" → add task "Approve Over \\$25,000" assigned to VP
     - "Vendor delivers goods" → add task "Deliver Goods or Services" assigned to Vendor
     - "Accounts Payable processes payment" → add task to Accounts Payable
  3. If the text does not mention any action for this participant, REMOVE the participant from the JSON.
For EACH task:
  4. Is participantName the role that ACTUALLY performs the action in the text?
     - "Manager approves" → Manager (NOT Employee)
     - "VP signs off" → VP (NOT Manager, NOT Employee)
     - "Procurement issues PO" → Procurement (NOT Employee)
     - "Accounts Payable matches invoice" → Accounts Payable (NOT Employee)
  5. Fix any misassigned tasks.

CHECK C — COMPLETENESS (catch dropped actions, especially in comma-and lists)
For every action verb in the text ("creates", "routes", "approves", "reviews", "verifies", "runs onboarding", "issues", "delivers", "confirms", "matches", "processes", "adds", "scoops", "hits", "pours"), is there a matching task assigned to the correct role? Add ANY missing tasks.
PAY EXTRA ATTENTION to comma-and lists: "do A, do B, and do C" should always produce three tasks. Examples:
  - "Add a filter, scoop in the grounds, and hit the start button" → 3 tasks: Add Filter, Scoop In Grounds, Hit Start Button.
  - "Pour into mug, add cream and sugar, and enjoy" → at minimum: Pour Into Mug, Add Cream And Sugar (then end event "Enjoy Morning Cup" if "enjoy" is the terminal experience).
If the candidate JSON collapsed several actions into a summary task (e.g. one "Brew Coffee" covering filter+grounds+start+brew), split it back into discrete tasks.

CHECK D — END-TO-END FLOW
Trace from the start event through EVERY branch to an end event:
  1. Does each path actually reach an end event?
  2. Do convergence points (after decisions or parallel splits) lead to the next sequential step?
  3. Is there NO orphan "end" that skips required downstream work? (e.g. a manager approval should not directly end the process if procurement, vendor, and AP steps follow)

CHECK E — PARALLELISM
For every "in parallel", "at the same time", "while", "both X and Y", "all of X, Y, Z" requiring simultaneous work:
  1. Is there a parallelGateway "AND Split" before the parallel work?
  2. Are ALL parallel branches present in the flows?
  3. Is there a parallelGateway "AND Join" reconverging them?
NOTE: "Both manager and director must approve" → AND Split + 2 parallel approvals + AND Join.

CHECK F — CONNECTIVITY
Each task, gateway, and end event must be connected by flows. Flow "from"/"to" names must match exactly an element name.

CHECK G — START/END CONSTRAINTS
Start event: ZERO incoming, EXACTLY ONE outgoing.
End events: ≥1 incoming, ZERO outgoing.
Loops: target a task (never the start event).

If the JSON is correct, return it unchanged. Otherwise return a corrected version. Return ONLY a raw JSON object — no markdown, no explanation. Start with { and end with }.`

// ── JSON extraction (handles model wrapping response in code fences) ───────────

// Local alias kept so the rest of this file's code reads cleanly.
const extractJson = extractJsonBlock

// ── Refinement prompt ──────────────────────────────────────────────────────────
// Lets the user iterate on an existing model with natural-language tweaks.
const REFINE_PROMPT = `You are a BPMN refinement assistant. The user already has a BPMN process model and wants to apply natural-language changes to it.

YOUR JOB:
  1. Read the current model JSON.
  2. Read the user's refinement request.
  3. Apply the change PRECISELY — only modify what the user explicitly asks for.
  4. Preserve the rest of the model unchanged (do NOT redo the whole thing).
  5. Return the COMPLETE updated JSON with all elements (changed and unchanged).

COMMON REFINEMENT PATTERNS — apply faithfully:

  • "The VP handles task X" / "X should be done by Y"
    → Change participantName of task X to Y. If Y isn't a participant yet, add it.
    → If Y is no longer used by any task, remove that participant.

  • "Add a step where Z does W"
    → Add a new task with name "W" and participantName "Z" at the right point in the flow.
    → Insert it into the flows by replacing one flow A→B with A→W and W→B.

  • "The threshold should be X" / "Change the limit to X"
    → Update gateway names and flow labels with the new threshold.

  • "Remove the X step"
    → Remove the task. Reconnect surrounding flows: if A→X→B, replace with A→B.
    → Drop the participant if no remaining task uses it.

  • "Rename X to Y"
    → Update X's name to Y everywhere (task name, gateway name, flows referencing it).

  • "Y should come before Z"
    → Reorder by adjusting flows. Find the flow that targets Z and verify Y is upstream.

  • "Make X parallel with Y"
    → Wrap X and Y in an AND-Split before them and an AND-Join after.
    → Preserve the upstream and downstream connections.

  • "If X then Y, otherwise Z"
    → Add an exclusiveGateway with two outgoing flows labeled with the condition outcomes.

CRITICAL RULES:
  - Do NOT remove existing tasks/gateways/flows the user didn't ask to change.
  - Do NOT add tasks the user didn't ask for.
  - Keep all element names character-for-character consistent across tasks/flows.
  - Every participant in the output must have ≥1 task. Drop unused ones.
  - Every flow's "from" and "to" must match an actual element name.
  - Start event has 1 outgoing, 0 incoming. End events have ≥1 incoming, 0 outgoing.

Return ONLY a raw JSON object — no markdown, no explanation, no code fences. Start with { and end with }.`

// Convert a wizard state back into a ParsedProcess for refinement.
// IDs are dropped — the LLM works with names, and we re-resolve to IDs after.
export function wizardStateToParsedProcess(state: {
  processName?: string
  processDescription?: string
  participants?: Array<{ id: string; name: string }>
  startEvent?: { id: string; name: string; type: string }
  tasks?: Array<{ id: string; name: string; type: string; participantId: string }>
  gateways?: Array<{ id: string; name: string; type: string }>
  flows?: Array<{ sourceId: string; targetId: string; label: string }>
  endEvents?: Array<{ id: string; name: string }>
}): ParsedProcess {
  const participantById = new Map(
    (state.participants ?? []).map(p => [p.id, p.name])
  )
  const elementById = new Map<string, string>()
  if (state.startEvent) elementById.set(state.startEvent.id, state.startEvent.name)
  ;(state.tasks ?? []).forEach(t    => elementById.set(t.id, t.name))
  ;(state.gateways ?? []).forEach(g => elementById.set(g.id, g.name))
  ;(state.endEvents ?? []).forEach(e => elementById.set(e.id, e.name))

  return {
    processName: state.processName ?? '',
    processDescription: state.processDescription ?? '',
    participants: (state.participants ?? []).map(p => ({ name: p.name })),
    startEvent: {
      name: state.startEvent?.name ?? 'Start',
      type: state.startEvent?.type ?? 'none',
    },
    tasks: (state.tasks ?? []).map(t => ({
      name: t.name,
      participantName: participantById.get(t.participantId) ?? '',
      type: t.type,
    })),
    gateways: (state.gateways ?? []).map(g => ({
      name: g.name,
      type: g.type,
    })),
    flows: (state.flows ?? []).map(f => ({
      from: elementById.get(f.sourceId) ?? '',
      to:   elementById.get(f.targetId) ?? '',
      label: f.label ?? '',
    })),
    endEvents: (state.endEvents ?? []).map(e => ({ name: e.name })),
  }
}

// Refine an existing model using natural-language instructions.
export async function refineWithOllama(
  currentModel: ParsedProcess,
  refinementText: string,
  model: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ParsedProcess> {
  const fullPrompt = `${REFINE_PROMPT}

CURRENT MODEL:
${JSON.stringify(currentModel, null, 2)}

USER REFINEMENT REQUEST:
${refinementText}

Return the updated JSON now:`

  onChunk?.('\nApplying refinement...\n\n')
  const raw = await generateCompletion(fullPrompt, model, onChunk, signal)
  const json = extractJson(raw)
  try {
    return JSON.parse(json) as ParsedProcess
  } catch (err) {
    throw new Error(`Refinement JSON parse failed: ${(err as Error).message}`)
  }
}

/**
 * Re-export from refineRules.ts (kept in a separate module so it can be unit-
 * tested with --experimental-strip-types without dragging in the full
 * nlpService import graph).  See refineRules.ts for the implementation.
 */
import { refineWithRules } from './refineRules'
export { refineWithRules } from './refineRules'

/**
 * Full refine pipeline — mirrors `parseWithOllama` so refinements get the
 * same quality treatment as the initial parse.  Adds:
 *   • a second verification pass over the refined model (using the same
 *     VERIFY_PROMPT as parsing, but with the refinement instruction
 *     included as context)
 *   • the deterministic `autoFixModel` pass (parallel→exclusive flips,
 *     illegal end-event flows removed)
 *
 * Returns the cleaned, verified parsed process.  The caller is responsible
 * for converting back to WizardState via parsedToWizardState.
 */
export async function refineProcess(
  currentModel: ParsedProcess,
  refinementText: string,
  model: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ParsedProcess> {
  // ── Pass 0: try the deterministic refiner first ────────────────────────
  // For high-confidence patterns (rename, re-assign, threshold tweak, remove)
  // we skip the LLM entirely.  This makes the common case faster, more
  // reliable, and keeps refinements working when Ollama is briefly slow or
  // unavailable.  Anything more complex falls through to the LLM pipeline.
  const deterministic = refineWithRules(currentModel, refinementText)
  if (deterministic.applied) {
    onChunk?.(`Applied without LLM: ${deterministic.description}\n`)
    const { model: fixedNoLlm } = autoFixModel(refinementText, deterministic.model)
    return fixedNoLlm
  }

  // ── Pass 1: apply the refinement ────────────────────────────────────────
  onChunk?.('[Pass 1/2] Applying refinement…\n\n')
  let refined = await refineWithOllama(currentModel, refinementText, model, onChunk, signal)

  // ── Pass 2: verification — same prompt as parsing, with the refinement
  // included so the verifier knows what was meant to change.  We treat
  // failures here as soft errors: refine returns whatever pass 1 produced
  // rather than failing the user request entirely.
  onChunk?.('\n[Pass 2/2] Verifying connectivity and decision logic…\n\n')
  const verifyInput = `${VERIFY_PROMPT}

ORIGINAL DESCRIPTION:
The user is iteratively refining an existing process.  They previously
applied this instruction:

> ${refinementText.trim()}

Verify the refined model still represents a complete, connected, valid
BPMN process and correct any issues introduced.

CANDIDATE JSON:
${JSON.stringify(refined, null, 2)}

Return the corrected JSON now:`
  try {
    const raw2 = await generateCompletion(verifyInput, model, onChunk, signal)
    const json2 = extractJson(raw2)
    const verified = JSON.parse(json2) as ParsedProcess
    if (verified.tasks?.length && verified.flows?.length) {
      refined = verified
    }
  } catch (err) {
    console.warn('[NLP] Refine verification pass failed, keeping pass-1 result:', err)
  }

  // ── Pass 3: deterministic auto-fix (parity with parseProcessText) ──────
  // `autoFixModel` requires an original-text context to decide things like
  // "should this parallel gateway be exclusive?".  For refine we don't have
  // a single source of truth — pass the concatenation of the refinement
  // request and the existing process description so common parallelism
  // triggers are still detected.
  const synthesizedText = `${refinementText}\n${currentModel.processDescription ?? ''}`
  const { model: fixed } = autoFixModel(synthesizedText, refined)
  return fixed
}

// ── Ollama parse path (two-pass for accuracy) ─────────────────────────────────
// User explicitly requested accuracy over speed: we run a second verification
// pass that re-reads the original text and corrects the first-pass JSON.

export async function parseWithOllama(
  text: string,
  model: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ParsedProcess> {
  // ── First pass: initial extraction ────────────────────────────────────────
  onChunk?.('\n[Pass 1/2] Extracting process model...\n\n')
  const raw1 = await generateCompletion(buildPrompt(text), model, onChunk, signal)
  const json1 = extractJson(raw1)
  let parsed: ParsedProcess
  try {
    parsed = JSON.parse(json1) as ParsedProcess
  } catch (err) {
    throw new Error(`First-pass JSON parse failed: ${(err as Error).message}`)
  }

  // ── Second pass: verification & correction ────────────────────────────────
  onChunk?.('\n\n[Pass 2/2] Verifying decision logic and connectivity...\n\n')
  const verifyInput = `${VERIFY_PROMPT}

ORIGINAL DESCRIPTION:
${text}

CANDIDATE JSON:
${JSON.stringify(parsed, null, 2)}

Return the corrected JSON now:`
  try {
    const raw2 = await generateCompletion(verifyInput, model, onChunk, signal)
    const json2 = extractJson(raw2)
    const verified = JSON.parse(json2) as ParsedProcess
    // Sanity check: only accept verified output if it has tasks and flows
    if (verified.tasks?.length && verified.flows?.length) {
      return verified
    }
  } catch (err) {
    // If verification fails for any reason, fall back to first-pass result
    console.warn('[NLP] Verification pass failed, using first-pass result:', err)
  }
  return parsed
}

// ── Rule-based fallback parser ─────────────────────────────────────────────────
// Handles common single-gateway linear processes without requiring Ollama.

const ROLE_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bemployee[s]?\b/gi,              canonical: 'Employee' },
  { pattern: /\bmanager[s]?\b/gi,               canonical: 'Manager' },
  { pattern: /\bfinance\s*(?:team|dept|department)?\b/gi, canonical: 'Finance' },
  { pattern: /\baccounting\b/gi,                canonical: 'Accounting' },
  { pattern: /\bhr\b|\bhuman\s+resources?\b/gi, canonical: 'HR' },
  { pattern: /\bit\s*(?:team|dept)?\b/gi,       canonical: 'IT' },
  { pattern: /\bcustomer[s]?\b/gi,              canonical: 'Customer' },
  { pattern: /\bclient[s]?\b/gi,                canonical: 'Client' },
  { pattern: /\bvendor[s]?\b/gi,                canonical: 'Vendor' },
  { pattern: /\bsupplier[s]?\b/gi,              canonical: 'Supplier' },
  { pattern: /\bapprover[s]?\b/gi,              canonical: 'Approver' },
  { pattern: /\breviewer[s]?\b/gi,              canonical: 'Reviewer' },
  { pattern: /\badmin(?:istrator)?s?\b/gi,      canonical: 'Admin' },
  { pattern: /\bsupervisor[s]?\b/gi,            canonical: 'Supervisor' },
  { pattern: /\bsystem\b/gi,                    canonical: 'System' },
]

// Common task verbs that signal an action sentence
const ACTION_VERBS = [
  'fill', 'fills', 'complete', 'completes', 'submit', 'submits', 'send', 'sends',
  'review', 'reviews', 'approve', 'approves', 'reject', 'rejects', 'check', 'checks',
  'verify', 'verifies', 'process', 'processes', 'notify', 'notifies', 'receive', 'receives',
  'create', 'creates', 'update', 'updates', 'sign', 'signs', 'forward', 'forwards',
  'attach', 'attaches', 'upload', 'uploads', 'download', 'downloads', 'confirm', 'confirms',
  'deposit', 'deposits', 'pay', 'pays', 'issue', 'issues', 'generate', 'generates',
  'prepare', 'prepares', 'assign', 'assigns', 'schedule', 'schedules', 'log', 'logs',
  'enter', 'enters', 'record', 'records', 'route', 'routes', 'escalate', 'escalates',
  'get', 'gets', 'provide', 'provides', 'contact', 'contacts', 'approve', 'accept',
]

// Words that indicate a conditional branch
const CONDITION_WORDS = /\bif\b|\bwhen\b|\bshould\b|\bdepending\b|\bin case\b|\botherwise\b|\belse\b|\bbut if\b/i

function detectRolesInText(text: string): string[] {
  const found = new Map<string, string>() // canonical → first encountered
  for (const { pattern, canonical } of ROLE_PATTERNS) {
    if (pattern.test(text)) found.set(canonical, canonical)
    pattern.lastIndex = 0
  }
  return Array.from(found.keys())
}

function roleInSentence(sentence: string): string | null {
  for (const { pattern, canonical } of ROLE_PATTERNS) {
    if (pattern.test(sentence)) { pattern.lastIndex = 0; return canonical }
    pattern.lastIndex = 0
  }
  return null
}

function hasActionVerb(sentence: string): boolean {
  const lower = sentence.toLowerCase()
  return ACTION_VERBS.some(v => new RegExp(`\\b${v}\\b`).test(lower))
}

function extractTaskName(sentence: string): string {
  // Remove role nouns and common filler words, keep the core action
  let s = sentence.trim()
  // Remove leading role mention
  for (const { pattern } of ROLE_PATTERNS) {
    s = s.replace(pattern, '').trim()
    pattern.lastIndex = 0
  }
  // Remove common connectors at start
  s = s.replace(/^(then|and then|after that|once done|finally|at last|,)\s*/i, '').trim()
  // Remove trailing clauses ("so they can X", "to ensure Y")
  s = s.replace(/\s+(so that|so they|to ensure|in order to|to allow|letting|which).*$/i, '').trim()
  // Capitalize first letter
  if (s.length === 0) return sentence.trim().slice(0, 50)
  return s.charAt(0).toUpperCase() + s.slice(1, 60)
}

function extractGatewayName(sentence: string): string {
  // Look for "If X" → "X?" as the gateway label
  const match = sentence.match(/\bif\s+(?:the\s+)?(.+?)(?:,|\bis rejected\b|\bis approved\b|then)/i)
  if (match) {
    const name = match[1].trim()
    return name.charAt(0).toUpperCase() + name.slice(1) + '?'
  }
  return 'Decision?'
}

export function parseWithRules(text: string): ParsedProcess {
  const roles = detectRolesInText(text)
  const participants: ParsedParticipant[] = roles.length
    ? roles.map(r => ({ name: r }))
    : [{ name: 'Participant' }]

  const firstRole = participants[0].name

  // Split text into sentences
  const rawSentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .flatMap(s => s.split(/\.\s+(?=[A-Z])/))
    .map(s => s.replace(/[.!?]+$/, '').trim())
    .filter(s => s.length > 5)

  // Separate conditional sentences from task sentences
  const taskSentences: string[]   = []
  const conditionSentences: string[] = []

  for (const s of rawSentences) {
    if (CONDITION_WORDS.test(s)) conditionSentences.push(s)
    else if (hasActionVerb(s))   taskSentences.push(s)
  }

  // Build tasks
  const tasks: ParsedTask[] = []
  const seen = new Set<string>()

  for (const s of taskSentences) {
    const role = roleInSentence(s) ?? firstRole
    const name = extractTaskName(s)
    const key  = name.toLowerCase().slice(0, 20)
    if (!seen.has(key) && name.length > 2) {
      seen.add(key)
      tasks.push({ name, participantName: role, type: 'userTask' })
    }
  }

  if (tasks.length === 0) {
    // Absolute fallback: treat every sentence as a task
    rawSentences.slice(1, -1).forEach(s => {
      const name = s.trim().slice(0, 60)
      tasks.push({ name, participantName: firstRole, type: 'userTask' })
    })
  }

  // Build gateways from condition sentences
  const gateways: ParsedGateway[] = []
  for (const s of conditionSentences) {
    const name = extractGatewayName(s)
    if (!gateways.find(g => g.name === name)) {
      gateways.push({ name, type: 'exclusiveGateway' })
    }
  }

  // Extract start / end from first and last sentence
  const firstSentence = rawSentences[0] ?? ''
  const lastSentence  = rawSentences[rawSentences.length - 1] ?? ''

  const startMatch = firstSentence.match(
    /(?:when|once|after|start(?:s|ing)?\s+(?:by|with)|begin(?:s|ning)?\s+(?:by|with)|starts?\s+when)\s+(.+)/i
  )
  const startName = startMatch
    ? startMatch[1].trim().slice(0, 60)
    : firstSentence.slice(0, 50) || 'Process Started'

  const endName = lastSentence.slice(0, 50) || 'Process Complete'

  const startEvent = { name: startName, type: 'none' }
  const endEvents: ParsedEndEvent[] = [{ name: endName }]

  // Build sequential flows (simple linear + gateway branching)
  const flows: ParsedFlow[] = []
  const allElements: string[] = [
    startEvent.name,
    ...tasks.map(t => t.name),
    ...gateways.map(g => g.name),
    ...endEvents.map(e => e.name),
  ]

  if (gateways.length === 0) {
    // Pure sequential
    for (let i = 0; i < allElements.length - 1; i++) {
      flows.push({ from: allElements[i], to: allElements[i + 1], label: '' })
    }
  } else {
    // Linear until gateway, then split and rejoin
    const gw = gateways[0]
    const gwIdx = Math.ceil(tasks.length / 2)

    // Before gateway: start → tasks[0..gwIdx-1] → gateway
    const beforeTasks = tasks.slice(0, gwIdx)
    const afterTasks  = tasks.slice(gwIdx)
    const midTasks    = afterTasks.slice(0, Math.floor(afterTasks.length / 2))
    const rejectTasks = afterTasks.slice(Math.floor(afterTasks.length / 2))

    // Start → before tasks
    flows.push({ from: startEvent.name, to: beforeTasks[0]?.name ?? gw.name })
    for (let i = 0; i < beforeTasks.length - 1; i++) {
      flows.push({ from: beforeTasks[i].name, to: beforeTasks[i + 1].name })
    }
    if (beforeTasks.length) {
      flows.push({ from: beforeTasks[beforeTasks.length - 1].name, to: gw.name })
    }

    // Gateway → approve path → end
    if (midTasks.length) {
      flows.push({ from: gw.name, to: midTasks[0].name, label: 'Yes' })
      for (let i = 0; i < midTasks.length - 1; i++) {
        flows.push({ from: midTasks[i].name, to: midTasks[i + 1].name })
      }
      flows.push({ from: midTasks[midTasks.length - 1].name, to: endEvents[0].name })
    } else {
      flows.push({ from: gw.name, to: endEvents[0].name, label: 'Yes' })
    }

    // Gateway → reject path → back to first task (loop) or second end event
    if (rejectTasks.length) {
      flows.push({ from: gw.name, to: rejectTasks[0].name, label: 'No' })
      for (let i = 0; i < rejectTasks.length - 1; i++) {
        flows.push({ from: rejectTasks[i].name, to: rejectTasks[i + 1].name })
      }
      // Loop back to first task after gateway
      flows.push({ from: rejectTasks[rejectTasks.length - 1].name, to: beforeTasks[0]?.name ?? gw.name })
    } else {
      flows.push({ from: gw.name, to: beforeTasks[0]?.name ?? startEvent.name, label: 'No' })
    }
  }

  // Derive process name from text (first few content words)
  const nameWords = text
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !/^(when|that|this|they|their|there|then|once|after|from|with|into|through|about|which|have|been|gets|will|should|needs|must)/i.test(w))
    .slice(0, 4)
  const processName = nameWords.join(' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .slice(0, 40) || 'New Process'

  return {
    processName,
    processDescription: text.split(/[.!?]/)[0]?.trim() ?? '',
    participants,
    startEvent,
    tasks,
    gateways,
    flows,
    endEvents,
  }
}

// ── Convert ParsedProcess → WizardState ───────────────────────────────────────

let _idCounter = 0
function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_idCounter}`
}

export function parsedToWizardState(parsed: ParsedProcess): Partial<WizardState> {
  // ── Participants ────────────────────────────────────────────────────────────
  const participants: Participant[] = parsed.participants.map((p, i) => ({
    id: uid('Lane'),
    name: p.name.trim(),
    color: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
  }))

  const participantByName = new Map<string, string>(
    participants.map(p => [p.name.toLowerCase(), p.id])
  )

  function resolveParticipant(name: string): string {
    if (!name) return participants[0]?.id ?? ''
    const key = name.trim().toLowerCase()
    // Exact match
    const exact = participantByName.get(key)
    if (exact) return exact
    // Partial/substring match
    for (const [k, id] of participantByName) {
      if (k.includes(key) || key.includes(k)) return id
    }
    // Word overlap match (e.g. "Finance Team" vs "Finance")
    const words = key.split(/\s+/)
    for (const [k, id] of participantByName) {
      if (words.some(w => w.length > 2 && k.includes(w))) return id
    }
    return participants[0]?.id ?? ''
  }

  // ── Start event ─────────────────────────────────────────────────────────────
  const startEvent: StartEvent = {
    id: uid('StartEvent'),
    name: parsed.startEvent.name?.trim() || 'Start',
    type: (parsed.startEvent.type as StartEventType) || 'none',
    timerDefinition: '',
    messageRef: '',
    conditionExpression: '',
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────
  const tasks: Task[] = parsed.tasks.map(t => ({
    id: uid('Task'),
    name: t.name.trim(),
    type: (t.type as TaskType) || 'userTask',
    participantId: resolveParticipant(t.participantName),
    description: '',
  }))

  // ── Gateways ────────────────────────────────────────────────────────────────
  const gateways: Gateway[] = parsed.gateways.map(g => ({
    id: uid('Gateway'),
    name: g.name.trim(),
    type: (g.type as GatewayType) || 'exclusiveGateway',
  }))

  // ── End events ──────────────────────────────────────────────────────────────
  const endEvents: EndEvent[] = parsed.endEvents.map(e => ({
    id: uid('EndEvent'),
    name: e.name.trim(),
    type: 'none' as EndEventType,
  }))

  // ── Name → ID lookup for flow resolution ───────────────────────────────────
  // Build multiple lookup keys per element for robust fuzzy matching
  const nameToId = new Map<string, string>()
  const addToMap = (name: string, id: string) => {
    const key = name.trim().toLowerCase()
    nameToId.set(key, id)
    // Also add without punctuation
    nameToId.set(key.replace(/[^a-z0-9\s]/g, '').trim(), id)
  }

  addToMap(startEvent.name, startEvent.id)
  tasks.forEach(t    => addToMap(t.name, t.id))
  gateways.forEach(g => addToMap(g.name, g.id))
  endEvents.forEach(e => addToMap(e.name, e.id))

  // Word-overlap score for fuzzy matching
  function overlapScore(a: string, b: string): number {
    const wa = new Set(a.split(/\s+/).filter(w => w.length > 2))
    const wb = new Set(b.split(/\s+/).filter(w => w.length > 2))
    let hits = 0
    for (const w of wa) if (wb.has(w)) hits++
    return hits / Math.max(wa.size, wb.size, 1)
  }

  function resolveId(name: string): string | null {
    if (!name) return null
    const key = name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    // Exact
    const exact = nameToId.get(key) ?? nameToId.get(name.trim().toLowerCase())
    if (exact) return exact
    // Substring
    for (const [k, id] of nameToId) {
      if (k && key && (k.includes(key) || key.includes(k))) return id
    }
    // Word overlap — pick best score above threshold
    let bestId = null
    let bestScore = 0.4 // minimum threshold
    for (const [k, id] of nameToId) {
      const score = overlapScore(key, k)
      if (score > bestScore) { bestScore = score; bestId = id }
    }
    return bestId
  }

  // ── Flows ───────────────────────────────────────────────────────────────────
  const resolvedFlows: FlowConnection[] = parsed.flows
    .map(f => {
      const sourceId = resolveId(f.from)
      const targetId = resolveId(f.to)
      if (!sourceId || !targetId || sourceId === targetId) return null
      return { id: uid('Flow'), sourceId, targetId, label: f.label ?? '' }
    })
    .filter((f): f is FlowConnection => f !== null)
    // Deduplicate
    .filter((f, i, arr) =>
      arr.findIndex(x => x.sourceId === f.sourceId && x.targetId === f.targetId) === i
    )

  // Log resolved vs attempted flows for debugging
  const resolved = resolvedFlows.length
  const total    = parsed.flows.length
  if (total > 0 && resolved < total * 0.5) {
    console.warn(`[NLP] Only ${resolved}/${total} flows resolved.`)
    console.log('[NLP] Elements:', [...nameToId.keys()])
  }

  // ── Post-processing: repair connectivity ────────────────────────────────────
  const { flows: repairedFlows, gateways: repairedGateways } = repairFlows(
    startEvent, tasks, gateways, endEvents, resolvedFlows
  )

  // ── Post-processing: drop empty lanes ──────────────────────────────────────
  // Any participant with no tasks assigned is removed so the diagram doesn't
  // render an empty swimlane.  Tasks already use participant IDs so no
  // re-pointing is needed.
  const usedParticipantIds = new Set(tasks.map(t => t.participantId))
  const cleanParticipants = participants.filter(p => usedParticipantIds.has(p.id))
  const removed = participants.length - cleanParticipants.length
  if (removed > 0) {
    console.warn(`[NLP] Removed ${removed} empty lane(s):`,
      participants.filter(p => !usedParticipantIds.has(p.id)).map(p => p.name))
  }

  return {
    processName: parsed.processName || 'New Process',
    processDescription: parsed.processDescription || '',
    processVersion: '1.0',
    processOwner: '',
    participants: cleanParticipants,
    startEvent,
    tasks,
    gateways: repairedGateways,
    flows: repairedFlows,
    endEvents,
    currentStep: 0,
    hasGeneratedDiagram: false,
  }
}

// ── Flow repair: fix BPMN violations and reconnect orphan elements ─────────────
//
// Repairs (in order):
//   1. Self-loops removed
//   2. Loops targeting the start event redirected to first task
//   3. Tasks with no incoming flow get bridged from the previous task
//   4. Start event guaranteed to have an outgoing flow
//   5. Orphan gateways (no incoming OR no outgoing) inserted into the flow
//   6. End events guaranteed to have an incoming flow
//   7. Tasks / end events with 2+ incoming flows get a closing gateway inserted
//      so converging branches merge through a join (BPMN spec §10.5).
function repairFlows(
  startEvent: StartEvent,
  tasks: Task[],
  gateways: Gateway[],
  endEvents: EndEvent[],
  flows: FlowConnection[],
): { flows: FlowConnection[]; gateways: Gateway[] } {
  const makeFlow = (sourceId: string, targetId: string, label = ''): FlowConnection =>
    ({ id: uid('Flow'), sourceId, targetId, label })

  let clean = [...flows]
  let workingGateways = [...gateways]

  // ── Rule 1: redirect loops back to start event ────────────────────────────
  const firstTask = tasks[0]
  if (firstTask) {
    for (const f of clean) {
      if (f.targetId === startEvent.id) f.targetId = firstTask.id
    }
  }

  // ── Rule 2: drop self-loops ───────────────────────────────────────────────
  clean = clean.filter(f => f.sourceId !== f.targetId)

  const hasIncoming = () => new Set(clean.map(f => f.targetId))
  const hasOutgoing = () => new Set(clean.map(f => f.sourceId))

  // ── Rule 3: bridge tasks missing incoming flow ────────────────────────────
  for (let i = 1; i < tasks.length; i++) {
    const incoming = hasIncoming()
    const cur  = tasks[i]
    const prev = tasks[i - 1]
    if (!incoming.has(cur.id)) {
      const alreadyConnected = clean.some(
        f => f.sourceId === prev.id && f.targetId === cur.id
      )
      if (!alreadyConnected) clean.push(makeFlow(prev.id, cur.id))
    }
  }

  // ── Rule 4: start event must have outgoing flow ───────────────────────────
  if (!hasOutgoing().has(startEvent.id) && tasks.length > 0) {
    clean.push(makeFlow(startEvent.id, tasks[0].id))
  }

  // ── Rule 5: insert orphan gateways into the flow ──────────────────────────
  // For each gateway with no incoming flow AND no outgoing flow, splice it
  // between the last task and the next element (best heuristic).  For one-sided
  // orphans, attach the missing side to the nearest task.
  for (const g of gateways) {
    const incoming = hasIncoming()
    const outgoing = hasOutgoing()
    const hasIn  = incoming.has(g.id)
    const hasOut = outgoing.has(g.id)

    if (!hasIn && !hasOut) {
      // Fully detached — insert between the two middle tasks if possible
      if (tasks.length >= 2) {
        const mid = Math.floor(tasks.length / 2)
        const before = tasks[mid - 1]
        const after  = tasks[mid]
        clean.push(makeFlow(before.id, g.id))
        clean.push(makeFlow(g.id, after.id))
      } else if (tasks.length === 1) {
        clean.push(makeFlow(tasks[0].id, g.id))
      }
    } else if (!hasIn) {
      // Has outgoing but no incoming — connect from the last task that doesn't
      // already feed something else
      const candidate = [...tasks].reverse().find(t => {
        const tOut = clean.filter(f => f.sourceId === t.id)
        return tOut.length === 0
      }) ?? tasks[tasks.length - 1]
      if (candidate) clean.push(makeFlow(candidate.id, g.id))
    } else if (!hasOut) {
      // Has incoming but no outgoing — connect to the first endEvent (or last task)
      const target = endEvents[0]?.id ?? tasks[tasks.length - 1]?.id
      if (target && target !== g.id) clean.push(makeFlow(g.id, target))
    }
  }

  // ── Rule 6: every end event needs incoming flow ───────────────────────────
  for (const e of endEvents) {
    const incoming = hasIncoming()
    if (!incoming.has(e.id)) {
      const outgoing = hasOutgoing()
      // Find a leaf task (one with no outgoing flow yet)
      const leaf = [...tasks].reverse().find(t => !outgoing.has(t.id))
                ?? tasks[tasks.length - 1]
      if (leaf) clean.push(makeFlow(leaf.id, e.id))
    }
  }

  // ── Rule 7: insert closing gateway before any task / end event with ≥2 ────
  // incoming flows.  BPMN best practice (and the Camunda reference) calls
  // for every diverging gateway to be matched by a converging gateway of the
  // same type before flows can merge into a single activity.  Without this,
  // an AND-split followed by a direct merge into a task will fire that task
  // once per branch instead of waiting for both tokens.
  const convergence = insertClosingGatewaysBeforeConvergence(
    tasks, workingGateways, endEvents, clean,
  )
  clean = convergence.flows
  workingGateways = convergence.gateways

  // Final deduplication
  const dedupedFlows = clean.filter((f, i, arr) =>
    arr.findIndex(x => x.sourceId === f.sourceId && x.targetId === f.targetId) === i
  )
  return { flows: dedupedFlows, gateways: workingGateways }
}


// ── Top-level entry point ──────────────────────────────────────────────────────

export interface ParseProcessResult {
  state: Partial<WizardState>
  usedOllama: boolean
  audit?: AuditReport     // Quality audit comparing final model to original text
  parsed?: ParsedProcess  // Final ParsedProcess (post-verify, post-repair) — useful for debugging
}

export async function parseProcessText(
  text: string,
  model?: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ParseProcessResult> {
  let parsed: ParsedProcess
  let usedOllama: boolean

  if (model) {
    // Primary: Ollama (extract → verify)
    parsed = await parseWithOllama(text, model, onChunk, signal)
    usedOllama = true
  } else {
    // Fallback: rule-based
    parsed = parseWithRules(text)
    usedOllama = false
  }

  // ── Auto-fix pass — deterministic, conservative corrections ───────────────
  // Catches the recurring AI mistakes that no amount of prompt tightening
  // seems to fix (e.g. parallelGateway on conditional flows) and trivial BPMN
  // violations (e.g. outgoing flows on end events).  See autoFixService.
  // These corrections are silent — they aren't surfaced anywhere in the UI.
  const { model: fixedParsed } = autoFixModel(text, parsed)
  parsed = fixedParsed

  // NOTE: The audit pass (runFullAudit) is intentionally NOT invoked here.
  //
  // Earlier iterations surfaced an audit panel listing potential issues with
  // the AI's translation of the description (bundled tasks, object-as-actor
  // participants, missing tasks, vague names).  In practice every finding
  // turned out to be an AI translation imperfection rather than something
  // the user genuinely needed to act on — and the user's clear preference
  // is to evaluate the diagram visually and use Refine to clean up anything
  // imperfect, rather than read a list of complaints.
  //
  // If a user's input is so incomplete that no diagram can be built, that
  // shows up naturally as a parse failure (handled by the caller).  No
  // audit pass is needed for the success path.
  //
  // The audit infrastructure (auditService, auditChecks, auditFormatters,
  // AuditPanel) is kept in the codebase so it can be re-enabled with a
  // single line if the policy ever changes.

  return {
    state: parsedToWizardState(parsed),
    usedOllama,
    audit: undefined,
    parsed,
  }
}
