# Jeopardy Application — Design Spec

**Date:** 2026-09-12
**Stack:** Node.js + Express + Socket.io + React (Vite) + MongoDB (Mongoose)

---

## Overview

A real-time multiplayer Jeopardy application supporting 2–6 players in hybrid play (in-person or remote). A host controls the game flow; players join via a short game code on their phones or laptops. A separate display screen shows the board and scores on a shared TV. Question sets are created and managed via a built-in board editor with JSON import/export.

---

## Architecture

Three client types connect to a single Node.js server over WebSocket (Socket.io) and REST:

- **Display screen** — TV/projector showing the game board, active clue, and live scores
- **Host panel** — host's device controlling game flow (select clues, unlock buzzers, judge answers)
- **Player device** — each player's phone or laptop with a buzzer button and score display

The server holds active game state in memory during play for low-latency buzzer handling. MongoDB is used for durable storage of boards and completed game sessions. Socket.io rooms map one-to-one with games.

---

## Data Model

### `boards` collection

Stores reusable question set templates. Categories and clues are embedded — a board is always read as a whole.

```
{
  _id: ObjectId,
  name: String,
  createdAt: Date,
  categories: [                  // exactly 6
    {
      name: String,
      clues: [                   // exactly 5
        {
          question: String,
          answer: String,
          value: 200 | 400 | 600 | 800 | 1000
        }
      ]
    }
  ]
}
```

A board is only playable when all 30 clues are filled. The editor enforces this with a completion indicator and blocks the Play button on incomplete boards.

### `games` collection

One document per game session. Players are embedded. Score history is appended on every judge event so game history is durable even if the server crashes mid-game.

```
{
  _id: ObjectId,
  boardId: ObjectId,             // ref → boards
  gameCode: String,              // short human-readable join code, e.g. "KZBT"
  status: "lobby" | "active" | "finished",
  createdAt: Date,
  completedAt: Date,             // set when status → finished
  players: [
    {
      name: String,
      score: Number,             // running total
      scoreHistory: [
        {
          categoryIndex: Number,
          clueIndex: Number,
          clueValue: Number,
          result: "correct" | "incorrect",
          delta: Number,         // positive for correct, negative for incorrect
          timestamp: Date
        }
      ]
    }
  ],
  revealedClues: [
    { categoryIndex: Number, clueIndex: Number }
  ]
}
```

### In-memory game state (per active game, server-side only)

```
{
  currentClue: { categoryIndex, clueIndex } | null,
  buzzerState: "locked" | "open" | "claimed",
  buzzedBy: playerName | null,
  buzzedPlayers: [playerName],   // players who have already buzzed on current clue
  phase: "lobby" | "board" | "clue" | "judging" | "finished",
  currentPicker: playerName      // who selects the next clue
}
```

---

## Game State Machine

### Phases

**LOBBY** → **BOARD** → **CLUE** → **JUDGING** → back to **BOARD** (repeat) → **FINISHED**

### Transitions and Socket.io events

| From | Event | To | Effect |
|---|---|---|---|
| LOBBY | `host:startGame` | BOARD | All clients receive `game:started`; first player in join order becomes `currentPicker` |
| BOARD | `host:selectClue` | CLUE | Clue revealed on display; buzzers locked; `currentPicker` cleared |
| CLUE | `host:unlock` | CLUE (open) | `buzzerState → open`; all players receive `game:buzzersOpen` |
| CLUE (open) | `player:buzz` (first) | JUDGING | `buzzerState → claimed`; `buzzedBy` set; all clients receive `game:buzzClaimed` |
| JUDGING | `host:judge("correct")` | BOARD | Score +clueValue; history entry appended; `currentPicker → buzzedBy`; clue marked revealed |
| JUDGING | `host:judge("incorrect")` | CLUE (open) | Score -clueValue; history entry appended; buzzers re-open excluding `buzzedBy`; other players can buzz |
| CLUE | `host:skipClue` | BOARD | Clue marked revealed; `currentPicker` unchanged |
| any | `host:endGame` | FINISHED | Game persisted; all clients receive `game:finished` |
| BOARD | auto | FINISHED | Triggered when all 30 clues are in `revealedClues` |

### Buzzer rules (enforced server-side)

- Buzzers start **locked** when a clue is revealed
- Host explicitly sends `host:unlock` when ready
- First `player:buzz` received wins — all subsequent buzzes on the same unlock window are ignored
- On incorrect answer, buzzers re-open but the player who just answered is excluded for that clue
- A player can only buzz once per clue regardless of how many incorrect answers others give
- When all players have been excluded from a clue (everyone buzzed in and got it wrong), the server automatically skips the clue — marks it revealed, returns to BOARD, picker unchanged

### Clue picker rules

- Game start: first player in join order picks
- After a correct answer: the answering player becomes picker
- After a skip or all-incorrect: picker stays the same
- The host can always override and select any clue directly

---

## Client Views

### Lobby
- **Display screen:** large game code (e.g. "KZBT"), player chips appearing as players join, URL to join
- **Host panel:** game code, board name, connected player list with connection status, Start Game button (requires ≥2 players)
- **Player device:** join form (game code + name), then waiting screen showing who else has joined

### Board phase
- **Display screen:** 6×5 board (revealed clues darkened), score chips at bottom with current picker highlighted in gold with "SELECTING" badge
- **Host panel:** full board (same dimensions as display, full category names), picker banner at top ("Alice is selecting the next clue"), scores + End Game button below
- **Player device (picker):** "Your turn to pick a clue!" banner, locked buzzer, mini scoreboard
- **Player device (others):** waiting message, locked buzzer, mini scoreboard

### Clue phase
- **Display screen:** category + value header, clue text large, "BUZZERS LOCKED" indicator, score chips
- **Host panel:** clue text + answer (always visible to host), "Unlock Buzzers" button, "Skip Clue" button
- **Player device:** clue text, locked buzzer with lock indicator

### Judging phase
- **Display screen:** clue text, winner banner (player name + "buzzed in first!"), winner's score chip highlighted
- **Host panel:** winner name, answer, large "Correct (+$X)" and "Incorrect (-$X)" buttons
- **Player device (winner):** "You buzzed in! Answer out loud", waiting for host to judge
- **Player device (others):** winner name + "is answering...", buzzer locked

### Board editor
- **Left sidebar:** list of saved boards, New Board button, Import JSON / Export JSON
- **Main area:** board name (editable), 6 category columns each with 5 clue cells; clicking a cell expands it inline showing clue textarea and answer input; collapsed cells show value + checkmark
- **Toolbar:** Save and Play buttons; Play creates a new game and sends host to lobby
- **Completion bar:** progress indicator showing clues filled (e.g. 23/30); board is unplayable until 30/30

---

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/api/boards` | List all boards |
| POST | `/api/boards` | Create board |
| GET | `/api/boards/:id` | Get board |
| PUT | `/api/boards/:id` | Update board |
| DELETE | `/api/boards/:id` | Delete board |
| POST | `/api/games` | Create game from board (returns gameCode) |
| GET | `/api/games/:gameCode` | Get game state (for reconnects) |
| GET | `/api/games/:id/history` | Get completed game with full score history |

---

## Socket.io Events

### Client → Server
| Event | Payload | Who sends |
|---|---|---|
| `player:join` | `{ gameCode, name }` | Player |
| `host:startGame` | `{ gameCode }` | Host |
| `host:selectClue` | `{ categoryIndex, clueIndex }` | Host |
| `host:unlock` | — | Host |
| `player:buzz` | — | Player |
| `host:judge` | `{ result: "correct" \| "incorrect" }` | Host |
| `host:skipClue` | — | Host |
| `host:endGame` | — | Host |

### Server → Client (broadcast to room)
| Event | Payload |
|---|---|
| `game:playerJoined` | `{ players }` |
| `game:started` | `{ board, players, currentPicker }` |
| `game:clueRevealed` | `{ categoryIndex, clueIndex, question, value }` |
| `game:buzzersOpen` | — |
| `game:buzzClaimed` | `{ playerName }` |
| `game:scored` | `{ players, currentPicker, revealedClues }` |
| `game:clueSkipped` | `{ revealedClues, currentPicker }` |
| `game:finished` | `{ players }` |
| `error:gameNotFound` | — |
| `error:nameTaken` | — |

---

## Error Handling

- **Player disconnects mid-game** — Socket.io detects disconnect; player slot and score are preserved. They can rejoin with the same name and game code. If the buzzer winner disconnects during judging, the host sees a notice and can manually skip or award the clue.
- **Host disconnects** — game pauses; display screen shows "Host disconnected, waiting to reconnect." In-memory state is preserved; host rejoins and resumes.
- **Server restart** — in-memory game state is lost (acceptable for v1). Score history up to the last judge event is persisted in MongoDB.
- **Duplicate buzz** — server ignores any `player:buzz` received after `buzzerState` is `claimed`. Client buzzer state is visual only; lock is enforced server-side.
- **Invalid game code** — join attempt emits `error:gameNotFound` back to the requesting socket.
- **Duplicate player name** — join attempt emits `error:nameTaken`.

---

## Testing

- **Unit tests (Jest):** game state machine — phase transitions, buzzer lock/unlock/exclusion logic, score delta, picker assignment
- **Integration tests:** REST API board CRUD and game create/join against a real MongoDB test database
- **Socket.io event tests:** simulate host + player clients against a live server instance, assert correct event sequences through full game flows (correct answer, incorrect answer, skip, all-incorrect)
- No frontend component tests in v1 — state machine tests cover all hard logic; UI validated manually
