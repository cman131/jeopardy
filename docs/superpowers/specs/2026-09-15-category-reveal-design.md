# Category Reveal Design

**Date:** 2026-09-15  
**Status:** Approved

## Overview

Before each round starts, the display screen shows a ceremonious category reveal: categories appear one at a time in a spotlight with a slide-up animation. The host controls the pace by clicking a button on their page. After all 6 categories are revealed, one final click transitions to the game board.

This happens for both Round 1 (triggered by "Start Game") and Round 2 (triggered by "Start Round 2").

## Approach

Server-relayed, client-managed. The server adds a single relay handler; all reveal state is managed locally in each client.

**No server phase change.** `game:started` and `game:round2Started` continue to carry all board data exactly as today. The only server addition is:

```
host:revealNext  →  io.to(gameCode).emit('game:revealNext')
```

Both DisplayPage and HostPage listen for `game:revealNext` and advance their local reveal step counter.

## Data Flow

```
Host clicks "Start Game"
  → server emits game:started (with board + categoryNames)
  → DisplayPage: enters reveal mode (revealCats = categoryNames, revealStep = 0)
  → HostPage:   enters reveal mode (same)

Host clicks "Reveal Next" (×7)
  → socket.emit('host:revealNext')
  → server relays game:revealNext
  → both clients: revealStep++
  → at revealStep > 6: revealCats = null → normal board renders

(Same flow for game:round2Started)
```

## Local State (both pages)

| Variable    | Type          | Meaning                                      |
|-------------|---------------|----------------------------------------------|
| `revealCats`| `string[]|null` | Category names during reveal; null = not in reveal mode |
| `revealStep`| `number`      | 0 = intro card, 1–6 = that category showing, 7+ = done |

## Display Screen — `CategoryRevealDisplay`

New component in `DisplayPage.jsx`. Props: `{ categories, step, round }`.

**Step 0 — intro card:**
- Full-screen dark background (`var(--bg-deep)`)
- Centered large text: "JEOPARDY!" (round 1) or "DOUBLE JEOPARDY!" (round 2)
- Amber color, bold, large letter-spacing — matches lobby title styling

**Steps 1–6 — spotlight:**
- Full-screen dark background
- Category card centered: dark blue panel (`#1e2a5e`), blue top border, uppercase text, matching board header style
- Slide-up animation (`translateY(40px) → 0, opacity 0 → 1, 0.5s ease-out`)
- `key={step}` on the animated element ensures animation re-fires each step
- Counter below: "CATEGORY X OF 6" in small muted text

**Step 7+:** `revealCats` is cleared; normal `board` phase renders.

## Host Page — `HostReveal`

New component in `HostPage.jsx`. Replaces `HostBoard` when `revealCats` is set.

**Content:**
- Progress label at top: "INTRO CARD" (step 0) or "CATEGORY X OF 6 REVEALED" (steps 1–6)
- List of all 6 categories: revealed ones show ✓ in green, unrevealed ones are dimmed
- Primary button:
  - Steps 0–5: **"Reveal Next →"**
  - Step 6: **"Show Board →"**
  - Emits `host:revealNext` on click

When `game:revealNext` arrives and `revealStep` exceeds 6, both pages clear `revealCats` and render normally.

## Files Changed

| File | Change |
|------|--------|
| `server/src/sockets/gameHandlers.js` | Add `host:revealNext` relay handler |
| `client/src/pages/DisplayPage.jsx` | Add `revealCats`/`revealStep` state; listen for `game:revealNext`; extract categories on `game:started` and `game:round2Started`; add `CategoryRevealDisplay` component; render it when in reveal mode |
| `client/src/pages/HostPage.jsx` | Same local state + listener; add `HostReveal` component; render it when in reveal mode |

## Edge Cases

- **Display refreshes mid-reveal:** `revealCats`/`revealStep` are lost. Display jumps to the board (already in `game.phase === 'board'`). Cosmetically harmless.
- **Host refreshes mid-reveal:** Same — host jumps to `HostBoard`. Functional game state is unaffected.
- **Round 2 reveal:** Uses `game:round2Started` categoryNames. The "between-rounds" screen already showed "DOUBLE JEOPARDY!" so the intro card at step 0 of the reveal can simply show "ROUND 2" or "DOUBLE JEOPARDY!" again briefly.
- **No extra socket events needed** for the "done" state — both clients independently detect `revealStep > 6`.
