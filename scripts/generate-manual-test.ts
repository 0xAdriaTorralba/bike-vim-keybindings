/**
 * Generate `manual-test.bike` from the keymap, so every binding has a row to
 * exercise it inside Bike. Run with `npm run manual-test` (Node 22.6+; the
 * keymap is loaded with Node's built-in type stripping).
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GROUP_TITLES,
  NORMAL_BINDINGS,
  PALETTE_COMMANDS,
  VISUAL_BINDINGS,
  type Binding,
  type BindingGroup,
} from '../src/vim-keybindings.bkext/app/keymap.ts'

type Node = {
  text: string
  type?: 'heading' | 'task' | 'note' | 'body' | 'unordered' | 'ordered' | 'quote' | 'code'
  attributes?: Record<string, string>
  children?: Node[]
}

const GROUP_ORDER: BindingGroup[] = ['motions', 'counts', 'folding', 'operators', 'registers', 'insert', 'visual', 'modes', 'bike']

/**
 * Concrete steps for the bindings where the generic description is not enough
 * to know whether the result is right. Keyed by vim spelling.
 */
const RECIPES: Record<string, string> = {
  j: 'Select "Alpha" (Playground) and press j: "Alpha 1" is selected. Press j again on a collapsed "Alpha 1": "Alpha 2" is selected, the hidden "Alpha 1a" is skipped.',
  k: 'From "Beta" press k: "Alpha 2" is selected. On the first row of the document k does nothing.',
  h: 'On an expanded "Alpha" press h: it collapses and stays selected. Press h again: nothing (top level). On "Alpha 2" press h: "Alpha" is selected.',
  l: 'On a collapsed "Alpha" press l: it expands and stays selected. Press l again: "Alpha 1" is selected. On the empty row press l: nothing.',
  gg: 'From anywhere press g g: the first row of the document is selected. Press 3 g g: the third visible row.',
  G: 'From anywhere press G: the last row of the document is selected. Press 2 G: the second visible row.',
  J: 'On "Beta" press J: "Beta" and the next row are selected. Press K: back to "Beta" only.',
  K: 'On "Gamma" press K twice: three rows selected upward. Press J: back to two.',
  '1': 'Press 3 then j from "Alpha": "Beta" is selected (three visible rows down).',
  '0': 'Press 0 alone: nothing happens (Bike keeps its own behaviour). Press 1 0 j from the top: ten rows down, or the last row.',
  zo: 'On a collapsed "Alpha" press z o: it expands.',
  zc: 'On an expanded "Alpha" press z c: it collapses; "Alpha 1" and "Alpha 2" disappear.',
  za: 'Press z a twice on "Alpha": collapsed, then expanded again.',
  zR: 'Collapse a few rows, press z R: everything expands.',
  zM: 'Press z M: every row with children collapses. Press z R to recover.',
  L: 'On "Alpha" press L: the editor focuses in on Alpha (its children become the top level). Press H: focus out to the whole document.',
  H: 'While focused in, press H: back out one level. At the document level H does nothing.',
  yy: 'On "Alpha" press y y: nothing visible changes, selection stays. Then on "Gamma" press p: a copy of Alpha with all its children, still a heading, appears after Gamma.',
  yj: 'On "Alpha 2" press y j: selection stays on Alpha 2. On "Gamma" press p: "Alpha 2" and "Beta" appear after Gamma.',
  yk: 'With "Alpha" expanded, on "Beta" press y k: "Alpha 2" and "Beta" are yanked. On "Gamma" press p: both appear after Gamma, at the same level as each other.',
  ygg: 'On "Beta" press y g g, then G and p: everything from the document start through Beta is pasted at the end (rows inside a copied parent are not duplicated).',
  yG: 'On "Beta" press y G, then g g and P: Beta through the last row are pasted at the top.',
  dd: 'On "Alpha 2" (a @done task) press d d: it disappears, "Beta" is selected. Press P: it comes back above Beta, still done. Press u: paste undone.',
  dj: 'On "Beta" press d j: Beta and the row below vanish. On the last row of the document d j does nothing.',
  dk: 'On "Gamma" press d k: Gamma and the row above vanish; the row before them is selected.',
  dgg: 'On the second row press d g g: the first two rows vanish. Press u to undo.',
  dG: 'On "Gamma" press d G: everything from Gamma to the end vanishes; the previous row is selected. Press u to undo.',
  cc: 'On "Beta" press c c: the text clears, the row keeps its heading style, the caret blinks at the start and the status bar shows -- INSERT --. Type something, press Escape. Press p: the old "Beta" is pasted below.',
  p: 'After y y on "Alpha", press p on "Alpha 1": the copy of Alpha appears right after Alpha 1 and its children, before "Alpha 2" (p pastes after the selected row\'s own subtree, at the same level). Press 3 p: three copies. Press u to undo.',
  P: 'Press P on "Gamma": the register is pasted above Gamma and the pasted row is selected.',
  i: 'On "Beta" press i: caret at the start of Beta, status bar -- INSERT --. Type, then Escape: Beta is selected as a block again and the message disappears.',
  I: 'Same as i.',
  a: 'On "Beta" press a: caret at the end of Beta.',
  A: 'Same as a.',
  o: 'On an expanded "Alpha" press o: a new empty first child appears with the caret in it. On "Gamma" press o: a new sibling below. Escape.',
  O: 'On "Beta" press O: a new empty row appears above Beta with the caret in it. Escape.',
  v: 'On "Beta" press v: the status bar shows -- VISUAL --. Press j: two rows selected. Press v: back to one row, message gone.',
  V: 'Same as v.',
  Esc: 'With two rows selected via J, press Escape: only the head row stays selected and Bike does NOT switch to text mode. Press Escape again: still block mode.',
  u: 'After any edit press u: it is undone.',
  'Ctrl-r': 'After u press Control-r: redone.',
  '/': 'Press /: Bike find opens. Type "Beta", Return. Escape back to the editor.',
  n: 'After a search press n: next match. Press N: previous match.',
  N: 'See n.',
  '>>': 'On "Beta" press > >: Beta indents under the row above. Press < <: back out.',
  '<<': 'See >>.',
  y: 'v, j, then y: two rows yanked, visual mode ends, the first of the two is selected. p on "Gamma" pastes both.',
  d: 'v, j, then d: both rows vanish, visual mode ends. P brings them back.',
  x: 'Same as d.',
  c: 'v, j, then c: both rows are replaced by one empty row in insert mode. Escape, then u u to recover.',
  'p (visual)': 'y y on "Alpha", then v and j on "Beta", then p: Beta and the next row are replaced by a copy of Alpha; a following p pastes the replaced rows back.',
}

function recipe(binding: Binding): string {
  const key = binding.group === 'visual' && binding.vim === 'p' ? 'p (visual)' : binding.vim
  return RECIPES[key] ?? binding.description
}

function bindingRow(binding: Binding): Node {
  const keys = binding.vim === binding.keys ? `\`${binding.vim}\`` : `\`${binding.vim}\` (Bike: \`${binding.keys}\`)`
  return { type: 'task', text: `${keys} — ${recipe(binding)}` }
}

function groupSection(group: BindingGroup, bindings: Binding[]): Node {
  const rows = bindings.filter((binding) => binding.group === group)
  // One task per key, digits collapsed into a single row
  const seen = new Set<string>()
  const children: Node[] = []
  for (const binding of rows) {
    const id = group === 'counts' ? (binding.vim === '0' ? '0' : '1') : binding.keys
    if (seen.has(id)) continue
    seen.add(id)
    children.push(bindingRow(group === 'counts' && id === '1' ? { ...binding, vim: '1', keys: '1-9' } : binding))
  }
  return { type: 'heading', text: GROUP_TITLES[group], children }
}

const playground: Node = {
  type: 'heading',
  text: 'Playground — rows the checks below refer to',
  children: [
    {
      text: 'Alpha (has children; collapse it with zc when a check asks for a collapsed row)',
      children: [
        {
          text: 'Alpha 1 (collapse me with zc before the motion checks)',
          children: [
            {
              text: 'Alpha 1a (level 3)',
              children: [{ text: 'Alpha 1a-i (level 4, the deepest row)' }],
            },
          ],
        },
        { type: 'task', text: 'Alpha 2 (a done task: register round-trips must keep the checkmark)', attributes: { done: '2026-08-26' } },
      ],
    },
    { type: 'heading', text: 'Beta (a heading row)' },
    { text: '' },
    { type: 'quote', text: 'Delta (a quote row, with **bold** and `code` runs)' },
    { text: 'Gamma — the last row of the playground' },
  ],
}

const lifecycle: Node = {
  type: 'heading',
  text: 'Extension lifecycle',
  children: [
    { type: 'task', text: 'Escape from insert mode using Bike\'s own handling (no vim binding in text mode): the -- INSERT -- message disappears and vim keys work again immediately.' },
    { type: 'task', text: 'Bike > Extensions Explorer: disable Vim Keybindings. j/k/dd do what Bike does by default (nothing vim-ish). Re-enable: vim keys are back without restarting Bike.' },
    { type: 'task', text: 'Command palette (⇧⌘P) › "Vim: Toggle Keybindings": same as above but without disabling the extension; the status bar confirms on/off. Toggle back on.' },
    { type: 'task', text: 'Command palette › "Vim: Toggle Mode Indicator": the -- INSERT -- / -- VISUAL -- messages stop; toggle again to restore.' },
    { type: 'task', text: 'Two windows: y y a row in this document, open another document, p there: the row (with children) is pasted. The register is shared.' },
    { type: 'task', text: 'Visual mode then switch window: v here, click another window, come back: visual mode is off (no -- VISUAL --, y needs y y again).' },
    { type: 'task', text: 'Click into a row while in visual mode: the caret appears, -- VISUAL -- goes away, -- INSERT -- shows.' },
    { type: 'task', text: 'Bike > Logs Explorer with "vim-keybindings" checked: no [Vim] errors appeared during this pass.' },
    { type: 'task', text: 'Keys the extension does not bind (for example x in normal mode, or w, b, e) still do whatever Bike does by default.' },
  ],
}

const palette: Node = {
  type: 'heading',
  text: 'Palette-only commands',
  children: PALETTE_COMMANDS.map((command) => ({ type: 'task', text: `\`${command.command}\` — ${command.description}` })),
}

const document: Node[] = [
  {
    type: 'heading',
    text: 'Vim Keybindings — manual test',
    children: [
      { type: 'note', text: 'Generated by scripts/generate-manual-test.ts from the keymap; do not edit by hand. Open Bike > Logs Explorer (check "vim-keybindings") before starting and watch for [Vim] errors.' },
      { type: 'note', text: 'Press Escape so the selection is a block (row) selection: that is vim normal mode. Multi-key sequences are typed one key after another (yy = y, then y). Tick each task when the described result happened.' },
      { type: 'note', text: 'Tip: u undoes any edit made by a check, so the playground can be restored at any point.' },
    ],
  },
  playground,
  ...GROUP_ORDER.filter((group) => group !== 'visual').map((group) => groupSection(group, NORMAL_BINDINGS)),
  groupSection('visual', VISUAL_BINDINGS),
  palette,
  lifecycle,
]

// MARK: - .bike serialisation

/** XML escaping in the form Bike writes back, so a round trip through Bike leaves the file unchanged. */
function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Minimal inline markdown: **bold**, `code`. */
function inline(text: string): string {
  return escape(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

let counter = 0
function nextId(): string {
  counter += 1
  return `vimtest-${String(counter).padStart(3, '0')}`
}

function renderRow(node: Node, depth: number): string {
  const pad = '  '.repeat(depth)
  const attributes = [`id="${nextId()}"`]
  if (node.type && node.type !== 'body') attributes.push(`data-type="${node.type}"`)
  for (const [name, value] of Object.entries(node.attributes ?? {})) attributes.push(`data-${name}="${escape(value)}"`)
  const paragraph = node.text === '' ? '<p/>' : `<p>${inline(node.text)}</p>`
  const lines = [`${pad}<li ${attributes.join(' ')}>`, `${pad}  ${paragraph}`]
  if (node.children?.length) {
    lines.push(`${pad}  <ul>`)
    for (const child of node.children) lines.push(renderRow(child, depth + 2))
    lines.push(`${pad}  </ul>`)
  }
  lines.push(`${pad}</li>`)
  return lines.join('\n')
}

function renderDocument(nodes: Node[]): string {
  const rows = nodes.map((node) => renderRow(node, 3)).join('\n')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<html>',
    '  <head>',
    '    <meta charset="utf-8"/>',
    '  </head>',
    '  <body>',
    '    <ul id="vimtest-root">',
    rows,
    '    </ul>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}

const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'manual-test.bike')
writeFileSync(output, renderDocument(document))
console.log(`wrote ${output} (${counter} rows)`)
