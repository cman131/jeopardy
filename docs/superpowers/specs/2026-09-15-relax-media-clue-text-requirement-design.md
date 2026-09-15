---
title: Relax text requirement for media clues
date: 2026-09-15
status: approved
---

## Summary

For clues of type `image`, `video`, or `audio`, the text/question field should be optional. Only `regular` (text) clues require a non-empty question. The text field remains available for all media clues as an optional caption.

## Motivation

Media clues communicate through their media URL. Requiring a text field forces authors to add redundant or placeholder text, and blocks saving/completion when the clue is fully expressed through its media alone.

## Scope

This is a minimal validation change — no structural or data-model changes. Existing boards with filled question fields are unaffected.

## Changes by layer

### Server — `server/src/models/Board.js`

- `clueSchema.question`: remove `required: true`
- `finalJeopardySchema.clue`: remove `required: true`

Both fields remain present in the schema as optional strings.

### Client completeness logic — `client/src/pages/EditorPage.jsx`

`isClueComplete` (line 32–35): replace blanket `cl.question` check with type-conditional:

```
type === 'regular'
  ? cl.question && cl.answer
  : cl.answer && (cl.mediaUrl || cl.mediaHash)
```

FJ completeness check (line 43) and FJ completion indicator (line 344): same conditional — `fj.clue` only required when `fjType === 'regular'`.

### Client grid — `client/src/components/BoardEditorGrid.jsx`

- `complete` check (line 38): same conditional as above
- Grid cell preview (line 60): when `clue.question` is empty, show just the media icon with no trailing text

### Editor labels — `BoardEditorGrid.jsx` ClueModal + `EditorPage.jsx` FJ editor

- "CLUE" label becomes "CLUE (optional)" when type is `image`, `video`, or `audio`

## Out of scope

- `validateBoardJson` in `boardImportUtils.js`: checks `'question' in cl` (key existence only, not value) — no change needed
- Game display logic: no changes
- DB migration: not needed; existing boards are unaffected
- Tests: existing `boardImportUtils.test.js` tests remain valid; new tests for `isClueComplete` behavior should be added if that function is unit-tested
