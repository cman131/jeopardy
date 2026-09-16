# Answering Flow Redesign

**Date:** 2026-09-15  
**Status:** Approved

## Problem

The current answering flow has two friction points:

1. After a correct answer, the host must manually click "Reveal Answer on Display" before judging. This is an unnecessary step — the answer should just show automatically.
2. After a wrong answer, buzzers are locked on all clients even though the server already has `buzzerState: 'open'`. The host must click "Unlock Buzzers" again. This is broken: `GameState.unlock()` throws when buzzerState is already 'open', so the click silently fails and buzzers get permanently stuck locked for the rest of the clue.

## Goals

- Remove the "Reveal Answer" button from the host judging UI.
- On a correct answer: auto-reveal the answer on the display, then let the host hit "Back to Board" when ready.
- On a wrong answer: buzzers automatically stay open for all other players — no host action needed.
- The player who answered wrong remains blocked from buzzing (already tracked via `buzzedPlayers`).

## Approach: `boardReady` flag on `'judging'` phase (Option B)

Keep `phase: 'judging'` but add a `boardReady` boolean flag. `judge(correct)` sets the flag without advancing to the board; a new `host:backToBoard` event triggers the actual phase transition. This minimises changes to the display and player pages, which already render `'judging'` correctly.

---

## GameState (`server/src/game/GameState.js`)

- Add `this.boardReady = false` to constructor.
- `judge(correct)`: score the player as today, then set `this.boardReady = true`. **Do not** call `_closeClue()`.
- New `backToBoard()` method: assert `phase === 'judging' && boardReady`, then call `_closeClue()`. `_closeClue()` handles all downstream phase transitions (board / between-rounds / final-wager / finished) unchanged.
- `_closeClue()`: reset `this.boardReady = false` at entry.
- `getPublicState()` and `getHostState()`: include `boardReady: this.boardReady`.

The incorrect path in `judge()` is **unchanged** — `buzzerState` is already set to `'open'` server-side after a wrong answer. The bug was entirely on the client side.

---

## Server Sockets (`server/src/sockets/gameHandlers.js`)

### `host:judge` — correct path
1. Call `entry.state.judge('correct')`.
2. Persist the judged player's updated score to DB (same as today).
3. Emit `game:answerRevealed` to the room: `{ answer, answerImage }` — auto-reveal, no button needed.
4. Emit `game:boardReady` to the room: `{ players }` (updated scores).

### `host:judge` — incorrect path
No changes. Server-side state is already correct.

### New: `host:backToBoard`
1. Call `entry.state.backToBoard()`.
2. Persist `revealedClues` to DB.
3. Fan out the same events as the current correct path: `game:scored`, `game:betweenRounds`, `game:finalWager`, or `game:finished` depending on the resulting phase.

### Remove: `host:revealAnswer`
This handler is no longer needed.

---

## Client: HostPage (`client/src/pages/HostPage.jsx`)

### Socket listeners
- `game:wrongAnswer`: change `buzzerState: 'locked'` → `buzzerState: 'open'`.
- New `game:boardReady` listener: `setGame(g => ({ ...g, boardReady: true, players }))`.
- `game:scored`: add `boardReady: false` to the reset (alongside existing `answerRevealed: false`).

### `HostClue` component — judging phase
- **Remove** the "Reveal Answer on Display" button entirely.
- When `!boardReady`: show Correct + Incorrect buttons as today.
- When `boardReady`: show only a "← Back to Board" button that emits `host:backToBoard`. The answer is already visible in the always-present green answer box on the host view.

---

## Client: PlayerPage (`client/src/pages/PlayerPage.jsx`)

- `game:wrongAnswer` handler: change `buzzerState: 'locked'` → `buzzerState: 'open'`.
- The wrong-answerer is still blocked by `myBuzzedOut: true`; other players' buzzers become tappable immediately.

---

## Client: DisplayPage (`client/src/pages/DisplayPage.jsx`)

- `game:wrongAnswer` handler: change `buzzerState: 'locked'` → `buzzerState: 'open'`. The buzzer status indicator correctly shows "BUZZERS OPEN" (green) after a wrong answer.
- New `game:boardReady` listener: update `players` so scores are current before `game:scored` arrives.
- No phase changes needed — display stays in `'judging'` until `game:scored`, and the existing `game:answerRevealed` listener handles showing the answer.

---

## Edge Cases

- **Auto-skip (all players buzzed wrong):** `GameState.judge(incorrect)` already calls `_closeClue()` when `buzzedPlayers.length >= players.length`. Server emits `game:wrongAnswer` then immediately emits `game:scored`/`game:betweenRounds`/etc. The rapid sequence is fine — display briefly sets buzzerState open then transitions to board.
- **Host reconnect during `boardReady`:** `host:joined` sends `getHostState()` which now includes `boardReady: true`. HostPage initialises `boardReady` from `state.boardReady` in the `host:joined` handler (same pattern as other flags).
- **Display/player reconnect during `boardReady`:** Public state includes `boardReady: true`. Display stays in `'judging'` rendering, which is correct. Player stays in `'judging'` with buzzer locked (buzzedBy is still set), which is correct.
