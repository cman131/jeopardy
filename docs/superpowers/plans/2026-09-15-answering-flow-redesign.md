# Answering Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual "Reveal Answer" + "Unlock Buzzers" host steps with automatic answer reveal on correct judgment and immediate buzzer re-open after wrong answers, plus a new "Back to Board" button.

**Architecture:** Add a `boardReady` flag to `GameState` that `judge(correct)` sets instead of closing the clue immediately. A new `host:backToBoard` socket event triggers the actual clue closure and board transition. Client-side: `game:wrongAnswer` stops resetting `buzzerState` to `'locked'` (fixing an existing bug where buzzers got permanently stuck).

**Tech Stack:** Node.js / Socket.IO (server), React (client), Jest (server tests)

---

## Files

| Action | Path |
|--------|------|
| Modify | `server/src/game/GameState.js` |
| Modify | `server/tests/unit/GameState.test.js` |
| Modify | `server/src/sockets/gameHandlers.js` |
| Modify | `server/tests/integration/socket.test.js` |
| Modify | `client/src/pages/HostPage.jsx` |
| Modify | `client/src/pages/PlayerPage.jsx` |
| Modify | `client/src/pages/DisplayPage.jsx` |

---

## Task 1: Add `boardReady` to GameState (TDD — new tests first)

**Files:**
- Modify: `server/tests/unit/GameState.test.js`
- Modify: `server/src/game/GameState.js`

- [ ] **Step 1: Add new failing tests for `boardReady` behaviour**

Append this describe block to the end of `server/tests/unit/GameState.test.js`:

```js
describe('GameState — boardReady flow', () => {
  function judgingGame() {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    gs.selectClue(0, 2); // clueValue(1,2) = $600
    gs.unlock();
    gs.buzz('Alice');
    return gs;
  }

  test('boardReady initialises to false', () => {
    const gs = new GameState(makeBoard());
    expect(gs.boardReady).toBe(false);
  });

  test('getPublicState includes boardReady: false initially', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    expect(gs.getPublicState().boardReady).toBe(false);
  });

  test('judge(correct) sets boardReady true and keeps phase judging', () => {
    const gs = judgingGame();
    gs.judge('correct');
    expect(gs.phase).toBe('judging');
    expect(gs.boardReady).toBe(true);
  });

  test('judge(correct) scores player but does not close clue', () => {
    const gs = judgingGame();
    gs.judge('correct');
    expect(gs.players[0].score).toBe(600);
    expect(gs.revealedClues).toHaveLength(0);
    expect(gs.currentClue).not.toBeNull();
  });

  test('getPublicState includes boardReady: true after correct judgment', () => {
    const gs = judgingGame();
    gs.judge('correct');
    expect(gs.getPublicState().boardReady).toBe(true);
  });

  test('backToBoard closes clue and transitions to board', () => {
    const gs = judgingGame();
    gs.judge('correct');
    gs.backToBoard();
    expect(gs.phase).toBe('board');
    expect(gs.boardReady).toBe(false);
    expect(gs.revealedClues).toContainEqual({ round: 1, categoryIndex: 0, clueIndex: 2 });
    expect(gs.currentClue).toBeNull();
  });

  test('backToBoard sets currentPicker to the correct answerer', () => {
    const gs = judgingGame();
    gs.judge('correct');
    gs.backToBoard();
    expect(gs.currentPicker).toBe('Alice');
  });

  test('backToBoard throws when not in boardReady state', () => {
    const gs = judgingGame();
    expect(() => gs.backToBoard()).toThrow('Invalid state');
  });
});
```

- [ ] **Step 2: Run new tests to confirm they all fail**

```
cd server && npm test -- --testPathPattern="GameState"
```

Expected: 8 new failures (boardReady is undefined, backToBoard is not a function, etc.)

- [ ] **Step 3: Implement GameState changes**

In `server/src/game/GameState.js`:

**a) Constructor** — add `this.boardReady = false;` after `this.finalRevealIndex = 0;`:

```js
constructor(board) {
  this.board = board;
  this.phase = 'lobby';
  this.currentRound = 1;
  this.players = [];
  this.revealedClues = [];
  this.currentClue = null;
  this.buzzerState = 'locked';
  this.buzzedBy = null;
  this.buzzedPlayers = [];
  this.currentPicker = null;
  this.finalWagers = new Map();
  this.finalAnswers = new Map();
  this.finalJudgments = new Map();
  this.finalRevealOrder = [];
  this.finalRevealIndex = 0;
  this.boardReady = false;
}
```

**b) `judge()` correct path** — replace `this._closeClue()` with `this.boardReady = true`:

```js
judge(result) {
  if (this.phase !== 'judging') throw new Error('Invalid phase');
  if (result !== 'correct' && result !== 'incorrect') throw new Error('Invalid result');
  const player = this.players.find(p => p.name === this.buzzedBy);
  const value = clueValue(this.currentRound, this.currentClue.clueIndex);
  const delta = result === 'correct' ? value : -value;
  player.score += delta;
  player.scoreHistory.push({
    categoryIndex: this.currentClue.categoryIndex,
    clueIndex: this.currentClue.clueIndex,
    clueValue: value,
    result,
    delta,
    timestamp: new Date(),
  });
  if (result === 'correct') {
    this.currentPicker = this.buzzedBy;
    this.boardReady = true;
  } else {
    this.buzzedBy = null;
    this.buzzerState = 'open';
    this.phase = 'clue';
    if (this.buzzedPlayers.length >= this.players.length) {
      this._closeClue();
    }
  }
}
```

**c) Add `backToBoard()` method** — insert after `judge()`:

```js
backToBoard() {
  if (this.phase !== 'judging' || !this.boardReady) throw new Error('Invalid state');
  this._closeClue();
}
```

**d) `_closeClue()`** — add `this.boardReady = false;` as the first line:

```js
_closeClue() {
  this.boardReady = false;
  this.revealedClues.push({ round: this.currentRound, ...this.currentClue });
  this.currentClue = null;
  this.buzzedBy = null;
  this.buzzerState = 'locked';
  this.buzzedPlayers = [];
  if (this._allRevealedInRound()) {
    this.phase = this.currentRound === 1 ? 'between-rounds' : 'final-wager';
  } else {
    this.phase = 'board';
  }
}
```

**e) `getPublicState()`** — add `boardReady: this.boardReady,` to the returned object:

```js
getPublicState() {
  return {
    phase: this.phase,
    currentRound: this.currentRound,
    players: this.players.map(p => ({ name: p.name, score: p.score })),
    revealedClues: [...this.revealedClues],
    buzzerState: this.buzzerState,
    buzzedBy: this.buzzedBy,
    currentPicker: this.currentPicker,
    categoryNames: this._currentCategories().map(c => c.name),
    currentClue: this.currentClue ? {
      categoryIndex: this.currentClue.categoryIndex,
      clueIndex: this.currentClue.clueIndex,
      question: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].question,
      value: clueValue(this.currentRound, this.currentClue.clueIndex),
      type: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].type || 'regular',
      mediaUrl: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].mediaUrl || null,
    } : null,
    wagersSubmitted: [...this.finalWagers.keys()],
    answersSubmitted: [...this.finalAnswers.keys()],
    finalRevealIndex: this.finalRevealIndex,
    finalJeopardyCategory: this.board.finalJeopardy?.category,
    boardReady: this.boardReady,
  };
}
```

- [ ] **Step 4: Run new tests to confirm they pass**

```
cd server && npm test -- --testPathPattern="GameState"
```

Expected: 8 new tests PASS. Several existing tests will now FAIL (round transition, selectClue, etc.) — that is expected and handled in Task 2.

---

## Task 2: Update existing GameState tests broken by Task 1

**Files:**
- Modify: `server/tests/unit/GameState.test.js`

Five existing tests call `judge('correct')` and assume the clue is immediately closed. Each needs `gs.backToBoard()` added, and the `'correct: adds score...'` test needs its assertions updated.

- [ ] **Step 1: Update `selectClue throws on already-revealed clue`**

In `describe('GameState — board → clue')`, find the test and add `gs.backToBoard()`:

```js
test('selectClue throws on already-revealed clue', () => {
  const gs = startedGame();
  gs.selectClue(0, 0);
  gs.unlock();
  gs.buzz('Alice');
  gs.judge('correct');
  gs.backToBoard();
  expect(() => gs.selectClue(0, 0)).toThrow('already revealed');
});
```

- [ ] **Step 2: Update `correct: adds score, appends history, sets picker, returns to board`**

In `describe('GameState — judging')`, replace that test entirely:

```js
test('correct: scores player, sets boardReady; backToBoard returns to board', () => {
  const gs = judgingGame();
  gs.judge('correct');
  // After judge(correct): still in judging, boardReady=true, clue not yet closed
  expect(gs.phase).toBe('judging');
  expect(gs.boardReady).toBe(true);
  expect(gs.players[0].score).toBe(600);
  expect(gs.players[0].scoreHistory).toHaveLength(1);
  expect(gs.players[0].scoreHistory[0]).toMatchObject({
    categoryIndex: 0, clueIndex: 2, clueValue: 600, result: 'correct', delta: 600,
  });
  expect(gs.currentPicker).toBe('Alice');
  expect(gs.revealedClues).toHaveLength(0);

  gs.backToBoard();
  expect(gs.phase).toBe('board');
  expect(gs.boardReady).toBe(false);
  expect(gs.revealedClues).toContainEqual({ round: 1, categoryIndex: 0, clueIndex: 2 });
});
```

- [ ] **Step 3: Update `auto-transitions to between-rounds` round transition test**

In `describe('GameState — round transition')`, add `gs.backToBoard()` after each `gs.judge('correct')`:

```js
test('auto-transitions to between-rounds when all 30 round-1 clues revealed', () => {
  const gs = new GameState(makeBoard());
  gs.addPlayer('Alice');
  gs.addPlayer('Bob');
  gs.startGame();
  for (let ci = 0; ci < 6; ci++) {
    for (let qi = 0; qi < 5; qi++) {
      if (ci === 5 && qi === 4) continue;
      gs.selectClue(ci, qi);
      gs.unlock();
      gs.buzz('Alice');
      gs.judge('correct');
      gs.backToBoard();
    }
  }
  gs.selectClue(5, 4);
  gs.unlock();
  gs.buzz('Alice');
  gs.judge('correct');
  gs.backToBoard();
  expect(gs.phase).toBe('between-rounds');
});
```

- [ ] **Step 4: Update `revealedClues entry includes round: 1` in `describe('selectClue')`**

```js
test('revealedClues entry includes round: 1 after round 1 clue is scored', () => {
  const gs = new GameState(makeBoard());
  gs.addPlayer('Alice'); gs.addPlayer('Bob');
  gs.start();
  gs.selectClue(0, 0);
  gs.openBuzzers();
  gs.buzz('Alice');
  gs.judge('correct');
  gs.backToBoard();
  expect(gs.revealedClues[0]).toMatchObject({ round: 1, categoryIndex: 0, clueIndex: 0 });
});
```

- [ ] **Step 5: Update `mutating returned revealedClues` in `describe('GameState — getPublicState / getHostState')`**

```js
test('mutating returned revealedClues does not affect internal state', () => {
  const gs = new GameState(makeBoard());
  gs.addPlayer('Alice'); gs.addPlayer('Bob');
  gs.startGame();
  gs.selectClue(0, 0);
  gs.unlock();
  gs.buzz('Alice');
  gs.judge('correct');
  gs.backToBoard();
  const pub = gs.getPublicState();
  pub.revealedClues.push({ round: 1, categoryIndex: 99, clueIndex: 99 });
  expect(gs.revealedClues).toHaveLength(1);
});
```

- [ ] **Step 6: Run all GameState tests — expect all to pass**

```
cd server && npm test -- --testPathPattern="GameState"
```

Expected: All tests PASS (including the 8 new ones from Task 1).

- [ ] **Step 7: Commit**

```
git add server/src/game/GameState.js server/tests/unit/GameState.test.js
git commit -m "feat: add boardReady flag to GameState; judge(correct) defers clue close to backToBoard()"
```

---

## Task 3: Update `gameHandlers.js` and socket integration tests

**Files:**
- Modify: `server/src/sockets/gameHandlers.js`
- Modify: `server/tests/integration/socket.test.js`

- [ ] **Step 1: Replace the `host:judge` handler**

In `server/src/sockets/gameHandlers.js`, replace the entire `host:judge` handler (lines 114–165) with:

```js
socket.on('host:judge', async ({ result }) => {
  const entry = _getHostEntry(socket);
  if (!entry) return;
  const gameCode = _gameCodeFor(socket);
  const judgedPlayer = entry.state.buzzedBy;
  try { entry.state.judge(result); } catch (err) {
    return socket.emit('error:generic', { message: err.message });
  }
  const pub = entry.state.getPublicState();

  if (judgedPlayer) {
    const player = entry.state.players.find(p => p.name === judgedPlayer);
    if (player) {
      const lastEntry = player.scoreHistory[player.scoreHistory.length - 1];
      if (lastEntry) {
        await Game.updateOne(
          { gameCode, 'players.name': judgedPlayer },
          { $set: { 'players.$.score': player.score }, $push: { 'players.$.scoreHistory': lastEntry } }
        );
      }
    }
  }

  const phase = entry.state.phase;

  if (phase === 'judging') {
    // Correct answer — boardReady=true. Auto-reveal answer; host must call host:backToBoard.
    const { categoryIndex, clueIndex } = entry.state.currentClue;
    const clue = entry.state.board[`round${entry.state.currentRound}`].categories[categoryIndex].clues[clueIndex];
    io.to(gameCode).emit('game:answerRevealed', {
      answer: clue.answer,
      answerImage: clue.answerImage || null,
    });
    io.to(gameCode).emit('game:boardReady', { players: pub.players });
  } else {
    await Game.updateOne({ gameCode }, { $set: { revealedClues: pub.revealedClues } });
    if (phase === 'clue') {
      io.to(gameCode).emit('game:wrongAnswer', {
        players: pub.players,
        judgedPlayer,
        buzzedPlayers: entry.state.buzzedPlayers,
      });
    } else if (phase === 'between-rounds') {
      io.to(gameCode).emit('game:betweenRounds', { players: pub.players });
    } else if (phase === 'final-wager') {
      io.to(gameCode).emit('game:finalWager', { category: entry.state.board.finalJeopardy.category });
    } else if (phase === 'finished') {
      await Game.updateOne({ gameCode }, { $set: { status: 'finished', completedAt: new Date() } });
      io.to(gameCode).emit('game:finished', { players: pub.players });
    } else {
      // board phase — all-incorrect auto-skip
      io.to(gameCode).emit('game:scored', {
        players: pub.players,
        currentPicker: pub.currentPicker,
        currentRound: pub.currentRound,
        revealedClues: pub.revealedClues.filter(r => r.round === entry.state.currentRound),
      });
    }
  }
});
```

- [ ] **Step 2: Add `host:backToBoard` handler**

Add this block immediately before the `host:endGame` handler:

```js
socket.on('host:backToBoard', async () => {
  const entry = _getHostEntry(socket);
  if (!entry) return;
  const gameCode = _gameCodeFor(socket);
  try { entry.state.backToBoard(); } catch (err) {
    return socket.emit('error:generic', { message: err.message });
  }
  const pub = entry.state.getPublicState();
  await Game.updateOne({ gameCode }, { $set: { revealedClues: pub.revealedClues } });

  const phase = entry.state.phase;
  if (phase === 'between-rounds') {
    io.to(gameCode).emit('game:betweenRounds', { players: pub.players });
  } else if (phase === 'final-wager') {
    io.to(gameCode).emit('game:finalWager', { category: entry.state.board.finalJeopardy.category });
  } else if (phase === 'finished') {
    await Game.updateOne({ gameCode }, { $set: { status: 'finished', completedAt: new Date() } });
    io.to(gameCode).emit('game:finished', { players: pub.players });
  } else {
    io.to(gameCode).emit('game:scored', {
      players: pub.players,
      currentPicker: pub.currentPicker,
      currentRound: pub.currentRound,
      revealedClues: pub.revealedClues.filter(r => r.round === entry.state.currentRound),
    });
  }
});
```

- [ ] **Step 3: Delete `host:revealAnswer` handler**

Remove these lines entirely from `gameHandlers.js` (lines 342–353):

```js
socket.on('host:revealAnswer', () => {
  const entry = _getHostEntry(socket);
  if (!entry) return;
  if (entry.state.phase !== 'judging') return;
  const gameCode = _gameCodeFor(socket);
  const { categoryIndex, clueIndex } = entry.state.currentClue;
  const clue = entry.state.board[`round${entry.state.currentRound}`].categories[categoryIndex].clues[clueIndex];
  io.to(gameCode).emit('game:answerRevealed', {
    answer: clue.answer,
    answerImage: clue.answerImage || null,
  });
});
```

- [ ] **Step 4: Update `full game flow` integration tests**

In `server/tests/integration/socket.test.js`, replace the `correct answer: scores player, returns to board` test:

```js
test('correct answer: auto-reveals answer then returns to board after backToBoard', async () => {
  const { gameCode } = await setupGame();
  const host = await makeClient();
  const alice = await makeClient();
  const bob = await makeClient();

  host.emit('host:join', { gameCode });
  await waitFor(host, 'host:joined');
  alice.emit('player:join', { gameCode, name: 'Alice' });
  await waitFor(alice, 'player:joined');
  bob.emit('player:join', { gameCode, name: 'Bob' });
  await waitFor(bob, 'player:joined');
  host.emit('host:startGame', { gameCode });
  await waitFor(host, 'game:started');

  host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 2 }); // $600
  await waitFor(alice, 'game:clueRevealed');
  host.emit('host:unlock');
  await waitFor(alice, 'game:buzzersOpen');
  alice.emit('player:buzz');
  const claimed = await waitFor(host, 'game:buzzClaimed');
  expect(claimed.playerName).toBe('Alice');

  const answerRevealed = waitFor(alice, 'game:answerRevealed');
  const boardReady = waitFor(alice, 'game:boardReady');
  host.emit('host:judge', { result: 'correct' });
  const revealData = await answerRevealed;
  expect(revealData.answer).toBe('R1-A0-2');
  const boardReadyData = await boardReady;
  expect(boardReadyData.players.find(p => p.name === 'Alice').score).toBe(600);

  const scored = waitFor(alice, 'game:scored');
  host.emit('host:backToBoard');
  const scoredData = await scored;
  expect(scoredData.players.find(p => p.name === 'Alice').score).toBe(600);
  expect(scoredData.currentPicker).toBe('Alice');

  host.disconnect(); alice.disconnect(); bob.disconnect();
});
```

And replace `incorrect then correct: first wrong player loses points, second gains`:

```js
test('incorrect then correct: first wrong player loses points, second gains', async () => {
  const { gameCode } = await setupGame();
  const host = await makeClient();
  const alice = await makeClient();
  const bob = await makeClient();

  host.emit('host:join', { gameCode });
  await waitFor(host, 'host:joined');
  alice.emit('player:join', { gameCode, name: 'Alice' });
  await waitFor(alice, 'player:joined');
  bob.emit('player:join', { gameCode, name: 'Bob' });
  await waitFor(bob, 'player:joined');
  host.emit('host:startGame', { gameCode });
  await waitFor(host, 'game:started');
  host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 0 }); // $200
  await waitFor(alice, 'game:clueRevealed');
  host.emit('host:unlock');
  await waitFor(alice, 'game:buzzersOpen');

  alice.emit('player:buzz');
  await waitFor(host, 'game:buzzClaimed');
  host.emit('host:judge', { result: 'incorrect' });
  await waitFor(alice, 'game:wrongAnswer'); // Alice: -200, buzzers re-open

  bob.emit('player:buzz');
  await waitFor(host, 'game:buzzClaimed');

  const boardReady = waitFor(bob, 'game:boardReady');
  host.emit('host:judge', { result: 'correct' });
  await boardReady;

  const scored = waitFor(bob, 'game:scored');
  host.emit('host:backToBoard');
  const scoredData = await scored;
  expect(scoredData.players.find(p => p.name === 'Alice').score).toBe(-200);
  expect(scoredData.players.find(p => p.name === 'Bob').score).toBe(200);

  host.disconnect(); alice.disconnect(); bob.disconnect();
});
```

- [ ] **Step 5: Replace `describe('host:revealAnswer')` suite**

Delete the entire `describe('host:revealAnswer', ...)` block (lines 451–515) and replace it with:

```js
describe('correct judgment auto-reveals answer', () => {
  async function reachJudgingPhase(gameCode) {
    const host = await makeClient();
    const display = await makeClient();
    const p1 = await makeClient();
    const p2 = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');
    p1.emit('player:join', { gameCode, name: 'Alice' });
    await waitFor(p1, 'player:joined');
    p2.emit('player:join', { gameCode, name: 'Bob' });
    await waitFor(p2, 'player:joined');
    host.emit('host:startGame', { gameCode });
    await waitFor(host, 'host:state');
    host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 0 });
    await waitFor(host, 'host:clue');
    host.emit('host:unlock');
    await waitFor(display, 'game:buzzersOpen');
    p1.emit('player:buzz');
    await waitFor(display, 'game:buzzClaimed');
    return { host, display, p1, p2 };
  }

  test('host:judge correct broadcasts game:answerRevealed with answer and answerImage', async () => {
    const board = makeTestBoard();
    board.round1.categories[0].clues[0].answerImage = 'https://example.com/ans.jpg';
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const { host, display, p1, p2 } = await reachJudgingPhase(gameCode);
    const revealed = waitFor(display, 'game:answerRevealed');
    host.emit('host:judge', { result: 'correct' });
    const data = await revealed;
    expect(data.answer).toBe('R1-A0-0');
    expect(data.answerImage).toBe('https://example.com/ans.jpg');
    host.disconnect(); display.disconnect(); p1.disconnect(); p2.disconnect();
  });

  test('game:answerRevealed has null answerImage when clue has none', async () => {
    const { gameCode } = await setupGame();
    const { host, display, p1, p2 } = await reachJudgingPhase(gameCode);
    const revealed = waitFor(display, 'game:answerRevealed');
    host.emit('host:judge', { result: 'correct' });
    const data = await revealed;
    expect(data.answer).toBe('R1-A0-0');
    expect(data.answerImage).toBeNull();
    host.disconnect(); display.disconnect(); p1.disconnect(); p2.disconnect();
  });

  test('game:answerRevealed is NOT emitted on incorrect judgment', async () => {
    const { gameCode } = await setupGame();
    const { host, display, p1, p2 } = await reachJudgingPhase(gameCode);
    let received = false;
    display.on('game:answerRevealed', () => { received = true; });
    host.emit('host:judge', { result: 'incorrect' });
    await new Promise(r => setTimeout(r, 150));
    expect(received).toBe(false);
    host.disconnect(); display.disconnect(); p1.disconnect(); p2.disconnect();
  });
});
```

- [ ] **Step 6: Run all server tests — expect all to pass**

```
cd server && npm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```
git add server/src/sockets/gameHandlers.js server/tests/integration/socket.test.js
git commit -m "feat: auto-reveal answer on correct judgment; add host:backToBoard; remove host:revealAnswer"
```

---

## Task 4: HostPage — remove Reveal Answer button, add Back to Board button

**Files:**
- Modify: `client/src/pages/HostPage.jsx`

- [ ] **Step 1: Fix `game:wrongAnswer` listener to keep buzzers open**

In the `init()` function inside `useEffect`, find line 39 and change `buzzerState: 'locked'` to `buzzerState: 'open'`:

```js
socket.on('game:wrongAnswer', ({ players, buzzedPlayers }) => setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'open', players, buzzedPlayers: buzzedPlayers || [] })));
```

- [ ] **Step 2: Add `game:boardReady` listener**

Add this line after the `game:wrongAnswer` listener:

```js
socket.on('game:boardReady', ({ players }) => setGame(g => ({ ...g, boardReady: true, players })));
```

- [ ] **Step 3: Reset `boardReady` on `game:scored`**

Find the `game:scored` handler and add `boardReady: false`:

```js
socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
  setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null, answerRevealed: false, boardReady: false })));
```

- [ ] **Step 4: Reset `boardReady` on `host:clue`**

Find the `host:clue` handler and add `boardReady: false`:

```js
socket.on('host:clue', clue => setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null, answerRevealed: false, boardReady: false, buzzerState: 'locked', videoPlayed: false })));
```

- [ ] **Step 5: Update `HostClue` component — replace judging phase buttons**

In the `HostClue` function, update the destructuring to include `boardReady`:

```js
const { currentClue, phase, buzzedBy, players, buzzerState, boardReady } = game;
```

Then find the judging phase block (currently starts with `{phase === 'judging' && clueData && (`) and replace it entirely with:

```jsx
{phase === 'judging' && clueData && (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    {!boardReady ? (
      <>
        <button onClick={() => socket.emit('host:judge', { result: 'correct' })}
          style={{ flex: 1, padding: 16, background: '#14532d', border: '2px solid #16a34a', color: 'var(--color-green)', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}>
          ✓ Correct<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>+${clueValue}</span>
        </button>
        <button onClick={() => socket.emit('host:judge', { result: 'incorrect' })}
          style={{ flex: 1, padding: 16, background: '#450a0a', border: '2px solid #b91c1c', color: 'var(--color-red)', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}>
          ✗ Incorrect<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>-${clueValue}</span>
        </button>
      </>
    ) : (
      <button
        onClick={() => socket.emit('host:backToBoard')}
        style={{ width: '100%', padding: 16, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
        ← Back to Board
      </button>
    )}
  </div>
)}
```

- [ ] **Step 6: Commit**

```
git add client/src/pages/HostPage.jsx
git commit -m "feat: replace Reveal Answer + Unlock flow with auto-reveal and Back to Board button"
```

---

## Task 5: PlayerPage and DisplayPage — fix stuck buzzers bug

**Files:**
- Modify: `client/src/pages/PlayerPage.jsx`
- Modify: `client/src/pages/DisplayPage.jsx`

- [ ] **Step 1: Fix PlayerPage `game:wrongAnswer` handler**

In `client/src/pages/PlayerPage.jsx`, find line 72 and change `buzzerState: 'locked'` to `buzzerState: 'open'`:

```js
socket.on('game:wrongAnswer', ({ players, buzzedPlayers }) => setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'open', players, myBuzzedOut: (buzzedPlayers || []).includes(myName) })));
```

- [ ] **Step 2: Fix DisplayPage `game:wrongAnswer` handler**

In `client/src/pages/DisplayPage.jsx`, find line 25 and change `buzzerState: 'locked'` to `buzzerState: 'open'`:

```js
socket.on('game:wrongAnswer', ({ players }) =>
  setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'open', players })));
```

- [ ] **Step 3: Add `game:boardReady` listener to DisplayPage**

Add this line after the `game:buzzClaimed` listener in `DisplayPage.jsx`:

```js
socket.on('game:boardReady', ({ players }) => setGame(g => ({ ...g, players })));
```

- [ ] **Step 4: Commit**

```
git add client/src/pages/PlayerPage.jsx client/src/pages/DisplayPage.jsx
git commit -m "fix: buzzers stay open after wrong answer on player and display pages"
```

---

## Self-Review

**Spec coverage:**
- ✅ Remove "Reveal Answer" button → Task 4 Step 5
- ✅ Auto-reveal answer on correct → Task 3 Step 1 (`game:answerRevealed` emitted in `host:judge` handler)
- ✅ "Back to Board" button for host → Task 4 Step 5
- ✅ Wrong answer: buzzers stay open for others → Task 4 Step 1, Task 5 Steps 1–2
- ✅ Wrong-answerer blocked via `myBuzzedOut` → unchanged, already works
- ✅ `boardReady` flag in GameState → Task 1
- ✅ `backToBoard()` method → Task 1
- ✅ `host:backToBoard` socket handler → Task 3 Step 2
- ✅ Remove `host:revealAnswer` handler → Task 3 Step 3
- ✅ Display gets updated scores before `game:scored` → Task 5 Step 3

**Placeholder scan:** No TBDs or TODOs found.

**Type consistency:**
- `boardReady` used consistently across GameState, gameHandlers, HostPage
- `host:backToBoard` event name used consistently in gameHandlers and HostPage
- `game:boardReady` event name used consistently in gameHandlers, HostPage, DisplayPage
