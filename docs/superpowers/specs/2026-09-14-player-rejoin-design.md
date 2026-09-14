# Player Rejoin Design

**Date:** 2026-09-14

## Problem

If a player navigates away from `/play/:gameCode`, their name is lost from React Router location state. They have no way to get back into the game because `player:join` rejects mid-game joins and the server has no way to map them back to their existing player slot.

## Solution

Cache the player's session in localStorage on successful join. Use it to auto-populate the home page name field and to trigger a `player:rejoin` flow on PlayerPage that reconnects them to their existing slot.

## localStorage

- **Key:** `jeopardy_session_<gameCode>`
- **Value:** `{ name: string }`
- **Written:** on `player:joined` (successful first join)
- **Cleared:** on `game:finished`

## PlayerPage

On mount, if `state?.name` is absent:
1. Read `jeopardy_session_<gameCode>` from localStorage.
2. If found, emit `player:rejoin` with `{ gameCode, name }`.
3. If not found, redirect to `/`.

On `player:rejoined`, set game state directly from the payload (same shape as `getPublicState()` plus `name`), dropping the player back into the current game phase.

Error handling:
- `error:gameNotFound` → show error message as today.
- `error:notInGame` → clear the stale session from localStorage, redirect to `/`.

## HomePage

When the game code input changes, check localStorage for `jeopardy_session_<gameCode>`. If found, pre-fill the name input. The player may edit the name before submitting. Submission proceeds as today (navigate with `{ state: { name } }`).

## Server — `player:rejoin` handler

```
socket.on('player:rejoin', ({ gameCode, name }) => {
  entry = gameStore.get(gameCode)
  if (!entry) → emit error:gameNotFound
  player = entry.state.players.find(p => p.name === name)
  if (!player) → emit error:notInGame
  entry.playerSockets.set(name, socket.id)
  socket.join(gameCode)
  socket.emit('player:rejoined', { ...getPublicState(), name })
})
```

No changes to `GameState` — player score and state are already persisted in memory.

## Out of Scope

- Persisting sessions across server restarts (games are in-memory only).
- Handling two devices trying to rejoin as the same player simultaneously.
- Showing a "reconnecting" indicator while the rejoin is in flight.
