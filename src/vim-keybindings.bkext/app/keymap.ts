/**
 * The vim keymap, as data.
 *
 * `main.ts` installs these tables as Bike keybindings, and
 * `scripts/generate-manual-test.ts` reads the same tables so that every
 * binding gets a row in `manual-test.bike`. Keep this file free of runtime
 * imports: Node loads it directly (type stripping) for the generator.
 */

export type BindingGroup =
  | 'motions'
  | 'counts'
  | 'folding'
  | 'operators'
  | 'registers'
  | 'insert'
  | 'visual'
  | 'modes'
  | 'bike'

export interface Binding {
  /** Bike key sequence, e.g. `'d d'`. Keys are case-insensitive. */
  keys: string
  /** Command the sequence triggers. */
  command: string
  /** The vim spelling used in docs, e.g. `dd`. */
  vim: string
  group: BindingGroup
  /** What the user should see happen. */
  description: string
}

export const GROUP_TITLES: Record<BindingGroup, string> = {
  motions: 'Motions',
  counts: 'Counts',
  folding: 'Folding and hoisting',
  operators: 'Operators',
  registers: 'Register (yank / paste)',
  insert: 'Insert mode',
  visual: 'Visual mode',
  modes: 'Mode transitions',
  bike: 'Bike commands on vim keys',
}

function countBindings(): Binding[] {
  const bindings: Binding[] = []
  for (let digit = 0; digit <= 9; digit++) {
    bindings.push({
      keys: String(digit),
      command: `vim:.count-${digit}`,
      vim: String(digit),
      group: 'counts',
      description:
        digit === 0
          ? 'Appends 0 to a pending count; does nothing on its own'
          : `Starts or extends a count for the next motion or operator`,
    })
  }
  return bindings
}

/** Keybindings active in normal mode (Bike block mode). */
export const NORMAL_BINDINGS: Binding[] = [
  // Motions
  { keys: 'j', command: 'vim:move-down', vim: 'j', group: 'motions', description: 'Select the next visible row' },
  { keys: 'k', command: 'vim:move-up', vim: 'k', group: 'motions', description: 'Select the previous visible row' },
  { keys: 'h', command: 'vim:move-left', vim: 'h', group: 'motions', description: 'Collapse the row; if it is already collapsed or has no children, select its parent' },
  { keys: 'l', command: 'vim:move-right', vim: 'l', group: 'motions', description: 'Expand the row; if it is already expanded, select its first child' },
  { keys: 'g g', command: 'vim:goto-first', vim: 'gg', group: 'motions', description: 'Select the first visible row (with a count: row N)' },
  { keys: 'shift-g', command: 'vim:goto-last', vim: 'G', group: 'motions', description: 'Select the last visible row (with a count: row N)' },
  { keys: 'shift-j', command: 'vim:extend-down', vim: 'J', group: 'motions', description: 'Extend the selection down one row' },
  { keys: 'shift-k', command: 'vim:extend-up', vim: 'K', group: 'motions', description: 'Extend the selection up one row' },

  // Folding and hoisting
  { keys: 'z o', command: 'vim:fold-open', vim: 'zo', group: 'folding', description: 'Expand the selected rows' },
  { keys: 'z c', command: 'vim:fold-close', vim: 'zc', group: 'folding', description: 'Collapse the selected rows' },
  { keys: 'z a', command: 'vim:fold-toggle', vim: 'za', group: 'folding', description: 'Toggle the selected row between expanded and collapsed' },
  { keys: 'z shift-r', command: 'fold:expand-all', vim: 'zR', group: 'folding', description: 'Expand every row (Bike command)' },
  { keys: 'z shift-m', command: 'fold:collapse-all', vim: 'zM', group: 'folding', description: 'Collapse every row (Bike command)' },
  { keys: 'shift-l', command: 'vim:focus-in', vim: 'L', group: 'folding', description: 'Focus in (hoist) on the selected row' },
  { keys: 'shift-h', command: 'vim:focus-out', vim: 'H', group: 'folding', description: 'Focus out one level' },

  // Operators
  { keys: 'y y', command: 'vim:yank', vim: 'yy', group: 'operators', description: 'Yank the selected rows, children included, into the register' },
  { keys: 'y j', command: 'vim:.yank-down', vim: 'yj', group: 'operators', description: 'Yank this row and the next visible one' },
  { keys: 'y k', command: 'vim:.yank-up', vim: 'yk', group: 'operators', description: 'Yank this row and the previous visible one' },
  { keys: 'y g g', command: 'vim:.yank-to-first', vim: 'ygg', group: 'operators', description: 'Yank from the first visible row through this one' },
  { keys: 'y shift-g', command: 'vim:.yank-to-last', vim: 'yG', group: 'operators', description: 'Yank from this row through the last visible one' },
  { keys: 'd d', command: 'vim:delete', vim: 'dd', group: 'operators', description: 'Delete the selected rows (children included) into the register' },
  { keys: 'd j', command: 'vim:.delete-down', vim: 'dj', group: 'operators', description: 'Delete this row and the next visible one' },
  { keys: 'd k', command: 'vim:.delete-up', vim: 'dk', group: 'operators', description: 'Delete this row and the previous visible one' },
  { keys: 'd g g', command: 'vim:.delete-to-first', vim: 'dgg', group: 'operators', description: 'Delete from the first visible row through this one' },
  { keys: 'd shift-g', command: 'vim:.delete-to-last', vim: 'dG', group: 'operators', description: 'Delete from this row through the last visible one' },
  { keys: 'c c', command: 'vim:change', vim: 'cc', group: 'operators', description: 'Clear the row text (children stay) and enter insert mode; the old text goes to the register' },

  // Register
  { keys: 'p', command: 'vim:paste-below', vim: 'p', group: 'registers', description: 'Paste the register after the selected row (below its children)' },
  { keys: 'shift-p', command: 'vim:paste-above', vim: 'P', group: 'registers', description: 'Paste the register before the selected row' },

  // Insert mode
  { keys: 'i', command: 'vim:insert', vim: 'i', group: 'insert', description: 'Enter insert mode with the caret at the start of the row' },
  { keys: 'shift-i', command: 'vim:insert', vim: 'I', group: 'insert', description: 'Same as i' },
  { keys: 'a', command: 'vim:append', vim: 'a', group: 'insert', description: 'Enter insert mode with the caret at the end of the row' },
  { keys: 'shift-a', command: 'vim:append', vim: 'A', group: 'insert', description: 'Same as a' },
  { keys: 'o', command: 'vim:open-below', vim: 'o', group: 'insert', description: 'Open a new row below (first child when the row is expanded) and enter insert mode' },
  { keys: 'shift-o', command: 'vim:open-above', vim: 'O', group: 'insert', description: 'Open a new row above and enter insert mode' },

  // Modes
  { keys: 'v', command: 'vim:visual', vim: 'v', group: 'modes', description: 'Enter visual (row) mode' },
  { keys: 'shift-v', command: 'vim:visual', vim: 'V', group: 'modes', description: 'Enter visual (row) mode' },
  { keys: 'escape', command: 'vim:normal-mode', vim: 'Esc', group: 'modes', description: 'Stay in normal mode: clear any pending count and collapse a multi-row selection to its head row' },

  // Bike commands on vim keys
  { keys: 'u', command: 'edit:undo', vim: 'u', group: 'bike', description: 'Undo' },
  { keys: 'control-r', command: 'edit:redo', vim: 'Ctrl-r', group: 'bike', description: 'Redo' },
  { keys: '/', command: 'find:show', vim: '/', group: 'bike', description: 'Open Bike find' },
  { keys: 'n', command: 'find:next', vim: 'n', group: 'bike', description: 'Find next' },
  { keys: 'shift-n', command: 'find:previous', vim: 'N', group: 'bike', description: 'Find previous' },
  { keys: 'shift-> shift->', command: 'row:block-indent', vim: '>>', group: 'bike', description: 'Indent the selected rows' },
  { keys: 'shift-< shift-<', command: 'row:block-outdent', vim: '<<', group: 'bike', description: 'Outdent the selected rows' },

  ...countBindings(),
]

/** Keybindings active while visual mode is on. They replace NORMAL_BINDINGS. */
export const VISUAL_BINDINGS: Binding[] = [
  { keys: 'j', command: 'vim:move-down', vim: 'j', group: 'visual', description: 'Extend the selection down' },
  { keys: 'k', command: 'vim:move-up', vim: 'k', group: 'visual', description: 'Extend the selection up' },
  { keys: 'g g', command: 'vim:goto-first', vim: 'gg', group: 'visual', description: 'Extend the selection to the first visible row' },
  { keys: 'shift-g', command: 'vim:goto-last', vim: 'G', group: 'visual', description: 'Extend the selection to the last visible row' },
  { keys: 'shift-j', command: 'vim:extend-down', vim: 'J', group: 'visual', description: 'Extend the selection down' },
  { keys: 'shift-k', command: 'vim:extend-up', vim: 'K', group: 'visual', description: 'Extend the selection up' },
  { keys: 'y', command: 'vim:.visual-yank', vim: 'y', group: 'visual', description: 'Yank the selected rows and leave visual mode' },
  { keys: 'd', command: 'vim:.visual-delete', vim: 'd', group: 'visual', description: 'Delete the selected rows into the register and leave visual mode' },
  { keys: 'x', command: 'vim:.visual-delete', vim: 'x', group: 'visual', description: 'Same as d' },
  { keys: 'c', command: 'vim:.visual-change', vim: 'c', group: 'visual', description: 'Replace the selected rows with one empty row and enter insert mode' },
  { keys: 'p', command: 'vim:.visual-paste', vim: 'p', group: 'visual', description: 'Replace the selected rows with the register (the replaced rows go to the register)' },
  { keys: 'shift-p', command: 'vim:.visual-paste', vim: 'P', group: 'visual', description: 'Same as p' },
  { keys: 'shift->', command: 'row:block-indent', vim: '>', group: 'visual', description: 'Indent the selected rows' },
  { keys: 'shift-<', command: 'row:block-outdent', vim: '<', group: 'visual', description: 'Outdent the selected rows' },
  { keys: 'i', command: 'vim:insert', vim: 'i', group: 'visual', description: 'Leave visual mode and insert at the start of the head row' },
  { keys: 'a', command: 'vim:append', vim: 'a', group: 'visual', description: 'Leave visual mode and append at the end of the head row' },
  { keys: 'v', command: 'vim:visual', vim: 'v', group: 'visual', description: 'Leave visual mode' },
  { keys: 'shift-v', command: 'vim:visual', vim: 'V', group: 'visual', description: 'Leave visual mode' },
  { keys: 'escape', command: 'vim:normal-mode', vim: 'Esc', group: 'visual', description: 'Leave visual mode and collapse the selection to its head row' },
  { keys: 'u', command: 'edit:undo', vim: 'u', group: 'visual', description: 'Undo' },
  { keys: 'control-r', command: 'edit:redo', vim: 'Ctrl-r', group: 'visual', description: 'Redo' },
  ...countBindings(),
]

/** Palette-only commands (no default key). */
export const PALETTE_COMMANDS: { command: string; description: string }[] = [
  { command: 'vim:toggle-keybindings', description: 'Turn the vim keybindings off or on without disabling the extension' },
  { command: 'vim:toggle-mode-indicator', description: 'Show or hide the -- INSERT -- / -- VISUAL -- status bar message' },
]

export function toKeybindings(bindings: Binding[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const binding of bindings) record[binding.keys] = binding.command
  return record
}
