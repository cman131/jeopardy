# Correctness Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 9 correctness gaps identified in the system audit, covering dead code, missing host controls, broken state sync on reconnect, and cosmetic display issues.

**Architecture:** Fixes are localized to 5 files with no new socket events or routes needed. Server changes (Tasks 1–2) add test coverage via existing Jest unit/integration harnesses. Client changes (Tasks 3–9) are verified manually using the dev server (`.\start-dev.ps1` from the project root, or `cd server && npm run dev` + `cd client && npm run dev` in separate terminals).

**Tech Stack:** Node.js/Express/Socket.io (server), React (client), Jest + mongodb-memory-server (server tests)

---

## Files Changed

| File | Tasks |
|------|-------|
| `server/src/game/GameState.js` | Task 1 |
| `server/src/sockets/gameHandlers.js` | Task 2 |
| `client/src/pages/HostPage.jsx` | Tasks 3, 4, 5, 6 |
| `client/src/pages/DisplayPage.jsx` | Tasks 4, 7, 8 |
| `client/src/pages/PlayerPage.jsx` | Tasks 8, 9 |

---

## Task 1: GameState — include finalJudgments in getHostState() [Fix #3 server]

**Files:**
- Modify: `server/src/game/GameState.js`
- Test: `server/tests/unit/GameState.test.js`

- [ ] **Step 1: Write the failing test**

Add at the end of `server/tests/unit/GameState.test.js`, after the existing `GameState — getPublicState / getHostState` describe block:

```js
describe('GameState — getHostState during final-judging', () => {
  function makeFjJudgingGs() {
    const board = makeBoard();
    const gs = new GameState(board);
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.start();
    for (let ci = 0; ci < 6; ci++)
      for (let qi = 0; qi < 5; qi++) { gs.selectClue(ci, qi); gs.skipClue(); }
    gs.startRound2();
    for (let ci = 0; ci < 6; ci++)
      for (let qi = 0; qi < 5; qi++) { gs.selectClue(ci, qi); gs.skipClue(); }
    gs.submitWager('Alice', 500);
    gs.submitWager('Bob', 300);
    gs.submitAnswer('Alice', 'What is X?');
    gs.submitAnswer('Bob', 'What is Y?');
    // Now in final-judging
    return gs;
  }

  test('getHostState includes finalJudgments when phase is final-judging', () => {
    const gs = makeFjJudgingGs();
    gs.judgeFinal('Alice', true);
    const host = gs.getHostState();
    expect(host.finalJudgments).toBeDefined();
    expect(host.finalJudgments['Alice']).toBe(true);
  });

  test('getHostState finalJudgments is empty object before any judgments', () => {
    const gs = makeFjJudgingGs();
    const host = gs.getHostState();
    expect(host.finalJudgments).toEqual({});
  });

  test('getHostState does not include finalJudgments outside final-judging phase', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.start();
    const host = gs.getHostState();
    expect(host.finalJudgments).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd server && npm test -- --testPathPattern=GameState --verbose
```

Expected: 3 new tests FAIL with "Cannot read properties of undefined" or similar.

- [ ] **Step 3: Implement the fix**

In `server/src/game/GameState.js`, find the `getHostState()` method. Locate this block:

```js
  if (this.phase === 'final-judging') {
    state.finalAnswers = Object.fromEntries(this.finalAnswers);
    state.finalWagers = Object.fromEntries(this.finalWagers);
  }
```

Replace with:

```js
  if (this.phase === 'final-judging') {
    state.finalAnswers = Object.fromEntries(this.finalAnswers);
    state.finalWagers = Object.fromEntries(this.finalWagers);
    state.finalJudgments = Object.fromEntries(this.finalJudgments);
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd server && npm test -- --testPathPattern=GameState --verbose
```

Expected: All tests PASS including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add server/src/game/GameState.js server/tests/unit/GameState.test.js
git commit -m "fix: include finalJudgments in getHostState for final-judging phase"
```

---

## Task 2: gameHandlers — add fjType + fjMediaUrl to player:rejoin payload [Fix #8 server]

**Files:**
- Modify: `server/src/sockets/gameHandlers.js`
- Test: `server/tests/integration/socket.test.js`

- [ ] **Step 1: Write the failing test**

Add after the existing `player:rejoin` describe block in `server/tests/integration/socket.test.js`. Add the Board and Game imports if they aren't already imported at the top (they are — confirmed in socket.test.js line 7-8):

```js
describe('player:rejoin FJ fields', () => {
  test('includes fjType and fjMediaUrl in payload when rejoining during final-clue', async () => {
    const board = makeTestBoard({
      finalJeopardy: {
        category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER',
        type: 'image', mediaUrl: 'https://example.com/fj.jpg',
      },
    });
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const host = await makeClient();
    const player = await makeClient();

    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    player.emit('player:join', { gameCode, name: 'Alice' });
    await waitFor(player, 'player:joined');

    // Force to final-clue phase
    const entry = gameStore.get(gameCode);
    entry.state.phase = 'final-clue';

    player.disconnect();
    const rejoining = await makeClient();
    const rejoinedP = waitFor(rejoining, 'player:rejoined');
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    const data = await rejoinedP;

    expect(data.fjType).toBe('image');
    expect(data.fjMediaUrl).toBe('https://example.com/fj.jpg');

    host.disconnect();
    rejoining.disconnect();
  });

  test('fjType and fjMediaUrl are null when rejoining outside FJ phases', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    player1.disconnect();
    const rejoining = await makeClient();
    const rejoinedP = waitFor(rejoining, 'player:rejoined');
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    const data = await rejoinedP;

    expect(data.fjType).toBeNull();
    expect(data.fjMediaUrl).toBeNull();

    host.disconnect();
    player2.disconnect();
    rejoining.disconnect();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd server && npm test -- --testPathPattern=socket --verbose
```

Expected: 2 new tests FAIL — `data.fjType` and `data.fjMediaUrl` are undefined.

- [ ] **Step 3: Implement the fix**

In `server/src/sockets/gameHandlers.js`, find the `player:rejoin` handler. Locate this emit:

```js
    socket.emit('player:rejoined', {
      ...pub,
      name,
      fjClue: fjPhases.includes(pub.phase) ? (entry.state.board.finalJeopardy?.clue || null) : null,
    });
```

Replace with:

```js
    socket.emit('player:rejoined', {
      ...pub,
      name,
      fjClue: fjPhases.includes(pub.phase) ? (entry.state.board.finalJeopardy?.clue || null) : null,
      fjType: fjPhases.includes(pub.phase) ? (entry.state.board.finalJeopardy?.type || 'regular') : null,
      fjMediaUrl: fjPhases.includes(pub.phase) ? (entry.state.board.finalJeopardy?.mediaUrl || null) : null,
    });
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd server && npm test -- --testPathPattern=socket --verbose
```

Expected: All tests PASS including the 2 new ones.

- [ ] **Step 5: Run full test suite**

```bash
cd server && npm test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/sockets/gameHandlers.js server/tests/integration/socket.test.js
git commit -m "fix: add fjType and fjMediaUrl to player:rejoin payload for FJ phases"
```

---

## Task 3: HostPage — always show Reveal Answer button [Fix #1]

**Files:**
- Modify: `client/src/pages/HostPage.jsx` — `HostClue` component

- [ ] **Step 1: Remove the answerImage guard**

In `client/src/pages/HostPage.jsx`, find the `HostClue` component's judging phase section. Locate this block:

```jsx
      {phase === 'judging' && clueData && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {clueData.answerImage && (
            <button
              onClick={() => socket.emit('host:revealAnswer')}
              disabled={answerRevealed}
              style={{ width: '100%', padding: '10px 0', background: answerRevealed ? 'var(--bg-surface)' : '#7c3aed', color: answerRevealed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: answerRevealed ? 'not-allowed' : 'pointer', marginBottom: 4 }}>
              {answerRevealed ? '✓ Answer Revealed' : '🖼 Reveal Answer on Display'}
            </button>
          )}
```

Replace with (remove the `{clueData.answerImage && (` wrapper and its closing `)}`, update label):

```jsx
      {phase === 'judging' && clueData && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => socket.emit('host:revealAnswer')}
            disabled={answerRevealed}
            style={{ width: '100%', padding: '10px 0', background: answerRevealed ? 'var(--bg-surface)' : '#7c3aed', color: answerRevealed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: answerRevealed ? 'not-allowed' : 'pointer', marginBottom: 4 }}>
            {answerRevealed ? '✓ Answer Revealed' : 'Reveal Answer on Display'}
          </button>
```

- [ ] **Step 2: Manual test**

Start the app (`.\start-dev.ps1`). Create a board with a text-only clue (no answer image). Start a game. Select the clue, unlock buzzers, have a player buzz in. Verify:
- The "Reveal Answer on Display" button appears in the host panel
- Clicking it triggers the display to show the answer text
- Button changes to "✓ Answer Revealed" and disables after clicking
- Test again with a clue that has an `answerImage` — same behavior, plus the image appears on display

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/HostPage.jsx
git commit -m "fix: always show Reveal Answer button during judging, not only when answerImage exists"
```

---

## Task 4: FJ video host control [Fix #2]

**Files:**
- Modify: `client/src/pages/HostPage.jsx` — `game:finalClue` handler, phase dispatcher, `HostFinalClue`
- Modify: `client/src/pages/DisplayPage.jsx` — `game:finalClue` handler, `DisplayFinalClue`

- [ ] **Step 1: Fix DisplayPage — reset videoPlaying and pass videoReady**

In `client/src/pages/DisplayPage.jsx`, find the `game:finalClue` socket handler:

```js
    socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
      setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [] })));
```

Replace with (add `videoPlaying: false`):

```js
    socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
      setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [], videoPlaying: false })));
```

Then find the `DisplayFinalClue` component and its `<ClueMedia>` call:

```jsx
        <ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} />
```

Replace with:

```jsx
        <ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} videoReady={game.fjType === 'video' ? game.videoPlaying : true} />
```

- [ ] **Step 2: Fix HostPage — reset videoPlayed on game:finalClue**

In `client/src/pages/HostPage.jsx`, find the `game:finalClue` socket handler:

```js
      socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
        setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [] })));
```

Replace with (add `videoPlayed: false`):

```js
      socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
        setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [], videoPlayed: false })));
```

- [ ] **Step 3: Fix HostPage — pass onPlayVideo to HostFinalClue**

In `client/src/pages/HostPage.jsx`, find the phase dispatcher JSX that renders `HostFinalClue`:

```jsx
      {phase === 'final-clue' && <HostFinalClue game={game} />}
```

Replace with:

```jsx
      {phase === 'final-clue' && <HostFinalClue
        game={game}
        onPlayVideo={() => {
          socket.emit('host:playVideo');
          setGame(g => ({ ...g, videoPlayed: true }));
        }}
      />}
```

- [ ] **Step 4: Fix HostFinalClue — accept prop and render Play Video button**

In `client/src/pages/HostPage.jsx`, find the `HostFinalClue` function signature:

```jsx
function HostFinalClue({ game }) {
```

Replace with:

```jsx
function HostFinalClue({ game, onPlayVideo }) {
```

Then inside `HostFinalClue`, find the answers count line and the Close Answers button:

```jsx
      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Answers: {submitted.length}/{total}</div>
```

Add the Play Video button before this line:

```jsx
      {game.fjType === 'video' && (
        <button
          onClick={onPlayVideo}
          disabled={game.videoPlayed}
          style={{ width: '100%', padding: 12, background: game.videoPlayed ? 'var(--bg-surface)' : '#7c3aed', color: game.videoPlayed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: game.videoPlayed ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
          {game.videoPlayed ? '✓ Video Playing on Display' : '▶ Play Video on Display'}
        </button>
      )}
      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Answers: {submitted.length}/{total}</div>
```

- [ ] **Step 5: Manual test**

Create a board where the Final Jeopardy clue has `type: 'video'` and a YouTube URL. Start a game, play through to Final Jeopardy. Verify:
- On the display, the video thumbnail/waiting state shows (not playing) when `game:finalClue` arrives
- The host sees "▶ Play Video on Display" in `HostFinalClue`
- Clicking it starts playback on the display and changes host button to "✓ Video Playing on Display"
- Test with a regular (text) FJ clue — no Play Video button appears on host

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/HostPage.jsx client/src/pages/DisplayPage.jsx
git commit -m "fix: add host-controlled video playback for Final Jeopardy clues"
```

---

## Task 5: HostPage — restore judgments on host reconnect [Fix #3 client]

**Files:**
- Modify: `client/src/pages/HostPage.jsx` — `host:joined` handler

Depends on Task 1 (server must include `finalJudgments` in `getHostState()` before this works end-to-end).

- [ ] **Step 1: Update the host:joined handler**

In `client/src/pages/HostPage.jsx`, find the `host:joined` socket handler:

```js
      socket.on('host:joined', state => setGame(state));
```

Replace with:

```js
      socket.on('host:joined', state => {
        setGame(state);
        setJudgments(state.finalJudgments || {});
      });
```

- [ ] **Step 2: Manual test**

Start a game and play through to the `final-judging` phase. Judge at least one player correct. Open a new tab to `/host/<gameCode>` (simulating a reconnect). Verify:
- The reconnected host sees the already-judged player's result (green "✓ Correct") rather than the judge buttons
- The un-judged player still shows the judge buttons
- Clicking judge for the remaining player completes successfully

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/HostPage.jsx
git commit -m "fix: restore finalJudgments state when host reconnects during final-judging"
```

---

## Task 6: HostPage — Reveal Next remaining count [Fix #5]

**Files:**
- Modify: `client/src/pages/HostPage.jsx` — `HostFinalReveal` component

- [ ] **Step 1: Update the button label**

In `client/src/pages/HostPage.jsx`, find the `HostFinalReveal` component's button:

```jsx
      <button
        onClick={() => socket.emit('host:revealNext')}
        style={{ marginTop: 16, padding: '12px 32px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
        Reveal Next →
      </button>
```

Replace with:

```jsx
      <button
        onClick={() => socket.emit('host:revealNext')}
        style={{ marginTop: 16, padding: '12px 32px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
        Reveal Next ({revealed.length + 1} of {(game.players || []).length}) →
      </button>
```

- [ ] **Step 2: Manual test**

Play through to `final-reveal`. Verify the button reads "Reveal Next (1 of 3) →" before any reveals, "Reveal Next (2 of 3) →" after the first, etc.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/HostPage.jsx
git commit -m "fix: show remaining count on Reveal Next button in HostFinalReveal"
```

---

## Task 7: DisplayPage — show running score in Final Reveal cards [Fix #4]

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx` — `DisplayFinalReveal` and `RevealCard`

- [ ] **Step 1: Pass finalScore to RevealCard**

In `client/src/pages/DisplayPage.jsx`, find the `DisplayFinalReveal` function:

```jsx
function DisplayFinalReveal({ game }) {
  const revealed = game.revealedPlayers || [];
  return (
    <div style={{ padding: 40, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--color-amber)', textAlign: 'center', marginBottom: 32, letterSpacing: 4 }}>FINAL JEOPARDY</div>
      {revealed.map(({ playerName, wager, answer, correct }) => (
        <RevealCard key={playerName} playerName={playerName} wager={wager} answer={answer} correct={correct} />
      ))}
    </div>
  );
}
```

Replace with:

```jsx
function DisplayFinalReveal({ game }) {
  const revealed = game.revealedPlayers || [];
  return (
    <div style={{ padding: 40, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--color-amber)', textAlign: 'center', marginBottom: 32, letterSpacing: 4 }}>FINAL JEOPARDY</div>
      {revealed.map(({ playerName, wager, answer, correct }) => {
        const player = (game.players || []).find(p => p.name === playerName);
        return (
          <RevealCard key={playerName} playerName={playerName} wager={wager} answer={answer} correct={correct} finalScore={player?.score} />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add finalScore display to RevealCard**

In `client/src/pages/DisplayPage.jsx`, find the `RevealCard` function:

```jsx
function RevealCard({ playerName, wager, answer, correct }) {
  const [showWager, setShowWager] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowWager(true), 400);
    const t2 = setTimeout(() => setShowAnswer(true), 1400);
    const t3 = setTimeout(() => setShowResult(true), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 24px', marginBottom: 16 }}>
      <div style={{ fontWeight: 'bold', fontSize: 20, color: 'var(--color-white)', marginBottom: 8 }}>{playerName}</div>
      {showWager && <div style={{ color: 'var(--color-label)', fontSize: 16, marginBottom: 4 }}>Wager: ${wager}</div>}
      {showAnswer && <div style={{ color: 'var(--color-white)', fontSize: 16, marginBottom: 4, fontStyle: 'italic' }}>{answer || '(blank)'}</div>}
      {showResult && (
        <div style={{ color: correct ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold', fontSize: 20 }}>
          {correct ? `+$${wager}` : `-$${wager}`}
        </div>
      )}
    </div>
  );
}
```

Replace with:

```jsx
function RevealCard({ playerName, wager, answer, correct, finalScore }) {
  const [showWager, setShowWager] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showTotal, setShowTotal] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowWager(true), 400);
    const t2 = setTimeout(() => setShowAnswer(true), 1400);
    const t3 = setTimeout(() => setShowResult(true), 2400);
    const t4 = setTimeout(() => setShowTotal(true), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 24px', marginBottom: 16 }}>
      <div style={{ fontWeight: 'bold', fontSize: 20, color: 'var(--color-white)', marginBottom: 8 }}>{playerName}</div>
      {showWager && <div style={{ color: 'var(--color-label)', fontSize: 16, marginBottom: 4 }}>Wager: ${wager}</div>}
      {showAnswer && <div style={{ color: 'var(--color-white)', fontSize: 16, marginBottom: 4, fontStyle: 'italic' }}>{answer || '(blank)'}</div>}
      {showResult && (
        <div style={{ color: correct ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold', fontSize: 20 }}>
          {correct ? `+$${wager}` : `-$${wager}`}
        </div>
      )}
      {showTotal && finalScore !== undefined && (
        <div style={{ color: 'var(--color-amber)', fontSize: 16, marginTop: 4 }}>
          Total: {finalScore < 0 ? `-$${Math.abs(finalScore)}` : `$${finalScore}`}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual test**

Play through to `final-reveal`. Click "Reveal Next" and watch the display. Verify each revealed card animates through: name → wager → answer → delta → total score (in amber). Verify the total reflects the post-wager score (e.g. if a player had $5000 and bet $2000 correctly, total should show $7000).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DisplayPage.jsx
git commit -m "fix: show animated total score in Final Reveal cards on display"
```

---

## Task 8: Dead code cleanup [Fixes #6, #7]

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx`
- Modify: `client/src/pages/PlayerPage.jsx`

- [ ] **Step 1: Remove dead game:clueSkipped listener from DisplayPage**

In `client/src/pages/DisplayPage.jsx`, find and delete this entire handler:

```js
    socket.on('game:clueSkipped', ({ revealedClues, currentPicker }) =>
      setGame(g => ({ ...g, phase: 'board', revealedClues, currentPicker, currentClue: null, answerRevealed: false, revealedAnswer: null, revealedAnswerImage: null })));
```

- [ ] **Step 2: Remove dead buzzedPlayers state from DisplayPage**

In `client/src/pages/DisplayPage.jsx`, find the `game:wrongAnswer` handler:

```js
    socket.on('game:wrongAnswer', ({ players, buzzedPlayers }) =>
      setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'locked', players, buzzedPlayers: buzzedPlayers || [] })));
```

Replace with:

```js
    socket.on('game:wrongAnswer', ({ players }) =>
      setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'locked', players })));
```

- [ ] **Step 3: Remove dead game:clueSkipped listener from PlayerPage**

In `client/src/pages/PlayerPage.jsx`, find and delete this entire handler:

```js
    socket.on('game:clueSkipped', ({ revealedClues, currentPicker }) =>
      setGame(g => ({ ...g, phase: 'board', revealedClues, currentPicker, currentClue: null, buzzerState: 'locked' })));
```

- [ ] **Step 4: Run server tests to confirm nothing broken**

```bash
cd server && npm test
```

Expected: All tests PASS (these are client-only deletions, no server impact).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/DisplayPage.jsx client/src/pages/PlayerPage.jsx
git commit -m "fix: remove dead game:clueSkipped listeners and buzzedPlayers state in DisplayPage"
```

---

## Task 9: PlayerPage — restore FJ state on rejoin + fix wager display [Fixes #8 client, #9]

**Files:**
- Modify: `client/src/pages/PlayerPage.jsx`

- [ ] **Step 1: Add fjType + fjMediaUrl to player:rejoined handler**

In `client/src/pages/PlayerPage.jsx`, find the `socket.once('player:rejoined', gs => { ... })` handler:

```js
      socket.once('player:rejoined', gs => {
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
```

Replace with (add `fjType` and `fjMediaUrl`):

```js
      socket.once('player:rejoined', gs => {
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
          fjType: gs.fjType || 'regular',
          fjMediaUrl: gs.fjMediaUrl || null,
          wagersSubmitted: gs.wagersSubmitted,
          answersSubmitted: gs.answersSubmitted,
          myWagerSubmitted: (gs.wagersSubmitted || []).includes(myName),
          myAnswerSubmitted: (gs.answersSubmitted || []).includes(myName),
        });
      });
```

- [ ] **Step 2: Fix wager confirmation display**

In `client/src/pages/PlayerPage.jsx`, find this line in the `final-wager` phase JSX:

```jsx
            <div style={{ color: 'var(--color-green)', fontSize: 14 }}>Wager locked in! ${wagerInput}</div>
```

Replace with:

```jsx
            <div style={{ color: 'var(--color-green)', fontSize: 14 }}>Wager locked in! ${parseInt(wagerInput, 10)}</div>
```

- [ ] **Step 3: Manual test for rejoin**

Start a game, play to Final Jeopardy wager phase. On the player device, close the browser tab and reopen `/play/<gameCode>`. Verify the player sees the Final Jeopardy category and wager UI (not a blank/loading state).

- [ ] **Step 4: Manual test for wager display**

As a player during Final Jeopardy wagering, enter a wager (e.g. 500) and submit. Verify the confirmation reads "Wager locked in! $500" with no extra characters.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/PlayerPage.jsx
git commit -m "fix: restore fjType/fjMediaUrl on player rejoin; show parsed integer in wager confirmation"
```

---

## Final Verification

- [ ] Run full server test suite one last time:

```bash
cd server && npm test
```

Expected: All tests PASS.

- [ ] Start the app and do a smoke test of a complete game flow from lobby → board → clue → between-rounds → final → reveal → finished, checking each fixed behavior works end-to-end.
