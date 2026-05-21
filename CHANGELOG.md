# Changelog

All notable changes to BPMN Studio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each release section is grouped by the audience-facing change category:
**Added · Changed · Fixed · Removed · Security**.  Internal-only changes
(refactors, tests, CI) go under **Internal** at the bottom of each section
and are kept terse.

## [Unreleased]

### Added
- Native, deterministic offline refiner that handles the four most common
  refinement patterns without invoking Ollama: rename, re-assign, dollar
  threshold tweak, and remove-with-stitch.  Surfaces in the Refine panel
  when Ollama is unavailable and short-circuits the LLM pipeline for those
  patterns even when Ollama is online (faster, more reliable).
- Round-trip support for **intermediate events** (timer/message/signal/
  conditional catches and message/signal throws).  Importer parses them
  from existing BPMN files, generator emits valid XML, layout positions
  them, validator enforces incoming/outgoing flow rules.  Wizard UI for
  manual authoring is still pending; intermediate events currently arrive
  from BPMN imports or future NLP work.
- `.bpmnstudio` project format with full save / open round-trip, schema
  versioning, and forward-compat handling.  Recent files menu lists the
  last opened projects and `.bpmn` files; works in both Electron and
  browser modes.
- "Open BPMN as project" entry in the toolbar — imports an existing `.bpmn`
  file directly into the wizard state for editing.
- Toast notification system replaces blocking `alert()` calls; failed
  BPMN imports now surface their parser warnings in a non-intrusive toast.
- Conditional sequence-flow expressions on decision gateways are emitted
  as `<conditionExpression>` children, and the default branch carries a
  matching `default="<flowId>"` attribute on the gateway.  Brings the
  generated XML in line with the BPMN 2.0 spec.
- Top-level `<message>`, `<signal>`, and `<error>` declarations are
  collected from start / end / intermediate events and emitted at the
  `<definitions>` scope so the XML passes strict BPMN schema validation.
- Project metadata is stamped into every `.bpmnstudio` file via a
  build-time `__APP_VERSION__` injected by Vite.

### Changed
- The refine pipeline now mirrors the parse pipeline: every LLM-driven
  refinement runs through a second verification pass and the deterministic
  `autoFixModel` pass before being applied, so users get the same quality
  treatment for follow-up tweaks as they did for the initial generation.
- TypeScript `strict` mode is now enabled across the renderer, Electron
  main/preload, and Node-side build tooling tsconfigs.  All strict-mode
  warnings have been resolved.
- The audit panel has been removed.  Auto-corrections that previously
  produced audit findings (gateway type flips, end-event flow removal,
  empty lane removal) now happen silently as part of the render pipeline,
  matching the long-standing user preference for fewer "errors that aren't
  errors".

### Fixed
- Application icon now uses a multi-resolution Windows `.ico`, macOS
  `.icns`, and a 1024×1024 PNG generated from a single SVG source; the
  blurry generic icon in 1.0 is gone.
- The manual's version banner is generated from `package.json` so it can
  never drift out of sync with the app version.

### Removed
- The audit reporting UI surface (panel, banner, summary).  Underlying
  audit service code remains in the repository for potential reuse but
  is no longer wired to any rendering path.

### Internal
- Added Vitest with 31 unit tests covering the generator, validator,
  project file service, and deterministic refiner.
- Added a `run-smoke.mjs` runner that executes every `scripts/*-smoke.mjs`
  file under `node --experimental-strip-types`.
- Added a GitHub Actions CI workflow (`.github/workflows/ci.yml`) that
  lints, typechecks, runs the Vitest suite, runs the smoke tests, and
  builds the renderer on every push and PR.
- Added a generator-side helper (`safeIdFragment`/`nameForRef`) for safe
  ref-id generation, used by every event-definition emitter.
- Split deterministic refinement out into `src/services/refineRules.ts`
  so it can be smoke-tested with Node's `--experimental-strip-types`
  without dragging in the full `nlpService` import graph.

## [1.1.0] — 2026-05-14

### Added
- First distributable build for Windows (NSIS installer + portable EXE),
  macOS (DMG for Intel and Apple Silicon).
- Visual cleanup pass that re-routes edges through shapes, off swimlane
  boundary lines, and away from each other before the diagram is rendered.
- Converging-gateway insertion pass that auto-inserts a matching closing
  gateway whenever two or more flows merge into a single task or end event.
- "Refine" panel for iterative natural-language tweaks of an existing
  diagram, with streaming output and explicit Ollama model selection.

### Changed
- Two-pass LLM verification on parse: every initial extraction is
  re-checked against the original natural-language description before
  being handed to the layout service.
- Custom swimlane layout service replaces `bpmn-auto-layout`, which does
  not support lanes.  Adds DFS-based back-edge detection, dynamic lane
  height, stack centering, isolated component offset, and orthogonal
  Z-route flow routing.

### Fixed
- Speech-to-text feature removed (was unreliable and required network
  access).
- PDF export reduced to a single page containing only the diagram, with
  auto-orientation and dynamic page sizing.

## [1.0.0] — 2026-05-06

Initial release: BPMN 2.0 wizard, manual diagram editor, optional Ollama
integration for natural-language to BPMN, BPMN XML / PDF / PNG export.
