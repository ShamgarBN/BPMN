<div align="center">
  <img src="build/icons/icon-256.png" alt="BPMN Studio" width="128" height="128" />
  <h1>BPMN Studio</h1>
  <p>Build BPMN 2.0 process diagrams with guided forms or natural language — entirely on your machine.</p>
</div>

---

BPMN Studio is a desktop & web application for authoring BPMN 2.0 process
diagrams. It pairs a guided multi-step wizard with an optional natural-language
input pane that uses a local LLM (via [Ollama](https://ollama.com)) to translate
prose into a fully-laid-out BPMN diagram. **No data ever leaves your machine.**

## Highlights

- **Two ways in.** Use the step-by-step wizard for explicit control, or paste a
  process description and let the local AI build the diagram for you. Refine
  the result in plain English ("the VP handles the over-$25k approval", "rename
  Review report to Manager reviews report", etc.).
- **BPMN 2.0 compliant.** Tasks, sequence flows, gateways (XOR / AND / OR /
  event-based), start & end events of every common type, intermediate events
  (timer / message / signal / conditional), pools, and lanes.
- **Custom swimlane layout.** Drop-in `bpmn-auto-layout` doesn't handle lanes,
  so BPMN Studio ships its own DFS-based column assignment, dynamic lane
  heights, orthogonal Z-route flow routing, and an iterative visual cleanup
  pass that reroutes edges away from shapes and lane boundaries.
- **Round-trip imports.** Load any existing `.bpmn` file straight into the
  editor *or* import it into the wizard for further editing. Project state can
  be saved as a `.bpmnstudio` JSON file that round-trips losslessly.
- **Exports.** BPMN 2.0 XML, single-page PDF, PNG, SVG, JSON.
- **Local-only.** No login, no cloud, no telemetry. Optional AI assistance runs
  through your local Ollama daemon. Everything else is offline.
- **Desktop or browser.** Distributed as Electron installers for Windows
  (NSIS + portable), macOS (Intel + Apple Silicon DMGs), and Linux
  (AppImage / deb / rpm). Or run it as a vanilla web app in any modern browser.

## Screenshots

> The repo ships icons but not in-app screenshots — clone the project and run
> `npm run dev` to see the live UI, or drop screenshots into `docs/screenshots/`
> and update this section.

## Quick start

### Prerequisites

- Node.js 22+ (the build matrix targets 22) and npm 10+
- macOS / Windows / Linux

### Run the web app locally

```bash
git clone https://github.com/ShamgarBN/BPMN.git bpmn-studio
cd bpmn-studio
npm install
npm run dev
```

Open the URL Vite prints (defaults to <http://localhost:5173>).

### Run the desktop app in dev mode

```bash
npm run electron:dev
```

This launches Electron against the Vite dev server with full HMR. Edits to the
renderer reload in place; edits to `electron/main.ts` or `electron/preload.ts`
restart the Electron process.

### Build installers

```bash
npm run electron:dist:mac      # Intel + Apple Silicon DMGs
npm run electron:dist:win      # NSIS installer + portable .exe
npm run electron:dist:linux    # AppImage / deb / rpm
```

Output: `release/<version>/`. See [`PACKAGING.md`](./PACKAGING.md) for
code-signing, multi-arch, and distribution details.

## Optional: local AI assistance with Ollama

The natural-language and "Refine" panels are powered by a local LLM via Ollama.
The app works without it (you'll just rely on the wizard), but it's worth
installing for the prose-to-diagram workflow.

```bash
# 1. Install Ollama: https://ollama.com/download
# 2. Pull a model — Llama 3 or Qwen 2.5 work well for this task:
ollama pull llama3
# 3. Start the daemon (it auto-starts on install on most platforms):
ollama serve
```

BPMN Studio probes <http://localhost:11434> on launch. When it sees the
daemon, the AI panels light up; otherwise they show "Ollama offline" and the
panel falls back to a deterministic refiner that handles common patterns
(rename, re-assign, threshold tweak, remove) without an LLM.

## Tech stack

- **React 19** + **TypeScript** (strict mode, project references for
  renderer/Electron/Node)
- **Vite 8** for the renderer build, **Tailwind CSS 4** for styling,
  **Radix UI** primitives via `shadcn/ui`-style wrappers
- **bpmn-js** for in-canvas BPMN editing and rendering
- **Zustand** for wizard state, **react-hook-form** + **zod** for per-step
  validation
- **Electron 42** for the desktop shell, **electron-builder** for the
  Windows / macOS / Linux installers
- **jspdf** + **svg2pdf.js** for PDF export
- **Vitest 4** for unit tests, **`@xmldom/xmldom`** for XML parsing in test
  fixtures

## Project layout

```
src/
  components/        React UI (wizard steps, editor, panels, layout chrome)
  services/          Pure-TS business logic
    bpmnGenerator.ts       Wizard state → BPMN 2.0 XML
    bpmnImporter.ts        BPMN 2.0 XML → wizard state
    bpmnLayoutService.ts   Custom swimlane DI generator
    bpmnValidator.ts       Connectivity + semantic checks
    visualCleanupService.ts Iterative edge & label cleanup
    gatewayRepairService.ts Auto-inserts closing gateways
    autoFixService.ts      Silent conservative corrections
    nlpService.ts          Two-pass Ollama parse + verify
    refineRules.ts         Deterministic offline refiner
    projectFileService.ts  .bpmnstudio save/load
    recentFilesService.ts  Recent files menu backing
    fileService.ts         Browser / Electron file I/O abstraction
  stores/            Zustand stores
  types/             Shared TypeScript types
  docs/              In-app user manual content
electron/            Electron main + preload (trust boundary)
scripts/             Build helpers and *-smoke.mjs runners
build/               App icons (source SVG + generated .icns/.ico/.png)
```

## Testing

```bash
npm test           # Vitest run (31 unit tests across generator, validator,
                   #              projectFileService, refineRules)
npm run test:watch # Vitest watch mode
npm run test:smoke # Runs every scripts/*-smoke.mjs via node --experimental-strip-types
npm run lint       # ESLint
npx tsc -b --force # Full project-references typecheck
```

CI runs everything above plus the renderer build on every push and PR — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Documentation

- [`CHANGELOG.md`](./CHANGELOG.md) — release notes, Keep-a-Changelog format
- [`PACKAGING.md`](./PACKAGING.md) — building & signing installers
- [`docs/RELEASE_SETUP.md`](./docs/RELEASE_SETUP.md) — decisions needed before
  wiring code-signing + auto-update
- In-app user manual: open the *Help* panel from the toolbar, or read the
  Markdown source at [`src/docs/userManual.ts`](./src/docs/userManual.ts)

## Privacy & security

- BPMN Studio is fully local. The web app makes no outbound HTTP calls beyond
  the optional Ollama daemon at `localhost:11434`.
- The Electron shell enforces `contextIsolation: true`, `nodeIntegration:
  false`, file I/O exclusively through narrowly-scoped IPC handlers, and a
  50 MB maximum read size with content-type allow-listing.
- No login, no accounts, no telemetry, no analytics.

## License

This repository is currently private and unlicensed. If/when you decide on a
license, add it here and drop a matching `LICENSE` file at the repo root.

## Acknowledgements

- [Camunda](https://camunda.com) for `bpmn-js`, `bpmn-moddle`, and the BPMN 2.0
  reference docs
- [Ollama](https://ollama.com) for making local LLMs trivial to deploy
- The [Keep a Changelog](https://keepachangelog.com) and
  [Semantic Versioning](https://semver.org) projects for the conventions used
  throughout this repository
