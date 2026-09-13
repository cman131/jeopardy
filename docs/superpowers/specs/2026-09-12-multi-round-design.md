# Multi-Round Jeopardy — Design Spec

**Date:** 2026-09-12
**Builds on:** `docs/superpowers/specs/2026-09-12-jeopardy-design.md`

---

## Overview

Expand the game from a single-round format to three rounds: Round 1 (Jeopardy), Round 2 (Double Jeopardy), and Final Jeopardy. Round 1 and Round 2 play identically to the existing single-round game. Final Jeopardy adds a wager phase, a clue reveal, a written answer phase, host judging, and a dramatic sequential reveal of results. All three rounds are authored together in a single board document.

---

## Data Model

### Board schema (breaking change — existing boards must be deleted or migrated)

```
{
  _id: ObjectId,
  name: String,
  createdAt: Date,
  round1: {
    categories: [   // exactly 6
      {
        name: String,
        clues: [    // exactly 5
          { question: String, answer: String }
        ]
      }
    ]
  },
  round2: {
    categories: [   // exactly 6, same shape
      {
        name: String,
        clues: [    // exactly 5
          { question: String, answer: String }
        ]
      }
    ]
  },
  finalJeopardy: {
    category: String,
    clue: String,
    answer: String
  }
}
```

Clue values are **computed from position, never stored**:
- Round 1 clue index 0–4 → $200, $400, $600, $800, $1000
- Round 2 clue index 0–4 → $400, $800, $1200, $1600, $2000

A board is complete (and playable) when all 30 Round 1 clues, all 30 Round 2 clues, and the Final Jeopardy clue are filled.

### Game schema additions

```
revealedClues: [
  { round: 1 | 2, categoryIndex: Number, clueIndex: Number }
]

finalJeopardy: [     // one entry per player, populated progressively
  {
    playerName: String,
    wager: Number,
    answer: String,
    correct: Boolean | null   // null until judged
  }
]
```

### In-memory GameState additions

```
currentRound: 1 | 2
finalWagers: Map<playerName, number>      // collected during final-wager phase
finalAnswers: Map<playerName, string>     // collected during final-clue phase
finalJudgments: Map<playerName, boolean>  // host correct/incorrect per player
finalRevealOrder: [playerName]            // ascending score order at end of r2
finalRevealIndex: number                  // next player to reveal (0-based)
```

---

## State Machine

### Full phase sequence

```
LOBBY → BOARD(r1) → CLUE → JUDGING → BOARD(r1) → ...
→ BETWEEN-ROUNDS
→ BOARD(r2) → CLUE → JUDGING → BOARD(r2) → ...
→ FINAL-WAGER → FINAL-CLUE → FINAL-JUDGING → FINAL-REVEAL → FINISHED
```

The existing `lobby → board → clue → judging` cycle is unchanged and reused for both Round 1 and Round 2. `currentRound` tracks which board's categories are active.

### New transitions

| From | Trigger | To | Effect |
|---|---|---|---|
| `board` (r1, all 30 clues revealed) | auto | `between-rounds` | Interstitial shown; scores visible to all clients |
| `between-rounds` | `host:startRound2` | `board` (r2) | `currentRound → 2`; board resets to fresh r2 grid; first picker = player with highest score |
| `board` (r2, all 30 clues revealed) | auto | `final-wager` | FJ category shown; players enter wager on device |
| `final-wager` | all wagers submitted | auto → `final-clue` | Wagers locked; FJ clue revealed |
| `final-wager` | `host:closeWagers` | `final-clue` | Force-advances; missing wagers default to $0 |
| `final-clue` | all answers submitted | auto → `final-judging` | Answers locked; host sees all answers |
| `final-clue` | `host:closeAnswers` | `final-judging` | Force-advances; missing answers default to blank |
| `final-judging` | all players judged | `final-reveal` | `finalRevealOrder` computed (ascending score); `finalRevealIndex = 0` |
| `final-reveal` | `host:revealNext` (×N players) | `finished` (after last) | Each call reveals wager → answer → result for next player; score updates on result reveal |

### Buzzer and clue-picker rules for Round 2

Identical to Round 1. The picker at Round 2 start is the player with the highest score at end of Round 1 (ties broken by join order).

### Wager constraints (enforced server-side)

```
min: 0
max: Math.max(player.score, 1000)
```

### Reveal order

Players are sorted ascending by score at the moment Round 2 ends (lowest score revealed first, matching the real show). Ties broken by join order (earlier = revealed earlier).

---

## Board Editor

### Tab structure

The editor gains three tabs: **Round 1**, **Round 2**, **Final Jeopardy**. Active tab defaults to Round 1. Switching tabs preserves unsaved changes in memory. The existing unsaved-changes navigation guard still applies.

### Round 1 / Round 2 tabs

Identical layout to the current 6×5 grid editor. Changes:
- Clue value labels are **static** (no input) — shown as `$200`, `$400`, etc. for R1 and `$400`, `$800`, etc. for R2
- The `value` field is removed from the clue schema; editors and server compute value from `(clueIndex + 1) * (currentRound === 1 ? 200 : 400)`
- A small round badge ("ROUND 1" / "ROUND 2") appears in the tab header

### Final Jeopardy tab

A compact single-clue form:
- Category name input
- Clue textarea
- Answer input

### Completion indicator

Updated to show progress across all three sections:

```
R1: 30/30  ·  R2: 18/30  ·  FJ: 0/1
```

The Play button is blocked until all 61 items are complete (R1: 30, R2: 30, FJ: 1).

### Import / Export JSON

Exports the full board document in the new schema shape. Importing a JSON file in the old single-round format shows a clear error rather than silently mis-loading.

---

## Client Views

### Between-Rounds interstitial

- **Display & host:** leaderboard showing all players and current scores, prominent "DOUBLE JEOPARDY" banner
- **Host:** "Start Round 2" button below the leaderboard
- **Players:** "Get ready for Double Jeopardy!" waiting screen with current scores

### Round 2 board

Identical to Round 1 board view. Differences:
- Clue values displayed as $400–$2000
- Header badge reads "ROUND 2 — DOUBLE JEOPARDY"

### Final Jeopardy — Wager phase

- **Display:** category name large, "Place your wagers!" message, per-player submission chips (✓ submitted / ⏳ waiting) — no amounts shown
- **Host:** same as display + wager count ("3/4 submitted") + "Close Wagers" override button
- **Player (not yet submitted):** category name, wager number input (constrained to valid range), Submit Wager button
- **Player (submitted):** "Wager locked in! $[amount]" confirmation

### Final Jeopardy — Clue phase

- **Display:** category header + clue text large, "Write your answers!" message, per-player answer submission chips
- **Host:** clue + answer always visible, answer submission count, "Close Answers" override button
- **Player (not yet submitted):** clue text, answer text input, Submit Answer button
- **Player (submitted):** "Answer locked in!" confirmation

### Final Jeopardy — Judging phase (host only)

- Host sees a list: player name + their answer, with Correct / Incorrect buttons per player
- Once all players judged, "Begin Reveal" button appears
- Display and players see a "Judging in progress..." holding screen

### Final Jeopardy — Reveal phase

- **Display & players:** one player card at a time. When the host taps "Reveal Next", the client receives all three values at once (`wager`, `answer`, `correct`) and animates them into view sequentially with short delays: wager first, then answer, then result. The host button does **not** control individual steps — it advances to the next player. After all players are revealed, the host sees "See Final Scores" which transitions to finished.
- Score updates live on the display when `correct` is revealed for each player.
- **Player:** their own card highlights when it's their turn to be revealed

### Finished screen

Unchanged from current implementation.

---

## Socket.io Events

### New client → server

| Event | Payload | Who |
|---|---|---|
| `host:startRound2` | — | Host |
| `player:submitWager` | `{ wager: number }` | Player |
| `host:closeWagers` | — | Host |
| `player:submitAnswer` | `{ answer: string }` | Player |
| `host:closeAnswers` | — | Host |
| `host:judgeFinal` | `{ playerName, correct: boolean }` | Host |
| `host:revealNext` | — | Host |

### New server → client

| Event | Payload | Notes |
|---|---|---|
| `game:betweenRounds` | `{ players }` | All clients; triggers interstitial |
| `game:round2Started` | `{ board, currentPicker }` | All clients; board is r2 category names |
| `game:finalWager` | `{ category }` | All clients; triggers wager phase |
| `game:wagerSubmitted` | `{ playerName }` | Host + display only (no amount) |
| `game:finalClue` | `{ category, clue }` | All clients; triggers answer phase |
| `game:answerSubmitted` | `{ playerName }` | Host + display only (no answer text) |
| `game:finalJudgingReady` | `{ answers: [{ playerName, answer }] }` | Host only |
| `game:finalReveal` | `{ playerName, wager, answer, correct, players }` | All clients; `players` has updated scores after `correct` is set |
| `game:finished` | `{ players }` | Existing event; fires after last reveal |

---

## REST API

No new endpoints. `POST /api/games` still accepts a `boardId` and returns a `gameCode`. `GET /api/boards/:id` returns the full new board shape.

---

## Error Handling

- **Player disconnects during final-wager or final-clue** — their slot is preserved. If they reconnect before `host:closeWagers` / `host:closeAnswers`, they can still submit. If the host force-closes, defaults apply ($0 wager, blank answer).
- **Host judges a disconnected player** — allowed; result is recorded, score updates on reveal.
- **Wager out of range** — server rejects with `error:generic`; client should pre-validate but server is authoritative.

---

## Testing

- **Unit tests:** extend `GameState` tests to cover round transitions (`between-rounds`, `final-wager` → `final-clue` → `final-judging` → `final-reveal`), wager constraint enforcement, reveal ordering
- **Integration tests:** extend game flow tests to run a full 3-round game through socket events
- **No new frontend component tests** — manual validation as before
