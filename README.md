# Vim Keybindings for Bike 2

Vim-style modal editing for the [Bike Outliner](https://www.hogbaysoftware.com/bike/) — `hjkl` over rows,
counts, `dd` / `yy` / `p` with an outline-aware register, `cc`, `o` / `O`, folding on `h` / `l` and `z`, and a
visual (row) mode. Bike's block mode is normal mode, Bike's text mode is insert mode; nothing about how
Bike edits text changes.

Built for Bike 2 (build 293, extension API 0.64.0). Vim-style keys apply to rows, not to characters inside a
row: once you are typing, you are in Bike.

## Install

- From Bike: **Bike › Extensions Explorer › Browse**, find *Vim Keybindings*, click **Install**.
- By hand: download `vim-keybindings.bkext.zip` from the
  [latest release](https://github.com/0xAdriaTorralba/bike-vim-keybindings/releases), unzip it, and move the
  `vim-keybindings.bkext` folder into Bike's extensions folder (**Bike › Extensions Explorer › Show in Finder**,
  or `~/Library/Containers/com.hogbaysoftware.Bike/Data/Library/Application Support/Bike/Extensions`). Bike
  loads it immediately.

Turn it off without uninstalling with the command palette entry **Vim: Toggle Keybindings** (or disable the
extension in the Extensions Explorer).

## Modes

| Mode | Bike state | Enter with | Leave with |
|---|---|---|---|
| Normal | block (row) selection | `Escape` from insert mode, or click a row handle | `i` `a` `o` `O` `cc` |
| Insert | caret / text selection | `i` `I` `a` `A` `o` `O` `cc` | `Escape` (Bike's own) |
| Visual | multi-row block selection, extended by motions | `v` `V` | `Escape`, `v`, or any operator |

The mode is derived from Bike's selection, so it can never get out of sync with the app. The editor status bar
shows `-- INSERT --` / `-- VISUAL --` while those modes are active (turn that off with **Vim: Toggle Mode
Indicator**). In normal mode `Escape` clears a pending count and collapses a multi-row selection to its head
row — it never drops you back into text mode.

Keys the extension does not bind keep whatever Bike does with them.

## Keymap

Multi-key sequences are typed one key after another. A count typed before a motion or operator repeats it
(`3j`, `2dd`, `3p`); `0` is only a digit while a count is pending.

### Motions

| Keys | Action |
|---|---|
| `j` / `k` | Next / previous visible row (collapsed children are skipped) |
| `h` | Collapse the row; if it is already collapsed or has no children, go to its parent |
| `l` | Expand the row; if it is already expanded, go to its first child |
| `gg` / `G` | First / last visible row; with a count, row *N* |
| `J` / `K` | Extend the selection down / up (also in normal mode) |

### Folding and hoisting

| Keys | Action |
|---|---|
| `zo` / `zc` / `za` | Expand / collapse / toggle the selected rows |
| `zR` / `zM` | Expand all / collapse all (Bike's `fold:expand-all`, `fold:collapse-all`) |
| `L` / `H` | Focus in on the row (hoist) / focus out one level |

### Operators and the register

| Keys | Action |
|---|---|
| `yy` | Yank the selected rows into the register, children included |
| `yj` `yk` `ygg` `yG` | Yank from the cursor through the motion |
| `dd` | Delete the selected rows (children included) into the register |
| `dj` `dk` `dgg` `dG` | Delete from the cursor through the motion |
| `cc` | Clear the row's text (type, attributes and children stay) and enter insert mode; the old text goes to the register |
| `p` / `P` | Paste the register after the selected row (below its subtree) / before it |

Yank and delete copy whole subtrees with their row types and attributes, so a done task or a heading round-trips
intact. Rows covered by another selected row are copied once, not twice. The register is shared by all windows,
so you can `yy` in one document and `p` in another. It is not the system clipboard — Bike's own `⌘C` / `⌘V`
still work as before.

### Insert mode

| Keys | Action |
|---|---|
| `i` / `I` | Caret at the start of the row |
| `a` / `A` | Caret at the end of the row |
| `o` | New row below (as first child when the row is expanded, like the row Bike would show under the cursor) |
| `O` | New row above |
| `Escape` | Back to normal mode — handled by Bike |

### Visual mode

`v` or `V` starts a row-wise visual selection; motions (`j` `k` `gg` `G` `J` `K`, with counts) extend it.

| Keys | Action |
|---|---|
| `y` | Yank the selection, select its first row |
| `d` / `x` | Delete the selection |
| `c` | Replace the selection with one empty row and enter insert mode |
| `p` / `P` | Replace the selection with the register; the replaced rows become the register |
| `>` / `<` | Indent / outdent the selection |
| `i` / `a` | Leave visual mode and insert at the start / end of the head row |
| `Escape` / `v` | Leave visual mode |

Visual mode also ends when the selection stops being a block selection (a click into text, another window
coming to the front).

### Bike commands on vim keys

| Keys | Command |
|---|---|
| `u` / `Control-r` | Undo / redo |
| `/` `n` `N` | Find, find next, find previous |
| `>>` / `<<` | Indent / outdent the selected rows |

### Commands without a default key

Both are in the command palette (`⇧⌘P`) and remember their state across launches.

- **Vim: Toggle Keybindings** — turn all of the above off or on.
- **Vim: Toggle Mode Indicator** — show or hide the `-- INSERT --` / `-- VISUAL --` status message.

## Not included (yet)

- Character motions inside a row (`w` `b` `e` `0` `$` `f`), text objects (`iw`, `ip`), and `x` / `s` / `r` on
  characters — inside a row Bike's own editing applies.
- `.` repeat, macros (`q` / `@`), marks (`m` / `'`), named registers (`"a`), `:` ex commands, search with
  `?`, and `Ctrl-d` / `Ctrl-u` paging.
- Yanking to the system clipboard. `yy` fills the extension's register only; use `⌘C` for the clipboard.

## Development

```sh
git clone https://github.com/0xAdriaTorralba/bike-vim-keybindings
cd bike-vim-keybindings
npm install
npm run install-ext   # build and install into Bike (Bike reloads it live)
npm run watch         # rebuild + reinstall on every save
npm test              # bike-ext test: builds, installs, and runs tests inside Bike (quit Bike first)
npm run manual-test   # regenerate manual-test.bike from the keymap
```

The extension lives in `src/vim-keybindings.bkext/`:

- `app/keymap.ts` — every binding as data (normal and visual sets); the README tables and
  `manual-test.bike` follow from it.
- `app/state.ts` — pending count, the register, visual-mode state, the status bar indicator, settings.
- `app/motions.ts` — row navigation over visible rows; the *cover rows* of a selection.
- `app/operators.ts` — yank, delete, change, paste, insert, open.
- `app/main.ts` — commands, keybinding install / swap, editor observers.
- `tests/vim.test.ts` — runs inside Bike through `npm test`.

`manual-test.bike` is an outline with one checkbox per binding plus the awkward cases (deep nesting, a
collapsed subtree, an empty row, done tasks, first and last rows). Open it with `open -a "Bike 2"
manual-test.bike` and work through it after a change; Bike's Logs Explorer (with *vim-keybindings* checked)
shows any `[Vim]` errors.

Things learned about the Bike 2 (293) API on the way, in case you build on this:

- `new Outline(rows)` and `insertRows([row])` copy a row's text, type and attributes but not its children;
  the register is rebuilt level by level (`copyRows` in `operators.ts`).
- Assigning `row.text = …` crashes Bike; mutate through `row.text.replace(…)` instead.
- In `bike-ext test`, a command reached through `bike.commands.performCommand` from a test dies with
  `Fatal error: JSContext not available` as soon as it runs a transaction or shows a status message, so the
  tests call the handlers through a `context['vim'].perform` hook. Normal keybinding and CLI dispatch are
  unaffected.
- Key sequences use `control-`, not `ctrl-` (`ctrl-r` is silently ignored); `shift->` is the spelling for `>`.

## License

MIT — see [LICENSE](LICENSE).
