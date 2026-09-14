# Player Rejoin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player rejoin their in-progress game after navigating away, using a localStorage-cached session to reconnect them to their existing slot.

**Architecture:** A new `player:rejoin` socket event lets the server re-map an existing player to a new socket, returning the full current game state. The client reads `localStorage` on mount to detect a cached session and decides whether to emit `player:join` (first join) or `player:rejoin` (returning player). The home page pre-fills the name field when the typed game code matches a cached session.

**Tech Stack:** Socket.IO, React, localStorage, Jest + socket.io-client (tests)

---

## Files

| File | Change |
|------|--------|
| `server/src/sockets/gameHandlers.js` | Add `player:rejoin` handler after `player:join` |
| `server/tests/integration/socket.test.js` | Add `player:rejoin` test suite |
| `client/src/pages/PlayerPage.jsx` | Read localStorage, decide join vs rejoin, save/clear session |
| `client/src/pages/HomePage.jsx` | Pre-fill name when game code matches cached session |

---

### Task 1: Server — `player:rejoin` handler

**Files:**
- Modify: `server/src/sockets/gameHandlers.js` (after line 43, after the `player:join` handler)
- Test: `server/tests/integration/socket.test.js` (add new `describe` block after the existing `player:join` suite)

- [ ] **Step 1: Write the failing tests**

Add this block to `server/tests/integration/socket.test.js` after the closing `});` of the `describe('player:join', ...)` block:

```js
describe('player:rejoin', () => {
  test('reconnects a known player and returns current game state', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    player1.disconnect();
    const rejoining = await makeClient();

    const rejoined = waitFor(rejoining, 'player:rejoined');
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    const data = await rejoined;

    expect(data.name).toBe('Alice');
    expect(data.phase).toBe('board');
    expect(data.players.find(p => p.name === 'Alice')).toBeDefined();
    expect(typeof data.currentRound).toBe('number');

    host.disconnect();
    player2.disconnect();
    rejoining.disconnect();
  });

  test('emits error:gameNotFound for unknown game code', async () => {
    const socket = await makeClient();
    const err = waitFor(socket, 'error:gameNotFound');
    socket.emit('player:rejoin', { gameCode: 'ZZZZ', name: 'Alice' });
    await err;
    socket.disconnect();
  });

  test('emits error:notInGame when player name not in game', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();
    const socket = await makeClient();

    const err = waitFor(socket, 'error:notInGame');
    socket.emit('player:rejoin', { gameCode, name: 'Charlie' });
    await err;

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
    socket.disconnect();
  });

  test('rejoined player can buzz after rejoining', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 0 });
    await waitFor(player2, 'game:clueRevealed');

    player1.disconnect();
    const rejoining = await makeClient();
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    await waitFor(rejoining, 'player:rejoined');

    host.emit('host:unlock');
    await waitFor(rejoining, 'game:buzzersOpen');

    rejoining.emit('player:buzz');
    const claimed = await waitFor(host, 'game:buzzClaimed');
    expect(claimed.playerName).toBe('Alice');

    host.disconnect();
    player2.disconnect();
    rejoining.disconnect();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd server && npx jest tests/integration/socket.test.js --testNamePattern="player:rejoin" -t "player:rejoin"
```

Expected: all 4 tests FAIL with something like "Timeout" or "event never received"

- [ ] **Step 3: Add the `player:rejoin` handler**

In `server/src/sockets/gameHandlers.js`, add this block directly after the closing `});` of the `player:join` handler (after line 43):

```js
  socket.on('player:rejoin', ({ gameCode, name }) => {
    const entry = gameStore.get(gameCode);
    if (!entry) return socket.emit('error:gameNotFound');
    const player = entry.state.players.find(p => p.name === name);
    if (!player) return socket.emit('error:notInGame');
    entry.playerSockets.set(name, socket.id);
    socket.join(gameCode);
    const pub = entry.state.getPublicState();
    socket.emit('player:rejoined', {
      ...pub,
      name,
      fjClue: entry.state.board.finalJeopardy?.clue || null,
    });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd server && npx jest tests/integration/socket.test.js --testNamePattern="player:rejoin"
```

Expected: all 4 tests PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

```
cd server && npx jest
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```
git add server/src/sockets/gameHandlers.js server/tests/integration/socket.test.js
git commit -m "feat: add player:rejoin socket handler"
```

---

### Task 2: Client — PlayerPage rejoin logic

**Files:**
- Modify: `client/src/pages/PlayerPage.jsx`

The current code reads `const myName = state?.name` and redirects to `/` if it's missing. We need to:
1. Also check localStorage for a cached session matching the game code
2. Decide whether to emit `player:join` (new) or `player:rejoin` (returning)
3. Save the session to localStorage on `player:joined`
4. Clear the session from localStorage on `game:finished`
5. Handle `player:rejoined` by populating the full game state
6. Handle `error:notInGame` by clearing the stale session and redirecting

The key decision logic: if localStorage has a session for this game code AND `myName` matches the cached name → rejoin. Otherwise → fresh join.

- [ ] **Step 1: Update name resolution and add localStorage helpers at the top of the component**

Replace the current name line and imports at the top of `PlayerPage`:

```js
// Replace:
const { state } = useLocation();
const myName = state?.name;

// With:
const { state } = useLocation();
const nameFromState = state?.name;
const nameFromStorage = (() => {
  try {
    const s = localStorage.getItem(`jeopardy_session_${gameCode}`);
    return s ? JSON.parse(s).name : null;
  } catch { return null; }
})();
const myName = nameFromState || nameFromStorage;
const isRejoin = !!nameFromStorage && myName === nameFromStorage;
```

- [ ] **Step 2: Update the join/rejoin branch inside `useEffect`**

The current `useEffect` starts with:
```js
if (!myName) { navigate('/'); return; }
socket.connect();
socket.emit('player:join', { gameCode, name: myName });
socket.on('player:joined', () => setGame({ phase: 'lobby', ... }));
socket.on('error:gameNotFound', () => setError('Game not found'));
socket.on('error:nameTaken', () => setError('Name already taken'));
```

Replace those lines (keep all the `game:*` event listeners below unchanged) with:

```js
if (!myName) { navigate('/'); return; }

socket.connect();

if (isRejoin) {
  socket.emit('player:rejoin', { gameCode, name: myName });
  socket.on('player:rejoined', gs => {
    setGame({
      phase: gs.phase,
      currentRound: gs.currentRound || 1,
      players: gs.players,
      revealedClues: gs.revealedClues,
      buzzerState: gs.buzzerState,
      buzzedBy: gs.buzzedBy,
      currentPicker: gs.currentPicker,
      currentClue: gs.currentClue,
      fjCategory: gs.finalJeopardyCategory,
      fjClue: gs.fjClue,
      wagersSubmitted: gs.wagersSubmitted,
      answersSubmitted: gs.answersSubmitted,
      myWagerSubmitted: (gs.wagersSubmitted || []).includes(myName),
      myAnswerSubmitted: (gs.answersSubmitted || []).includes(myName),
    });
  });
  socket.on('error:notInGame', () => {
    localStorage.removeItem(`jeopardy_session_${gameCode}`);
    navigate('/');
  });
} else {
  socket.emit('player:join', { gameCode, name: myName });
  socket.on('player:joined', () => {
    localStorage.setItem(`jeopardy_session_${gameCode}`, JSON.stringify({ name: myName }));
    setGame({ phase: 'lobby', players: [], currentClue: null, buzzerState: 'locked', buzzedBy: null });
  });
  socket.on('error:nameTaken', () => setError('Name already taken'));
}
socket.on('error:gameNotFound', () => setError('Game not found'));
```

- [ ] **Step 3: Add localStorage cleanup to the `game:finished` listener**

Find the existing `game:finished` listener in the `useEffect`:
```js
socket.on('game:finished', ({ players }) => setGame(g => ({ ...g, phase: 'finished', players })));
```

Replace it with:
```js
socket.on('game:finished', ({ players }) => {
  localStorage.removeItem(`jeopardy_session_${gameCode}`);
  setGame(g => ({ ...g, phase: 'finished', players }));
});
```

- [ ] **Step 4: Update the `useEffect` dependency array**

The current dependency array is `[gameCode, myName]`. Change it to also depend on `isRejoin` so the effect re-runs if the rejoin status changes:

```js
}, [gameCode, myName, isRejoin]);
```

- [ ] **Step 5: Commit**

```
git add client/src/pages/PlayerPage.jsx
git commit -m "feat: PlayerPage reads localStorage for rejoin session"
```

---

### Task 3: Client — HomePage name pre-fill

**Files:**
- Modify: `client/src/pages/HomePage.jsx`

When the user types a game code that matches a cached session in localStorage, pre-fill the name field so they don't have to retype it.

- [ ] **Step 1: Update `HomePage` to pre-fill name from cache**

Replace the entire `HomePage` component with:

```js
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [gameCode, setGameCode] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();

  function handleGameCodeChange(e) {
    const code = e.target.value.toUpperCase();
    setGameCode(code);
    if (code.length === 4) {
      try {
        const s = localStorage.getItem(`jeopardy_session_${code}`);
        if (s) setName(JSON.parse(s).name);
      } catch {}
    }
  }

  function joinGame(e) {
    e.preventDefault();
    if (gameCode && name) navigate(`/play/${gameCode}`, { state: { name } });
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1 style={{ color: '#fbbf24', textAlign: 'center', marginBottom: 32 }}>JEOPARDY!</h1>
      <form onSubmit={joinGame} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={gameCode} onChange={handleGameCodeChange} placeholder="Game Code" maxLength={4}
          style={{ padding: 10, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: 18, textAlign: 'center', letterSpacing: 4 }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your Name"
          style={{ padding: 10, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: 16 }} />
        <button type="submit" style={{ padding: 12, borderRadius: 6, background: '#1d4ed8', color: '#fff', border: 'none', fontSize: 16, cursor: 'pointer' }}>
          Join Game
        </button>
      </form>
      <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => navigate('/editor')} style={{ padding: '8px 16px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Board Editor
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add client/src/pages/HomePage.jsx
git commit -m "feat: HomePage pre-fills name from cached session when game code matches"
```

---

## Manual Test Checklist

After all tasks are complete, verify:

1. **Fresh join still works** — open home page, enter a new game code and name, join, confirm you reach the lobby
2. **Reload rejoin** — join a game, start it, then reload the `/play/:gameCode` page — confirm you land back in the game at the correct phase without re-entering your name
3. **Home page rejoin** — join a game, navigate to `/`, type the same game code — confirm your name is pre-filled, then click Join and land back in the game
4. **Stale session cleared** — if the game finishes, confirm that reloading `/play/:gameCode` redirects to `/` (session was cleared on finish)
5. **Unknown player** — manually set a localStorage key with a name not in the game, navigate to `/play/:gameCode` — confirm redirect to `/` and key is removed
