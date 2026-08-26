import { CommandContext, OutlineEditor, Row, Selection } from 'bike/app'

/** The editor and block selection a command acts on. */
export interface Block {
  editor: OutlineEditor
  selection: Selection
  /** Where the selection started (fixed end). */
  anchor: Row
  /** The vim cursor: the moving end of the selection. */
  head: Row
}

/**
 * Resolve the command context into a block. Caret and text selections are
 * treated as a one-row block so palette invocations from insert mode work.
 */
export function blockOf(context: CommandContext): Block | undefined {
  const editor = context.editor
  if (!editor) return undefined
  const selection = context.selection ?? editor.selection
  if (!selection) return undefined
  if (selection.type === 'block') {
    return { editor, selection, anchor: selection.detail.anchorRow, head: selection.detail.headRow }
  }
  return { editor, selection, anchor: selection.row, head: selection.row }
}

/** Visible rows only: collapsed children and filtered-out rows are skipped. */
export function down(editor: OutlineEditor, row: Row, count = 1): Row {
  let current = row
  for (let i = 0; i < count; i++) {
    const next = editor.nextFocused(current)
    if (!next) break
    current = next
  }
  return current
}

export function up(editor: OutlineEditor, row: Row, count = 1): Row {
  let current = row
  for (let i = 0; i < count; i++) {
    const prev = editor.prevFocused(current)
    if (!prev) break
    current = prev
  }
  return current
}

export function firstVisible(editor: OutlineEditor, row: Row): Row {
  let current = row
  for (;;) {
    const prev = editor.prevFocused(current)
    if (!prev) return current
    current = prev
  }
}

export function lastVisible(editor: OutlineEditor, row: Row): Row {
  let current = row
  for (;;) {
    const next = editor.nextFocused(current)
    if (!next) return current
    current = next
  }
}

/** The n-th visible row (1-based), clamped to the last one. */
export function nthVisible(editor: OutlineEditor, row: Row, n: number): Row {
  return down(editor, firstVisible(editor, row), Math.max(n, 1) - 1)
}

/** The row's parent when it is a selectable row (not the outline root or the hoisted focus row). */
export function visibleParent(editor: OutlineEditor, row: Row): Row | undefined {
  const parent = row.parent
  if (!parent || parent.id === editor.focus.id || parent.id === editor.outline.root.id) return undefined
  return parent
}

/** The row's first child when it is currently visible. */
export function visibleFirstChild(editor: OutlineEditor, row: Row): Row | undefined {
  const next = editor.nextFocused(row)
  return next && next.parent?.id === row.id ? next : undefined
}

/**
 * Drop rows that have an ancestor in the set. Deleting or copying the cover
 * rows deletes or copies everything selected exactly once, children included.
 */
export function coverRows(rows: Row[]): Row[] {
  const ids = new Set(rows.map((row) => row.id))
  return rows.filter((row) => !row.ancestors.some((ancestor) => ids.has(ancestor.id)))
}

export interface RowRange {
  rows: Row[]
  cover: Row[]
  start: Row
  end: Row
}

export function rangeOf(selection: Selection): RowRange | undefined {
  if (selection.type === 'block') {
    const rows = selection.rows
    if (rows.length === 0) return undefined
    return { rows, cover: coverRows(rows), start: selection.detail.startRow, end: selection.detail.endRow }
  }
  const row = selection.row
  return { rows: [row], cover: [row], start: row, end: row }
}

/** The selected range after selecting `anchor…head`. */
export function selectRange(editor: OutlineEditor, anchor: Row, head: Row): RowRange | undefined {
  editor.selectRows(anchor, head)
  const selection = editor.selection
  return selection ? rangeOf(selection) : undefined
}
