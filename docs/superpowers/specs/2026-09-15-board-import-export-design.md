# Board Import / Export Design

**Date:** 2026-09-15  
**Status:** Approved

## Overview

Enhance the board editor's existing import/export sidebar buttons to support two import formats: our native JSON and Buzzinga CSV exports. Export remains JSON-only. Parsing is client-side in a dedicated utility module. A new `mediaHash` field and `audio` clue type are added to the data model to hold Buzzinga content hashes that cannot be resolved to URLs.

---

## Section 1: Schema & Data Model

### `server/src/models/Board.js`

`clueSchema` changes:
- `type` enum: add `'audio'` alongside existing `'regular'`, `'image'`, `'video'`
- New optional field: `mediaHash: { type: String }` — holds a Buzzinga content hash when a real URL is unavailable

`finalJeopardySchema` gets the same `mediaHash` field.

`emptyBoard()` in `EditorPage.jsx` gains `mediaHash: ''` on each clue and on `finalJeopardy`. `validateBoardJson` stays permissive on optional fields (mediaHash is optional, audio is a valid type).

---

## Section 2: Import Utility

**File:** `client/src/utils/boardImportUtils.js`

### `parseBuzzingaCsv(csvText) → { board, warnings }`

Uses PapaParse to handle quoted multi-line fields. Transformation logic:

| Buzzinga `clueType` | Our `type` | `question` source | `mediaUrl` | `mediaHash` |
|---|---|---|---|---|
| TEXT | `regular` | `clueText` | — | — |
| IMAGE | `image` | `topCaption \|\| ''` | — | `clueText` |
| VIDEO | `video` | `topCaption \|\| ''` | `clueText` | — |
| AUDIO | `audio` | `topCaption \|\| ''` | — | `clueText` |

Round mapping:
- `round=1` rows → `round1` (sorted by `col` 1–6, then `row` 1–5)
- `round=2` rows → `round2`
- `round=final` row → `finalJeopardy` (`cat`→`category`, `clueText`→`clue`, `correctResponse`→`answer`)

Blank separator rows (all-empty columns) are skipped.

Returns `{ board, warnings }` where `warnings` is the count of clues that have a `mediaHash` (IMAGE or AUDIO clues).

### `validateBoardJson(data) → boolean`

Moved from `EditorPage.jsx`. Same logic: requires `round1`, `round2`, and `finalJeopardy`; rejects old single-round format; accepts optional fields.

### Dependency

Add `papaparse` to `client/package.json`.

---

## Section 3: Import Modal

**File:** `client/src/components/ImportBoardModal.jsx`

A modal overlay component. Props: `onImport(board, warnings)`, `onClose`.

**Contents:**
- Radio group: "Our JSON format" (default) / "Buzzinga CSV"
- File input: accepts `.json` when JSON selected, `.csv` when Buzzinga selected
- Import button: disabled until a file is chosen
- Inline error display for parse/validation failures

**Behavior:**
- Reads the file via `FileReader`
- Calls `validateBoardJson` or `parseBuzzingaCsv` depending on selected format
- On success: calls `onImport(board, warnings)` and the parent closes the modal
- On failure: shows inline error, modal stays open

The modal owns all parsing and error state. `EditorPage` only receives a valid board object.

---

## Section 4: `EditorPage.jsx` Changes

- Add `showImportModal` boolean state
- Add `importWarnings` number state (count of hashed clues, 0 = no banner)
- Replace `importJson()` function body and its sidebar button with a toggle that sets `showImportModal = true`
- Add `onImport(board, warnings)` handler:
  - `setBoard(board)`
  - `setActiveBoardId(null)`
  - `setDirty(true)`
  - `setImportWarnings(warnings)`
  - `setShowImportModal(false)`
  - `setActiveTab('round1')`
- Render `<ImportBoardModal>` when `showImportModal` is true
- Add dismissible yellow warning banner (shown when `importWarnings > 0`):  
  *"X clue(s) imported with Buzzinga media hashes — open those clues and replace the hash with a real URL to use image/audio/video media."*
- `exportJson()` function unchanged; sidebar button label updated to "⬇ Export Board (JSON)"

---

## Out of Scope

- Server-side import endpoint
- Resolving Buzzinga content hashes to real URLs
- Importing `isDailyDouble`, category descriptions, or caption metadata from Buzzinga CSV
- Audio playback support in the game (audio type is stored but not rendered in game views yet)
