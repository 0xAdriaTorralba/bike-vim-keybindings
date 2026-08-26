import { AppExtensionContext, CommandAction, CommandContext, Disposable, OutlineEditor, Row } from 'bike/app'
import { NORMAL_BINDINGS, VISUAL_BINDINGS, toKeybindings } from './keymap'
import {
  Block,
  blockOf,
  down,
  firstVisible,
  lastVisible,
  nthVisible,
  rangeOf,
  selectRange,
  up,
  visibleFirstChild,
  visibleParent,
} from './motions'
import { change, insertCaret, openRow, paste, remove, replaceWithRegister, yank } from './operators'
import {
  clearCount,
  clearIndicators,
  enterVisual,
  exitVisual,
  indicatorEnabled,
  isVisual,
  isVisualActive,
  keybindingsEnabled,
  loadSettings,
  log,
  onVisualChange,
  pushCountDigit,
  refreshIndicator,
  setIndicatorEnabled,
  setKeybindingsEnabled,
  syncVisual,
  takeCount,
} from './state'

const PRIORITY = 100

/** The registered command table, also reachable from tests through `context['vim'].perform`. */
let commandTable: Record<string, CommandAction> = {}

export async function activate(context: AppExtensionContext) {
  loadSettings()
  commandTable = commands()
  context['commands'] = bike.commands.addCommands({ commands: commandTable })
  // Test hook. Bike 2 (293) hits a fatal "JSContext not available" when a
  // command reached through `bike.commands.performCommand` from the test
  // context runs an editor/outline transaction or shows a status message, so
  // the tests call the handlers directly instead.
  context['vim'] = {
    perform: (name: string, commandContext: CommandContext) => commandTable[name]?.(commandContext),
  }

  onVisualChange((active) => installKeybindings(active))
  installKeybindings(false)
  observeEditors()

  log(`activated on Bike ${bike.version} (${bike.build}), api ${bike.apiVersion}`)
}

// MARK: - Keybindings
//
// Normal mode and visual mode are two different binding sets that swap in and
// out, so that `y` can be an operator prefix (`yy`, `yj`) in one and a single
// key in the other without ambiguous sequences.

let keybindings: Disposable | undefined

function installKeybindings(visualActive: boolean): void {
  keybindings?.dispose()
  keybindings = undefined
  if (!keybindingsEnabled()) return
  keybindings = bike.keybindings.addKeybindings({
    keymap: 'block-mode',
    priority: PRIORITY,
    keybindings: toKeybindings(visualActive ? VISUAL_BINDINGS : NORMAL_BINDINGS),
  })
}

// MARK: - Editors

function observeEditors(): void {
  let selectionObserver: Disposable | undefined
  bike.observeFrontmostOutlineEditor((editor) => {
    selectionObserver?.dispose()
    selectionObserver = undefined
    if (!editor) return
    // Visual mode is tied to one editor; switching editors ends it.
    if (isVisualActive() && !isVisual(editor)) exitVisual()
    selectionObserver = editor.observeSelection((selection) => refreshIndicator(editor, selection), 100)
    refreshIndicator(editor)
  })
}

// MARK: - Commands

type Motion = (editor: OutlineEditor, block: Block, count: number | undefined) => Row

const nextRow: Motion = (editor, block, count) => down(editor, block.head, count ?? 1)
const prevRow: Motion = (editor, block, count) => up(editor, block.head, count ?? 1)
const firstRow: Motion = (editor, block, count) =>
  count ? nthVisible(editor, block.head, count) : firstVisible(editor, block.head)
const lastRow: Motion = (editor, block, count) =>
  count ? nthVisible(editor, block.head, count) : lastVisible(editor, block.head)

function commands(): Record<string, CommandAction> {
  const table: Record<string, CommandAction> = {
    // Motions
    'vim:move-down': (context) => motion(context, nextRow),
    'vim:move-up': (context) => motion(context, prevRow),
    'vim:goto-first': (context) => motion(context, firstRow),
    'vim:goto-last': (context) => motion(context, lastRow),
    'vim:extend-down': (context) => extend(context, nextRow),
    'vim:extend-up': (context) => extend(context, prevRow),
    'vim:move-left': moveLeft,
    'vim:move-right': moveRight,

    // Folding and hoisting
    'vim:fold-open': (context) => fold(context, 'expand'),
    'vim:fold-close': (context) => fold(context, 'collapse'),
    'vim:fold-toggle': (context) => fold(context, 'toggle'),
    'vim:focus-in': (context) =>
      withBlock(context, ({ editor, head }) => {
        editor.focusIn(head)
        return true
      }),
    'vim:focus-out': (context) =>
      withBlock(context, ({ editor }) => {
        editor.focusOut()
        return true
      }),

    // Operators. `dd`/`yy` act on the selection (count = more rows down);
    // the motion forms extend from the head first, like vim.
    'vim:yank': (context) => operate(context, 'yank', (editor, block, count) => down(editor, block.head, (count ?? 1) - 1)),
    'vim:.yank-down': (context) => operate(context, 'yank', nextRow, true),
    'vim:.yank-up': (context) => operate(context, 'yank', prevRow, true),
    'vim:.yank-to-first': (context) => operate(context, 'yank', firstRow),
    'vim:.yank-to-last': (context) => operate(context, 'yank', lastRow),
    'vim:delete': (context) => operate(context, 'delete', (editor, block, count) => down(editor, block.head, (count ?? 1) - 1)),
    'vim:.delete-down': (context) => operate(context, 'delete', nextRow, true),
    'vim:.delete-up': (context) => operate(context, 'delete', prevRow, true),
    'vim:.delete-to-first': (context) => operate(context, 'delete', firstRow),
    'vim:.delete-to-last': (context) => operate(context, 'delete', lastRow),
    'vim:change': (context) => operate(context, 'change', (editor, block, count) => down(editor, block.head, (count ?? 1) - 1)),

    // Register
    'vim:paste-below': (context) => withBlock(context, ({ editor, head }, count) => paste(editor, head, false, count ?? 1)),
    'vim:paste-above': (context) => withBlock(context, ({ editor, head }, count) => paste(editor, head, true, count ?? 1)),

    // Insert mode
    'vim:insert': (context) => withBlock(context, ({ editor, head }) => leaveVisualThen(insertCaret(editor, head, false))),
    'vim:append': (context) => withBlock(context, ({ editor, head }) => leaveVisualThen(insertCaret(editor, head, true))),
    'vim:open-below': (context) => withBlock(context, ({ editor, head }) => leaveVisualThen(openRow(editor, head, true))),
    'vim:open-above': (context) => withBlock(context, ({ editor, head }) => leaveVisualThen(openRow(editor, head, false))),

    // Visual mode
    'vim:visual': (context) =>
      withBlock(context, ({ editor, selection, head }) => {
        if (isVisual(editor)) {
          exitVisual()
          editor.selectRows(head)
        } else {
          if (selection.type !== 'block') editor.selectRows(head)
          enterVisual(editor)
        }
        return true
      }),
    'vim:.visual-yank': (context) =>
      withVisualBlock(context, ({ editor, selection }) => {
        const range = rangeOf(selection)
        if (!range) return true
        yank(range.cover)
        exitVisual()
        editor.selectRows(range.start)
        return true
      }),
    'vim:.visual-delete': (context) =>
      withVisualBlock(context, ({ editor, selection }) => {
        const range = rangeOf(selection)
        if (!range) return true
        yank(range.cover)
        remove(editor, range)
        exitVisual()
        return true
      }),
    'vim:.visual-change': (context) =>
      withVisualBlock(context, ({ editor, selection }) => {
        const range = rangeOf(selection)
        if (!range) return true
        change(editor, range)
        exitVisual()
        return true
      }),
    'vim:.visual-paste': (context) =>
      withVisualBlock(context, ({ editor, selection }) => {
        const range = rangeOf(selection)
        if (!range) return true
        replaceWithRegister(editor, range)
        exitVisual()
        return true
      }),

    // Modes
    'vim:normal-mode': (context) => {
      const editor = context.editor
      if (!editor) return false
      clearCount()
      exitVisual()
      const selection = context.selection ?? editor.selection
      if (!selection) return false
      editor.selectRows(selection.type === 'block' ? selection.detail.headRow : selection.row)
      return true
    },

    // Settings
    'vim:toggle-keybindings': (context) => {
      const enabled = !keybindingsEnabled()
      setKeybindingsEnabled(enabled)
      exitVisual()
      installKeybindings(false)
      context.editor?.showStatusMessage(`Vim keybindings ${enabled ? 'on' : 'off'}`, 2000)
      return true
    },
    'vim:toggle-mode-indicator': (context) => {
      const enabled = !indicatorEnabled()
      setIndicatorEnabled(enabled)
      clearIndicators()
      if (context.editor) refreshIndicator(context.editor)
      context.editor?.showStatusMessage(`Vim mode indicator ${enabled ? 'on' : 'off'}`, 2000)
      return true
    },
  }

  for (let digit = 0; digit <= 9; digit++) {
    table[`vim:.count-${digit}`] = () => pushCountDigit(digit)
  }


  const guarded: Record<string, CommandAction> = {}
  for (const [name, action] of Object.entries(table)) guarded[name] = guard(name, action)
  return guarded
}

/** Never let an exception fall through to Bike as an unhandled key. */
function guard(name: string, action: CommandAction): CommandAction {
  return (context) => {
    try {
      const result = action(context)
      if (context.editor) refreshIndicator(context.editor)
      return result
    } catch (error) {
      console.error(`[Vim] ${name} failed:`, error)
      return true
    }
  }
}

// MARK: - Command helpers

/** Run `body` with the block selection; every command consumes the pending count. */
function withBlock(context: CommandContext, body: (block: Block, count: number | undefined) => boolean): boolean {
  syncVisual()
  const block = blockOf(context)
  const count = takeCount()
  if (!block) return false
  return body(block, count)
}

/**
 * Visual-only commands: if visual mode is not actually on for this editor
 * (a stale keymap after leaving block mode behind the extension's back),
 * restore the normal keymap and swallow the key.
 */
function withVisualBlock(context: CommandContext, body: (block: Block) => boolean): boolean {
  return withBlock(context, (block) => {
    if (!isVisual(block.editor)) {
      exitVisual()
      return true
    }
    return body(block)
  })
}

function select(block: Block, head: Row): void {
  if (isVisual(block.editor)) block.editor.selectRows(block.anchor, head)
  else block.editor.selectRows(head)
}

/** Move the cursor; in visual mode the selection extends instead. */
function motion(context: CommandContext, target: Motion): boolean {
  return withBlock(context, (block, count) => {
    select(block, target(block.editor, block, count))
    return true
  })
}

/** Extend the selection from its anchor (`J` / `K`). */
function extend(context: CommandContext, target: Motion): boolean {
  return withBlock(context, (block, count) => {
    block.editor.selectRows(block.anchor, target(block.editor, block, count))
    return true
  })
}

/** `h`: collapse, or go to the parent once there is nothing left to collapse. */
function moveLeft(context: CommandContext): boolean {
  return withBlock(context, (block, count) => {
    const { editor } = block
    let row = block.head
    for (let i = 0; i < (count ?? 1); i++) {
      if (row.firstChild && editor.isExpanded(row)) {
        editor.collapse([row])
      } else {
        const parent = visibleParent(editor, row)
        if (!parent) break
        row = parent
      }
    }
    select(block, row)
    return true
  })
}

/** `l`: expand, or go to the first child once expanded. */
function moveRight(context: CommandContext): boolean {
  return withBlock(context, (block, count) => {
    const { editor } = block
    let row = block.head
    for (let i = 0; i < (count ?? 1); i++) {
      if (row.firstChild && editor.isCollapsed(row)) {
        editor.expand([row])
      } else {
        const child = visibleFirstChild(editor, row)
        if (!child) break
        row = child
      }
    }
    select(block, row)
    return true
  })
}

function fold(context: CommandContext, action: 'expand' | 'collapse' | 'toggle'): boolean {
  return withBlock(context, ({ editor, selection, head }) => {
    const rows = selection.type === 'block' ? selection.rows : [head]
    if (action === 'toggle') {
      if (editor.isCollapsed(head)) editor.expand(rows)
      else editor.collapse(rows)
    } else if (action === 'expand') {
      editor.expand(rows)
    } else {
      editor.collapse(rows)
    }
    return true
  })
}

/**
 * Operator + motion: extend the selection from the anchor to the motion's
 * target, then yank / delete / change the rows it covers. With `mustMove`
 * (`dj`, `yk`, …) a motion that cannot move does nothing, as in vim.
 */
function operate(context: CommandContext, op: 'yank' | 'delete' | 'change', target: Motion, mustMove = false): boolean {
  return withBlock(context, (block, count) => {
    const { editor } = block
    const head = target(editor, block, count)
    if (mustMove && head.id === block.head.id) return true
    const range = selectRange(editor, block.anchor, head)
    if (!range) return true
    switch (op) {
      case 'yank':
        yank(range.cover)
        editor.selectRows(block.anchor, block.head)
        break
      case 'delete':
        yank(range.cover)
        remove(editor, range)
        break
      case 'change':
        change(editor, range)
        break
    }
    exitVisual()
    return true
  })
}

function leaveVisualThen(result: boolean): boolean {
  exitVisual()
  return result
}
