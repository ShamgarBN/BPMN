/**
 * Project file (.bpmnstudio) serialization and parsing.
 *
 * A .bpmnstudio file is plain JSON containing the wizard state plus a small
 * envelope (schema id, version, app version, timestamp).  We persist *only*
 * the modelled process — transient UI state (current wizard step, editor /
 * wizard view, generation flag) is reset on load so reopening a project
 * always lands the user back in the wizard.
 *
 * Forward-compat strategy:
 *  - The file declares `schemaVersion`.  We bump it any time we make an
 *    *incompatible* change (renamed fields, removed types).
 *  - Loaders perform a defensive merge over `initialState` so an older file
 *    missing newer fields still loads cleanly.
 */

import type { WizardState } from '@/types/wizard'

export const PROJECT_SCHEMA_ID = 'bpmnstudio/project'
export const PROJECT_SCHEMA_VERSION = 1
export const PROJECT_FILE_EXTENSION = 'bpmnstudio'

/** Fields stripped before saving (rebuilt fresh on every load). */
const TRANSIENT_KEYS = ['currentStep', 'isEditorMode', 'hasGeneratedDiagram'] as const

export interface ProjectFile {
  schema:        typeof PROJECT_SCHEMA_ID
  schemaVersion: number
  appVersion:    string
  savedAt:       string             // ISO-8601 timestamp
  state:         PersistedState
}

/** Wizard state with transient UI flags removed. */
export type PersistedState = Omit<WizardState, typeof TRANSIENT_KEYS[number]>

/**
 * Strips transient UI fields and serialises the wizard state as a pretty-
 * printed JSON envelope suitable for writing to disk.
 */
export function serializeProject(state: WizardState, appVersion: string): string {
  const persisted: Partial<WizardState> = { ...state }
  for (const k of TRANSIENT_KEYS) delete persisted[k]

  const envelope: ProjectFile = {
    schema:        PROJECT_SCHEMA_ID,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion,
    savedAt:       new Date().toISOString(),
    state:         persisted as PersistedState,
  }
  return JSON.stringify(envelope, null, 2)
}

export class ProjectParseError extends Error {
  // `cause` is declared as a field rather than via a constructor parameter
  // property so this file stays compatible with Node's `--experimental-
  // strip-types` (used by the smoke scripts).
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name  = 'ProjectParseError'
    this.cause = cause
  }
}

/**
 * Parses a .bpmnstudio file.  Throws ProjectParseError with a human-readable
 * message when the file is unrecognised, corrupt, or from a future schema we
 * cannot read.
 */
export function parseProject(text: string): ProjectFile {
  // Defensive JSON.parse — never trust untrusted input
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new ProjectParseError('File is not valid JSON.', err)
  }

  if (!raw || typeof raw !== 'object') {
    throw new ProjectParseError('File does not contain a JSON object.')
  }

  const obj = raw as Record<string, unknown>
  if (obj.schema !== PROJECT_SCHEMA_ID) {
    throw new ProjectParseError(
      `File is not a BPMN Studio project (expected schema "${PROJECT_SCHEMA_ID}").`,
    )
  }

  const version = Number(obj.schemaVersion)
  if (!Number.isFinite(version) || version < 1) {
    throw new ProjectParseError('Project schema version is missing or invalid.')
  }
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new ProjectParseError(
      `Project was saved by a newer version of BPMN Studio (schema ${version}). ` +
      `Please upgrade the app to open it.`,
    )
  }

  const state = obj.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new ProjectParseError('Project file is missing the "state" object.')
  }

  return {
    schema:        PROJECT_SCHEMA_ID,
    schemaVersion: version,
    appVersion:    typeof obj.appVersion === 'string' ? obj.appVersion : 'unknown',
    savedAt:       typeof obj.savedAt    === 'string' ? obj.savedAt    : '',
    state:         state as PersistedState,
  }
}

/**
 * Convenience helper that turns a parsed project into a Partial<WizardState>
 * suitable for passing straight to `wizardStore.loadState`.
 */
export function projectToLoadable(file: ProjectFile): Partial<WizardState> {
  return file.state as Partial<WizardState>
}
