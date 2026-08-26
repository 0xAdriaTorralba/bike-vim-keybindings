import { Outline, OutlineEditor, Row } from 'bike/app'
import { RowRange } from './motions'
import { getRegister, setRegister } from './state'

const ANIMATE = { animate: 'default' as const }

/**
 * Copy rows, subtrees included, into a fresh outline.
 *
 * `insertRows([row])` copies one row (text, type and attributes) but not its
 * children, and `new Outline(rows)` behaves the same, so the tree is rebuilt
 * level by level. Inserting the resulting outline back copies everything.
 */
export function copyRows(rows: Row[]): Outline {
  const outline = new Outline()
  const copyInto = (parent: Row, source: Row[]) => {
    for (const row of source) {
      const [copy] = outline.insertRows([row], parent)
      if (copy && row.firstChild) copyInto(copy, row.children)
    }
  }
  copyInto(outline.root, rows)
  return outline
}

/** Copy the rows (subtrees included) into the register. */
export function yank(cover: Row[]): void {
  if (cover.length === 0) return
  setRegister(copyRows(cover))
}

/** First visible row after `end` that is not inside any of the rows being removed. */
function nextOutside(editor: OutlineEditor, end: Row, removed: Set<number>): Row | undefined {
  let row = editor.nextFocused(end)
  while (row && row.ancestors.some((ancestor) => removed.has(ancestor.id))) {
    row = editor.nextFocused(row)
  }
  return row
}

/**
 * Remove the range's cover rows and select the row that takes their place:
 * the next visible row, else the previous one, else a fresh empty row.
 */
export function remove(editor: OutlineEditor, range: RowRange, label = 'Vim: Delete'): void {
  const removed = new Set(range.cover.map((row) => row.id))
  const next = nextOutside(editor, range.end, removed)
  const prev = editor.prevFocused(range.start)
  editor.transaction({ label, ...ANIMATE }, () => {
    editor.outline.removeRows(range.cover)
    const target = next ?? prev ?? editor.outline.insertRows([{ text: '' }], editor.focus)[0]
    editor.selectRows(target)
  })
}

/**
 * vim `cc`: keep the first cover row, remove the rest, clear the kept row's
 * text (its type, attributes and children stay) and put the caret in it.
 */
export function change(editor: OutlineEditor, range: RowRange): void {
  yank(range.cover)
  const [keep, ...rest] = range.cover
  if (!keep) return
  editor.transaction({ label: 'Vim: Change', ...ANIMATE }, () => {
    if (rest.length > 0) editor.outline.removeRows(rest)
    if (keep.text.count > 0) keep.text.replace([0, keep.text.count], '')
    editor.selectCaret(keep, 0)
  })
}

/** Paste the register `count` times before `row` or after it (below its subtree). */
export function paste(editor: OutlineEditor, row: Row, above: boolean, count: number): boolean {
  const register = getRegister()
  if (!register) {
    editor.showStatusMessage('Vim: register is empty', 2000)
    return true
  }
  const parent = row.parent ?? editor.outline.root
  const before = above ? row : row.nextSibling
  editor.transaction({ label: 'Vim: Paste', ...ANIMATE }, () => {
    let first: Row | undefined
    for (let i = 0; i < count; i++) {
      const inserted = editor.outline.insertRows(register, parent, before)
      if (!first && inserted.length > 0) first = inserted[0]
    }
    if (first) editor.selectRows(first)
  })
  return true
}

/** vim visual `p`: swap the selected rows for the register; the replaced rows become the register. */
export function replaceWithRegister(editor: OutlineEditor, range: RowRange): boolean {
  const register = getRegister()
  if (!register) {
    editor.showStatusMessage('Vim: register is empty', 2000)
    return true
  }
  const first = range.cover[0]
  if (!first) return true
  const parent = first.parent ?? editor.outline.root
  editor.transaction({ label: 'Vim: Paste', ...ANIMATE }, () => {
    const inserted = editor.outline.insertRows(register, parent, first)
    setRegister(copyRows(range.cover))
    editor.outline.removeRows(range.cover)
    if (inserted.length > 0) editor.selectRows(inserted[0])
  })
  return true
}

/** Enter insert mode at the start or the end of the row's text. */
export function insertCaret(editor: OutlineEditor, row: Row, atEnd: boolean): boolean {
  editor.selectCaret(row, atEnd ? row.text.count : 0)
  return true
}

/**
 * vim `o` / `O`. Below an expanded row with children the new row is its first
 * child, so it appears right under the cursor as it would in vim.
 */
export function openRow(editor: OutlineEditor, row: Row, below: boolean): boolean {
  let parent = row.parent ?? editor.outline.root
  let before: Row | undefined = row
  if (below) {
    if (row.firstChild && editor.isExpanded(row)) {
      parent = row
      before = row.firstChild
    } else {
      before = row.nextSibling
    }
  }
  editor.transaction({ label: below ? 'Vim: Open Below' : 'Vim: Open Above', ...ANIMATE }, () => {
    const inserted = editor.outline.insertRows([{ text: '' }], parent, before)
    if (inserted.length > 0) editor.selectCaret(inserted[0], 0)
  })
  return true
}
