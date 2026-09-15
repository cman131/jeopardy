# Correctness Audit: 9-Fix Design

**Date:** 2026-09-15  
**Scope:** Fix all correctness gaps identified in a full audit of GameState.js, gameHandlers.js, HostPage, DisplayPage, and PlayerPage.

---

## Background

An audit of the full game flow identified 9 correctness gaps: 2 high-severity functional bugs, 3 medium-severity state/UX issues, and 4 low-severity dead code / cosmetic issues. All 9 are in scope.

---

## Fix Inventory

### 1 — Reveal Answer button hidden for text-only clues [HIGH]

**File:** `client/src/pages/HostPage.jsx` — `HostClue`

**Problem:** The "Reveal Answer on Display" button only renders when `clueData.answerImage` exists. Text-only answers can never be pushed to the TV display, even though the server handler (`host:revealAnswer`) works correctly and `game:answerRevealed` already sends both `answer` text and `answerImage`.

**Fix:** Remove the `clueData.answerImage &&` guard from the button's render condition. The button is shown whenever `phase === 'judging'` and `clueData` exists. Update label to "Reveal Answer on Display" (remove the 🖼 emoji guard that implied image-only).

---

### 2 — No "Play Video" control for Final Jeopardy [HIGH]

**Files:** `client/src/pages/HostPage.jsx` — `HostFinalClue` + `client/src/pages/DisplayPage.jsx` — `DisplayFinalClue`

**Problem:** `DisplayFinalClue` renders `<ClueMedia>` without the `videoReady` prop (defaults to `true`), so FJ video clues autoplay immediately when `game:finalClue` arrives — before players have time to enter answers. Regular clues require host to click "Play Video on Display" first.

**Fix:**
- **DisplayPage:** In the `game:finalClue` socket handler, add `videoPlaying: false` to reset any stale flag from a prior regular-clue phase. In `DisplayFinalClue`, pass `videoReady={game.fjType === 'video' ? game.videoPlaying : true}` to `<ClueMedia>`.
- **HostPage:** Pass an `onPlayVideo` prop to `HostFinalClue` from the phase dispatcher (same pattern as `HostClue`). `onPlayVideo` emits `host:playVideo` and sets `videoPlayed: true` on game state via the inline callback — no separate socket listener needed, since the host is the one triggering playback. Reset `videoPlayed: false` in the `game:finalClue` handler. Inside `HostFinalClue`, render the Play Video button when `game.fjType === 'video'`, mirroring the `HostClue` implementation.

No new socket events needed — `host:playVideo` and `game:videoPlay` are reused as-is.

---

### 3 — Host reconnect loses judgments during Final Judging [MED]

**Files:** `server/src/game/GameState.js` — `getHostState()` + `client/src/pages/HostPage.jsx`

**Problem:** The `judgments` map in `HostPage` is local React state. If the host disconnects and rejoins during `final-judging`, all players appear un-judged. Re-clicking judge fires `host:judgeFinal` which the server rejects ("Player already judged") silently — the host has no recovery path.

**Fix:**
- **GameState:** In `getHostState()`, alongside the existing `finalAnswers`/`finalWagers` block for `final-judging`, also add `state.finalJudgments = Object.fromEntries(this.finalJudgments)`.
- **HostPage:** In the `host:joined` socket handler, after `setGame(state)`, call `setJudgments(state.finalJudgments || {})` so a reconnecting host sees which players are already judged.

---

### 4 — Final Reveal: no running score shown on Display [MED]

**File:** `client/src/pages/DisplayPage.jsx` — `DisplayFinalReveal` + `RevealCard`

**Problem:** Each `RevealCard` shows name/wager/answer/delta but not the player's new total score. The `players` array (with updated scores) is already delivered in every `game:finalReveal` event but is not rendered.

**Fix:** In `DisplayFinalReveal`, look up each revealed player in `game.players` and pass `finalScore={player?.score}` to `RevealCard`. In `RevealCard`, add a 4th animated stage (e.g. `setTimeout` at 3200ms) that renders the total: `Total: $X` in `var(--color-amber)`. Score is the post-reveal value since `game.players` is updated by the event that triggers the reveal.

---

### 5 — HostFinalReveal "Reveal Next" has no remaining count [LOW]

**File:** `client/src/pages/HostPage.jsx` — `HostFinalReveal`

**Problem:** The button reads "Reveal Next →" with no indication of how many players remain.

**Fix:** Change button label to `Reveal Next ({revealed.length + 1} of {(game.players || []).length}) →`.

---

### 6 — Dead `game:clueSkipped` listeners [LOW]

**Files:** `client/src/pages/DisplayPage.jsx`, `client/src/pages/PlayerPage.jsx`

**Problem:** Both pages listen for `game:clueSkipped` but the server never emits it. Skips emit `game:scored` instead, which both pages already handle correctly.

**Fix:** Delete the `socket.on('game:clueSkipped', ...)` handler from both files.

---

### 7 — Dead `buzzedPlayers` state in DisplayPage [LOW]

**File:** `client/src/pages/DisplayPage.jsx`

**Problem:** The `game:wrongAnswer` handler stores `buzzedPlayers` in DisplayPage state but nothing in DisplayPage reads it. Only PlayerPage uses it (to grey out buzzers for players who already answered incorrectly).

**Fix:** Remove `buzzedPlayers: buzzedPlayers || []` from the `game:wrongAnswer` state update in DisplayPage.

---

### 8 — Player rejoin incomplete for FJ phases [LOW]

**Files:** `server/src/sockets/gameHandlers.js` — `player:rejoin` handler + `client/src/pages/PlayerPage.jsx`

**Problem:** The rejoin payload sends `fjClue` for FJ phases but omits `fjType` and `fjMediaUrl`. The player state after rejoin is incomplete.

**Fix:**
- **Server:** Add `fjType` and `fjMediaUrl` to the `player:rejoined` emit, sourced from `entry.state.board.finalJeopardy`, guarded by the same `fjPhases.includes(pub.phase)` condition.
- **PlayerPage:** Read `gs.fjType` and `gs.fjMediaUrl` from the `player:rejoined` payload in the `socket.once('player:rejoined', ...)` handler and set them on game state.

---

### 9 — Wager confirmation shows raw input string [LOW]

**File:** `client/src/pages/PlayerPage.jsx`

**Problem:** After submitting a wager, the confirmation reads `Wager locked in! ${wagerInput}` where `wagerInput` is the raw string from the number input.

**Fix:** Change to `parseInt(wagerInput, 10)`. The input is validated as a valid integer before submission, so this always produces a clean number.

---

## Files Changed

| File | Fixes |
|------|-------|
| `server/src/game/GameState.js` | #3 |
| `server/src/sockets/gameHandlers.js` | #8 |
| `client/src/pages/HostPage.jsx` | #1, #2, #3, #5 |
| `client/src/pages/DisplayPage.jsx` | #2, #4, #6, #7 |
| `client/src/pages/PlayerPage.jsx` | #6, #8, #9 |

## No Changes Needed

- `client/src/components/ClueMedia.jsx` — works correctly; callers just need to pass `videoReady` properly

## Out of Scope

- Daily Double support
- Buzzer/answer timers
- Single-player game support (minimum 2 players enforced)
