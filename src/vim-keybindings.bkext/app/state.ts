import { Disposable, Outline, OutlineEditor, Selection } from 'bike/app'

export const DEBUG = false

export function log(...args: unknown[]): void {
  if (DEBUG) console.log('[Vim]', ...args)
}

// MARK: - Settings
//
// Persisted through `bike.defaults` (UserDefaults, prefixed by Bike with the
// extension id) but read from memory, so a toggle takes effect immediately
// whatever the store does with the value.

const settings = { enabled: true, modeIndicator: true }

export function loadSettings(): void {
  settings.enabled = bike.defaults.get('enabled') !== false
  settings.modeIndicator = bike.defaults.get('modeIndicator') !== false
}

export function keybindingsEnabled(): boolean {
  return settings.enabled
}

export function setKeybindingsEnabled(enabled: boolean): void {
  settings.enabled = enabled
  bike.defaults.set('enabled', enabled)
}

export function indicatorEnabled(): boolean {
  return settings.modeIndicator
}

export function setIndicatorEnabled(enabled: boolean): void {
  settings.modeIndicator = enabled
  bike.defaults.set('modeIndicator', enabled)
}

// MARK: - Pending count
//
// One keyboard, one count: the count is global rather than per editor, which
// also keeps it independent of the editor wrapper objects Bike hands out.

let pendingCount: number | undefined

/** Append a digit to the pending count. A leading `0` is not a count. */
export function pushCountDigit(digit: number): boolean {
  if (pendingCount === undefined && digit === 0) return false
  pendingCount = Math.min((pendingCount ?? 0) * 10 + digit, 9999)
  return true
}

/** Read and clear the pending count. */
export function takeCount(): number | undefined {
  const count = pendingCount
  pendingCount = undefined
  return count
}

export function clearCount(): void {
  pendingCount = undefined
}

// MARK: - Register
//
// The unnamed register is an Outline holding copies of the yanked rows, built
// with `copyRows` in operators.ts. `insertRows(outline, …)` copies it back
// out. Shared by every editor, so you can yank in one window and paste in
// another.

let register: Outline | undefined

export function getRegister(): Outline | undefined {
  return register
}

export function setRegister(outline: Outline | undefined): void {
  register = outline
}

// MARK: - Visual mode
//
// Visual mode is the only mode the extension tracks itself. Normal vs insert
// is derived from the editor selection (block vs caret/text) so it can never
// drift from what Bike is actually doing. While visual mode is on, a
// selection observer on that editor ends it as soon as the selection stops
// being a block selection (mouse click, Bike's own commands, …), and
// `syncVisual` double-checks on every vim command in case the observer is
// late.

type VisualState = { rootId: number; editor: OutlineEditor; observer?: Disposable }

let visual: VisualState | undefined
let visualListener: ((active: boolean) => void) | undefined

/** Called with `true` when visual mode starts and `false` when it ends. */
export function onVisualChange(listener: (active: boolean) => void): void {
  visualListener = listener
}

export function isVisualActive(): boolean {
  return visual !== undefined
}

export function isVisual(editor: OutlineEditor): boolean {
  return visual !== undefined && visual.rootId === editor.outline.root.id
}

export function enterVisual(editor: OutlineEditor): void {
  if (isVisual(editor)) return
  exitVisual()
  const state: VisualState = { rootId: editor.outline.root.id, editor }
  visual = state
  try {
    state.observer = editor.observeSelection((selection) => {
      if (visual === state && selection && selection.type !== 'block') exitVisual()
    }, 50)
  } catch (error) {
    log('visual observer failed', error)
  }
  log('visual on')
  visualListener?.(true)
  refreshIndicator(editor)
}

export function exitVisual(): void {
  if (!visual) return
  const { editor, observer } = visual
  visual = undefined
  observer?.dispose()
  log('visual off')
  visualListener?.(false)
  refreshIndicator(editor)
}

/** End visual mode if its editor is no longer showing a block selection. */
export function syncVisual(): void {
  if (!visual) return
  try {
    const selection = visual.editor.selection
    if (!selection || selection.type !== 'block') exitVisual()
  } catch (error) {
    log('visual sync failed', error)
    exitVisual()
  }
}

// MARK: - Mode + status bar indicator

export type Mode = 'normal' | 'insert' | 'visual'

export function modeOf(editor: OutlineEditor, selection: Selection | undefined = editor.selection): Mode {
  if (selection && selection.type !== 'block') return 'insert'
  return isVisual(editor) ? 'visual' : 'normal'
}

const indicators = new Map<number, { mode: Mode; handle: Disposable }>()

/** Show `-- INSERT --` / `-- VISUAL --` in the editor status bar; nothing in normal mode. */
export function refreshIndicator(editor: OutlineEditor, selection?: Selection): void {
  try {
    const mode = modeOf(editor, selection ?? editor.selection)
    const key = editor.outline.root.id
    const shown = indicators.get(key)
    if (shown?.mode === mode) return
    shown?.handle.dispose()
    indicators.delete(key)
    if (mode === 'normal' || !indicatorEnabled()) return
    const message = mode === 'insert' ? '-- INSERT --' : '-- VISUAL --'
    indicators.set(key, { mode, handle: editor.showStatusMessage(message) })
  } catch (error) {
    log('indicator failed', error)
  }
}

export function clearIndicators(): void {
  for (const { handle } of indicators.values()) handle.dispose()
  indicators.clear()
}
