import { Outline, OutlineEditor, Row } from 'bike/app'

// Tests drive the extension through its commands: keystrokes cannot be
// synthesized, but every keybinding maps to one of these commands.
//
// The handlers are called directly through the `context['vim'].perform` hook
// rather than `bike.commands.performCommand`: on Bike 2 (293) a command
// performed that way from the test context dies with a fatal "JSContext not
// available" as soon as it runs a transaction or shows a status message.
// One test still goes through performCommand to prove the commands are
// registered. Each suite builds its fixture in its first test, after a
// run-loop tick, so the test editor is ready.

type Fixture = { a: Row; a1: Row; a1a: Row; a2: Row; b: Row; c: Row }

type VimHook = { perform(name: string, context: { editor: OutlineEditor; selection?: unknown }): boolean | undefined }

function hook(): VimHook {
  const vim = (context as Record<string, unknown>)['vim'] as VimHook | undefined
  if (!vim) throw new Error('vim test hook missing: is the extension activated?')
  return vim
}

function run(command: string, editor: OutlineEditor): boolean | undefined {
  if (!command.startsWith('vim:')) return bike.commands.performCommand(command, { editor, selection: editor.selection })
  return hook().perform(command, { editor, selection: editor.selection })
}

function count(editor: OutlineEditor, n: number): void {
  for (const digit of String(n)) run(`vim:.count-${digit}`, editor)
}

/**
 * A (heading, @done)
 *   A1 (collapsed)
 *     A1a
 *   A2
 * B
 * C
 *
 * Visible order: A, A1, A2, B, C.
 */
function fixture(editor: OutlineEditor): Fixture {
  const outline = editor.outline
  const rows = outline.transaction({ label: 'fixture' }, () => {
    const [a, b, c] = outline.insertRows([{ type: 'heading', text: 'A' }, { text: 'B' }, { text: 'C' }], outline.root)
    a.setAttribute('done', '')
    const [a1, a2] = outline.insertRows(['A1', 'A2'], a)
    const [a1a] = outline.insertRows(['A1a'], a1)
    return { a, a1, a1a, a2, b, c }
  }) as Fixture
  editor.collapse([rows.a1])
  return rows
}

function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A fresh test outline with the fixture in it. */
async function fresh(): Promise<{ editor: OutlineEditor; f: Fixture }> {
  const editor = bike.testEditor()
  await tick()
  return { editor, f: fixture(editor) }
}

function selectedRow(editor: OutlineEditor): string {
  return editor.selection?.row.text.string ?? '(none)'
}

function selectedRows(editor: OutlineEditor): string[] {
  const selection = editor.selection
  return selection?.type === 'block' ? selection.rows.map((row) => row.text.string) : []
}

function topLevel(editor: OutlineEditor): string[] {
  return editor.outline.root.children.map((row) => row.text.string)
}

function keys(): string {
  return bike.keybindings.toString()
}

/** True when some key sequence is currently bound to the command. */
function bound(command: string): boolean {
  return keys()
    .split('\n')
    .some((line) => line.includes(`: ${command},`))
}

/** The block selection's anchor and head, or a failure. */
function block(editor: OutlineEditor): { anchor: Row; head: Row } {
  const selection = editor.selection
  if (!selection || selection.type !== 'block') throw new Error(`expected a block selection, got ${selection?.type}`)
  return { anchor: selection.detail.anchorRow, head: selection.detail.headRow }
}

/** The caret selection's row and offset, or a failure. */
function caret(editor: OutlineEditor): { row: Row; char: number } {
  const selection = editor.selection
  if (!selection || selection.type !== 'caret') throw new Error(`expected a caret selection, got ${selection?.type}`)
  return { row: selection.row, char: selection.detail.char }
}

describe('vim: fixture sanity', () => {
  let editor: OutlineEditor
  let f: Fixture

  it('lays out the rows as documented', async () => {
    ;({ editor, f } = await fresh())
    assert.equal(topLevel(editor).join(','), 'A,B,C')
    assert.equal(f.a.children.length, 2)
    assert(editor.isCollapsed(f.a1), 'A1 should be collapsed')
    assert(!editor.isFocused(f.a1a), 'A1a should be hidden')
    assert.equal(editor.nextFocused(f.a1)?.text.string, 'A2')
  })

  it('Outline copies drop children, which is why the register is rebuilt row by row', () => {
    const copy = new Outline([f.a])
    const root = copy.root.firstChild!
    assert.equal(root.text.string, 'A')
    assert.equal(root.type, 'heading')
    assert.equal(root.getAttribute('done'), '')
    assert.equal(root.children.length, 0)
  })

  it('registers its commands and keybindings with Bike', () => {
    assert(bike.commands.toString().includes('vim:move-down'), 'command should be registered')
    assert(bound('vim:move-down'), 'keybinding should be registered')
    assert(bound('edit:redo'), 'control-r should be bound to redo')
    assert(bound('row:block-indent'), '>> should be bound')
    editor.selectRows(f.a)
    assert.equal(bike.commands.performCommand('vim:move-down', { editor, selection: editor.selection }), true)
    assert.equal(selectedRow(editor), 'A1')
  })
})

describe('vim: motions', () => {
  let editor: OutlineEditor
  let f: Fixture

  it('j moves to the next visible row, skipping collapsed children', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a)
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'A1')
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'A2')
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'B')
  })

  it('k moves to the previous visible row', () => {
    run('vim:move-up', editor)
    assert.equal(selectedRow(editor), 'A2')
  })

  it('j and k stop at the ends', () => {
    editor.selectRows(f.a)
    run('vim:move-up', editor)
    assert.equal(selectedRow(editor), 'A')
    editor.selectRows(f.c)
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'C')
  })

  it('a count repeats the motion (3j)', () => {
    editor.selectRows(f.a)
    count(editor, 3)
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'B')
  })

  it('multi-digit counts work and clamp (12k)', () => {
    editor.selectRows(f.c)
    count(editor, 12)
    run('vim:move-up', editor)
    assert.equal(selectedRow(editor), 'A')
  })

  it('0 without a pending count is not a count', () => {
    assert.equal(run('vim:.count-0', editor), false)
    editor.selectRows(f.a)
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'A1')
  })

  it('a count is consumed by the command that follows it', () => {
    editor.selectRows(f.a)
    count(editor, 2)
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'A2')
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'B', 'second j should move one row')
  })

  it('G goes to the last visible row, gg to the first', () => {
    editor.selectRows(f.a2)
    run('vim:goto-last', editor)
    assert.equal(selectedRow(editor), 'C')
    run('vim:goto-first', editor)
    assert.equal(selectedRow(editor), 'A')
  })

  it('NG and Ngg go to visible row N', () => {
    editor.selectRows(f.c)
    count(editor, 2)
    run('vim:goto-last', editor)
    assert.equal(selectedRow(editor), 'A1')
    count(editor, 4)
    run('vim:goto-first', editor)
    assert.equal(selectedRow(editor), 'B')
  })

  it('J and K extend the selection from its anchor', () => {
    editor.selectRows(f.b)
    run('vim:extend-down', editor)
    assert.equal(selectedRows(editor).join(','), 'B,C')
    assert.equal(block(editor).anchor.text.string, 'B')
    assert.equal(block(editor).head.text.string, 'C')
    run('vim:extend-up', editor)
    assert.equal(selectedRows(editor).join(','), 'B')
  })

  it('Escape collapses a multi-row selection to its head and clears the count', () => {
    editor.selectRows(f.a, f.a1)
    count(editor, 2)
    assert.equal(run('vim:normal-mode', editor), true)
    assert.equal(selectedRows(editor).join(','), 'A1')
    run('vim:move-down', editor)
    assert.equal(selectedRow(editor), 'A2', 'the count should have been cleared')
  })
})

describe('vim: folding and hoisting', () => {
  let editor: OutlineEditor
  let f: Fixture

  it('h collapses an expanded row with children and stays on it', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a)
    run('vim:move-left', editor)
    assert(editor.isCollapsed(f.a))
    assert.equal(selectedRow(editor), 'A')
  })

  it('h on a top-level row with nothing to collapse stays put', () => {
    run('vim:move-left', editor)
    assert.equal(selectedRow(editor), 'A')
  })

  it('l expands a collapsed row and stays on it', () => {
    run('vim:move-right', editor)
    assert(editor.isExpanded(f.a))
    assert.equal(selectedRow(editor), 'A')
  })

  it('l on an expanded row moves to its first child', () => {
    run('vim:move-right', editor)
    assert.equal(selectedRow(editor), 'A1')
  })

  it('h on a child without expanded children moves to the parent', () => {
    editor.selectRows(f.a2)
    run('vim:move-left', editor)
    assert.equal(selectedRow(editor), 'A')
  })

  it('l on a leaf does nothing', () => {
    editor.selectRows(f.c)
    run('vim:move-right', editor)
    assert.equal(selectedRow(editor), 'C')
  })

  it('za toggles, zc collapses, zo expands', () => {
    editor.selectRows(f.a)
    run('vim:fold-toggle', editor)
    assert(editor.isCollapsed(f.a))
    run('vim:fold-toggle', editor)
    assert(editor.isExpanded(f.a))
    run('vim:fold-close', editor)
    assert(editor.isCollapsed(f.a))
    run('vim:fold-open', editor)
    assert(editor.isExpanded(f.a))
  })

  it('L focuses in on the row and H focuses out', () => {
    editor.selectRows(f.a)
    run('vim:focus-in', editor)
    assert.equal(editor.focus.id, f.a.id)
    run('vim:focus-out', editor)
    assert.equal(editor.focus.id, editor.outline.root.id)
  })
})

describe('vim: register', () => {
  let editor: OutlineEditor
  let f: Fixture

  it('yy then p pastes the row with children, type and attributes after the selected row', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a)
    run('vim:yank', editor)
    assert.equal(selectedRow(editor), 'A', 'yank keeps the selection')
    editor.selectRows(f.c)
    run('vim:paste-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C,A')
    const pasted = editor.outline.root.lastChild!
    assert.equal(pasted.type, 'heading')
    assert.equal(pasted.getAttribute('done'), '')
    assert.equal(pasted.children.map((r) => r.text.string).join(','), 'A1,A2')
    assert.equal(pasted.firstChild!.firstChild!.text.string, 'A1a')
    assert.equal(editor.selection?.row.id, pasted.id, 'paste selects the pasted row')
  })

  it('P pastes before the selected row', () => {
    editor.selectRows(f.b)
    run('vim:paste-above', editor)
    assert.equal(topLevel(editor).join(','), 'A,A,B,C,A')
    assert.equal(editor.selection?.row.id, f.b.prevSibling!.id)
  })

  it('p pastes after the whole subtree, not inside it', () => {
    editor.selectRows(f.a)
    run('vim:paste-below', editor)
    assert.equal(f.a.nextSibling!.text.string, 'A')
    assert.equal(f.a.children.length, 2, 'A keeps its two children')
  })

  it('a count pastes that many times', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.b)
    run('vim:yank', editor)
    editor.selectRows(f.c)
    count(editor, 3)
    run('vim:paste-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C,B,B,B')
  })

  it('the register outlives the editor', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.c)
    run('vim:paste-above', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,B,C')
  })

  it('yj yanks this row and the next and keeps the cursor', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a2)
    run('vim:.yank-down', editor)
    assert.equal(selectedRows(editor).join(','), 'A2')
    editor.selectRows(f.c)
    run('vim:paste-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C,A2,B')
  })

  it('yj on the last row does nothing', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a)
    run('vim:yank', editor)
    editor.selectRows(f.c)
    run('vim:.yank-down', editor)
    run('vim:paste-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C,A', 'the register should still hold A')
  })

  it('3yy yanks three rows', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a1)
    count(editor, 3)
    run('vim:yank', editor)
    assert.equal(selectedRows(editor).join(','), 'A1', 'yank restores the selection')
    editor.selectRows(f.c)
    run('vim:paste-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C,A1,A2,B')
    assert.equal(editor.outline.root.children[3].firstChild!.text.string, 'A1a')
  })
})

describe('vim: delete', () => {
  let editor: OutlineEditor
  let f: Fixture

  it('dd deletes the row with its subtree and selects the next row', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a)
    run('vim:delete', editor)
    assert.equal(topLevel(editor).join(','), 'B,C')
    assert.equal(selectedRow(editor), 'B')
  })

  it('dd puts the deleted rows in the register', () => {
    run('vim:paste-above', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C')
    assert.equal(editor.outline.root.firstChild!.children.length, 2)
  })

  it('dd on the last row selects the previous row', () => {
    editor.selectRows(editor.outline.root.lastChild!)
    run('vim:delete', editor)
    assert.equal(topLevel(editor).join(','), 'A,B')
    assert.equal(selectedRow(editor), 'B')
  })

  it('undo restores a deleted row', () => {
    run('edit:undo', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C')
  })

  it('dd on the only row leaves one empty row selected', async () => {
    editor = bike.testEditor()
    await tick()
    editor.outline.insertRows(['only'], editor.outline.root)
    editor.selectRows(editor.outline.root.firstChild!)
    run('vim:delete', editor)
    assert.equal(editor.outline.root.children.length, 1)
    assert.equal(selectedRow(editor), '')
  })

  it('2dd deletes two rows and selects the row after them', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a1)
    count(editor, 2)
    run('vim:delete', editor)
    assert.equal(f.a.children.length, 0)
    assert.equal(selectedRow(editor), 'B')
  })

  it('dj on the last row does nothing', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.c)
    run('vim:.delete-down', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C')
  })

  it('dk deletes this row and the previous one', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.c)
    run('vim:.delete-up', editor)
    assert.equal(topLevel(editor).join(','), 'A')
    assert.equal(selectedRow(editor), 'A2')
  })

  it('dG deletes through the last visible row', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a2)
    run('vim:.delete-to-last', editor)
    assert.equal(topLevel(editor).join(','), 'A')
    assert.equal(f.a.children.map((r) => r.text.string).join(','), 'A1')
    assert.equal(selectedRow(editor), 'A1')
  })

  it('dgg from a child deletes its visible ancestors too, via the cover rows', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a2)
    run('vim:.delete-to-first', editor)
    assert.equal(topLevel(editor).join(','), 'B,C')
    assert.equal(selectedRow(editor), 'B')
  })

  it('dd on a multi-row selection deletes every selected row once', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a, f.b)
    run('vim:delete', editor)
    assert.equal(topLevel(editor).join(','), 'C')
    run('vim:paste-above', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C')
    assert.equal(editor.outline.root.firstChild!.children.length, 2, 'A was copied once, with its children')
  })
})

describe('vim: change', () => {
  let editor: OutlineEditor
  let f: Fixture

  it('cc clears the text, keeps type and children, and enters insert mode', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a)
    run('vim:change', editor)
    assert.equal(f.a.text.string, '')
    assert.equal(f.a.type, 'heading')
    assert.equal(f.a.children.length, 2)
    assert.equal(caret(editor).row.id, f.a.id, 'should be in insert mode on A')
    assert.equal(caret(editor).char, 0)
  })

  it('cc puts the old row in the register', () => {
    editor.selectRows(f.c)
    run('vim:paste-below', editor)
    assert.equal(editor.outline.root.lastChild!.text.string, 'A')
  })

  it('2cc replaces two rows with one empty row', () => {
    editor.selectRows(f.b)
    count(editor, 2)
    run('vim:change', editor)
    assert.equal(topLevel(editor).join(','), ',,A')
    assert.equal(caret(editor).row.id, f.b.id)
  })
})

describe('vim: insert mode', () => {
  let editor: OutlineEditor
  let f: Fixture

  it('i puts the caret at the start of the row', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.b)
    run('vim:insert', editor)
    assert.equal(caret(editor).row.id, f.b.id)
    assert.equal(caret(editor).char, 0)
  })

  it('a puts the caret at the end of the row', () => {
    editor.selectRows(f.b)
    run('vim:append', editor)
    assert.equal(caret(editor).row.id, f.b.id)
    assert.equal(caret(editor).char, f.b.text.count)
  })

  it('Escape returns to a block selection on the same row', () => {
    assert.equal(run('vim:normal-mode', editor), true)
    assert.equal(editor.selection?.type, 'block')
    assert.equal(selectedRow(editor), 'B')
  })

  it('o below an expanded row opens its first child', () => {
    editor.selectRows(f.a)
    run('vim:open-below', editor)
    assert.equal(f.a.children.length, 3)
    assert.equal(f.a.firstChild!.text.string, '')
    assert.equal(caret(editor).row.id, f.a.firstChild!.id)
  })

  it('o below a leaf opens a sibling', () => {
    editor.selectRows(f.c)
    run('vim:open-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C,')
    assert.equal(caret(editor).row.id, editor.outline.root.lastChild!.id)
  })

  it('O opens a row above', () => {
    editor.selectRows(f.b)
    run('vim:open-above', editor)
    assert.equal(topLevel(editor).join(','), 'A,,B,C,')
    assert.equal(caret(editor).row.id, f.b.prevSibling!.id)
  })
})

describe('vim: visual mode', () => {
  let editor: OutlineEditor
  let f: Fixture

  // Not asserted here: that the normal set is gone while visual mode is on.
  // In test mode a binding set registered from the extension's own context
  // (activation, observers) is not removed by a `dispose()` issued from a
  // test, although it is in a running Bike (checked through the `bike` CLI).
  // The manual test covers it.
  it('v enters visual mode and swaps in the visual keymap', async () => {
    ;({ editor, f } = await fresh())
    assert(!bound('vim:.visual-yank'), 'visual keymap should be off in normal mode')
    assert(bound('vim:yank'), 'normal keymap should be on')
    editor.selectRows(f.b)
    run('vim:visual', editor)
    assert(bound('vim:.visual-yank'), 'visual keymap should be on')
  })

  it('j extends the selection in visual mode', () => {
    run('vim:move-down', editor)
    assert.equal(selectedRows(editor).join(','), 'B,C')
  })

  it('y yanks the selection, leaves visual mode and selects the first row', () => {
    run('vim:.visual-yank', editor)
    assert(!bound('vim:.visual-yank'))
    assert.equal(selectedRows(editor).join(','), 'B')
    editor.selectRows(f.c)
    run('vim:paste-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C,B,C')
  })

  it('d deletes the selection and leaves visual mode', () => {
    editor.selectRows(f.b)
    run('vim:visual', editor)
    run('vim:move-down', editor)
    run('vim:.visual-delete', editor)
    assert.equal(topLevel(editor).join(','), 'A,B,C')
    assert(!bound('vim:.visual-yank'))
  })

  it('v again leaves visual mode and collapses to the head row', () => {
    editor.selectRows(f.a)
    run('vim:visual', editor)
    run('vim:move-down', editor)
    run('vim:visual', editor)
    assert(!bound('vim:.visual-yank'))
    assert.equal(selectedRows(editor).join(','), 'A1')
  })

  it('Escape leaves visual mode', () => {
    editor.selectRows(f.a)
    run('vim:visual', editor)
    run('vim:normal-mode', editor)
    assert(!bound('vim:.visual-yank'))
    assert.equal(selectedRows(editor).join(','), 'A')
  })

  it('c replaces the selection with one empty row in insert mode', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.b)
    run('vim:visual', editor)
    run('vim:move-down', editor)
    run('vim:.visual-change', editor)
    assert.equal(topLevel(editor).join(','), 'A,')
    assert.equal(caret(editor).row.text.string, '')
    assert(!bound('vim:.visual-yank'))
  })

  it('p replaces the selection with the register and yanks the replaced rows', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.a)
    run('vim:yank', editor)
    editor.selectRows(f.b)
    run('vim:visual', editor)
    run('vim:move-down', editor)
    run('vim:.visual-paste', editor)
    assert.equal(topLevel(editor).join(','), 'A,A')
    assert.equal(editor.outline.root.lastChild!.children.length, 2)
    editor.selectRows(editor.outline.root.lastChild!)
    run('vim:paste-below', editor)
    assert.equal(topLevel(editor).join(','), 'A,A,B,C')
  })

  it('leaving block mode ends visual mode', async () => {
    ;({ editor, f } = await fresh())
    editor.selectRows(f.b)
    run('vim:visual', editor)
    assert(bound('vim:.visual-yank'))
    editor.selectCaret(f.b, 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert(!bound('vim:.visual-yank'), 'visual keymap should be gone after entering text mode')
  })
})

describe('vim: settings', () => {
  it('bike.defaults round-trips a false value', () => {
    bike.defaults.set('probe', false)
    assert.equal(bike.defaults.get('probe'), false)
    bike.defaults.delete('probe')
  })

  // Removal of the bindings is verified manually (see the note in the visual
  // suite); what test mode can check is the persisted setting and the reinstall.
  it('toggling the keybindings off persists the setting and toggling back restores them', async () => {
    const editor = bike.testEditor()
    await tick()
    assert(bound('vim:move-down'))
    try {
      run('vim:toggle-keybindings', editor)
      assert.equal(bike.defaults.get('enabled'), false, 'setting should be persisted as off')
    } finally {
      run('vim:toggle-keybindings', editor)
    }
    assert.equal(bike.defaults.get('enabled'), true, 'setting should be persisted as on')
    assert(bound('vim:move-down'), 'bindings should be back')
  })
})
