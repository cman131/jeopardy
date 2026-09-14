# Media Clues Design Spec

**Date:** 2026-09-14  
**Status:** Approved

## Overview

Expand Jeopardy clues from a single text-only type to three types: **Regular** (current behaviour), **Image** (text + embedded image), and **Video** (text + embedded YouTube video). All clue types — including Final Jeopardy — also gain an optional **answer image** that the host can reveal on the main display after a player buzzes in.

Media is referenced by URL only; nothing is uploaded to the server.

---

## 1. Data Model

### `clueSchema` additions (`server/src/models/Board.js`)

```js
type:        { type: String, enum: ['regular', 'image', 'video'], default: 'regular' }
mediaUrl:    { type: String }   // required when type is 'image' or 'video' (app-layer validated)
answerImage: { type: String }   // optional for all types
```

### `finalJeopardySchema` gets the same three fields

FJ already has `clue` (text). `type`/`mediaUrl` let it be an image or video clue; `answerImage` lets the host show a visual answer during FJ judging.

### Backward compatibility

Existing boards without a `type` field default to `'regular'` via the Mongoose schema default. No migration required.

---

## 2. Editor UI

### `BoardEditorGrid.jsx` — expanded cell

Current: CLUE textarea + ANSWER input.

New additions, in order:

1. **Type selector** — three small toggle buttons (`Regular | Image | Video`) at the top of the expanded cell, defaulting to `regular`.
2. **Media URL input** — visible only when type is `image` or `video`. Label: `IMAGE URL` or `YOUTUBE URL`. Positioned below the type selector, above the clue text.
3. **Answer Image URL input** — always visible, always optional. Label: `ANSWER IMAGE (optional)`. Positioned below the ANSWER input.

### Completeness check

A clue is complete when:
```
question && answer && (type === 'regular' || mediaUrl)
```
The answer image is never required.

### Collapsed cell preview

Non-regular clues display a small type badge (`📷` or `▶`) alongside the dollar value so board authors can see at a glance which cells have media.

### `EditorPage.jsx` — `countFilled`

Updated to use the same completeness formula so R1/R2 counters and the **Play** button gate work correctly.

### `FinalJeopardyTab`

Gains the same type selector, conditional media URL input, and optional answer image URL input. The FJ "complete" check also requires `(type === 'regular' || mediaUrl)`.

---

## 3. Game State & Socket Events

### `GameState.js` — `getPublicState()`

`currentClue` gains `type` and `mediaUrl` so the display can render the correct media. `answer` and `answerImage` are **not** in the public state — host-only.

### `GameState.js` — `getHostState()`

`currentClue` additionally includes `answer` (already present) and `answerImage` (new).

### Final Jeopardy events

`game:finalClue` gains `type` and `mediaUrl` so the display can render FJ media during the answer-writing phase.

`game:finalJudgingReady` gains `fjAnswerImage` from `board.finalJeopardy.answerImage` for the host's reference during judging.

### New socket event — `host:revealAnswer`

- **Direction:** host client → server → broadcast to game room
- **When available:** only during `judging` phase (server validates)
- **Server action:** looks up `answer` and `answerImage` from the current clue on the board; broadcasts `game:answerRevealed { answer, answerImage }` to the room
- **Display effect:** answer text and answer image are added to the current clue view (no phase change — this is additive state within the existing `judging` phase)
- **Host trigger:** a **"Reveal Answer"** button that appears on the host clue panel only when `currentClue.answerImage` is set; button disables after first click to prevent double-emit

### FJ answer image

Shown in the host panel during `final-judging` only. No display-side trigger for FJ (the FJ reveal flow is already complex; per-player reveal cards are the existing display mechanism).

---

## 4. Display UI (`DisplayPage.jsx`)

### `ClueDisplay`

After the question text:
- `type === 'image'`: render `<img src={mediaUrl}>` below the question text
- `type === 'video'`: extract YouTube video ID from the URL; render a `<iframe>` embed below the question text
- `type === 'regular'`: no change

On `game:answerRevealed`:
- Answer text appears below the media (or below the question text for Regular clues)
- Answer image appears below the answer text
- This state persists until the host judges (phase transitions to `board`)

### `DisplayFinalClue`

Updated to render `fjType`/`fjMediaUrl` the same way — image or YouTube iframe below the FJ clue text.

---

## 5. Host UI (`HostPage.jsx`)

### Clue panel

- Clue media (image or iframe) rendered below the question text — same logic as the display, so the host can preview what the audience sees
- Answer image rendered below the answer text
- **"Reveal Answer"** button (visible only when `currentClue.answerImage` is set); emits `host:revealAnswer`; disables after click

### Final Jeopardy judging panel

`fjAnswerImage` (from `game:finalJudgingReady`) is shown below the FJ answer text for the host's reference.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `server/src/models/Board.js` | Add `type`, `mediaUrl`, `answerImage` to `clueSchema` and `finalJeopardySchema` |
| `server/src/game/GameState.js` | Expose `type`, `mediaUrl` in public state; `answerImage` in host state; FJ events |
| `server/src/sockets/gameHandlers.js` | Add `host:revealAnswer` handler; include `type`/`mediaUrl` in `game:finalClue`; include `fjAnswerImage` in `game:finalJudgingReady` |
| `client/src/components/BoardEditorGrid.jsx` | Type selector, conditional media URL input, answer image input, completeness check, badge |
| `client/src/pages/EditorPage.jsx` | Update `countFilled`, update `FinalJeopardyTab` |
| `client/src/pages/DisplayPage.jsx` | Render clue media in `ClueDisplay`; handle `game:answerRevealed`; render FJ media in `DisplayFinalClue` |
| `client/src/pages/HostPage.jsx` | Render clue media, answer image, "Reveal Answer" button; FJ answer image in judging panel |

---

## 7. Out of Scope

- File upload (media is URL-only)
- Non-YouTube video sources
- Answer image on the display for Final Jeopardy (host panel only)
- Image/video on the answer side for the scoreboard or game-over screens
