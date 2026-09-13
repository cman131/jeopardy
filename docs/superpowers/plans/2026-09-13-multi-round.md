# Multi-Round Jeopardy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the game from single-round to three rounds: Round 1 (Jeopardy, $200–$1000), Round 2 (Double Jeopardy, $400–$2000), and Final Jeopardy (wager + written answer + sequential reveal).

**Architecture:** The board document gains `round1`, `round2`, and `finalJeopardy` sections; the `GameState` class gains new phases (`between-rounds`, `final-wager`, `final-clue`, `final-judging`, `final-reveal`) and new in-memory maps for wagers/answers/judgments. Clue values are computed from position × round multiplier — never stored. The board editor gains three tabs and the client pages gain new UI for all new phases.

**Tech Stack:** Node.js + Express + Socket.io, Mongoose/MongoDB, React/Vite. Tests use Jest + `socket.io-client`.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `server/src/models/Board.js` | New schema: round1, round2, finalJeopardy sections |
| Modify | `server/src/models/Game.js` | Add round to revealedClue; add finalJeopardy entries |
| Modify | `server/src/routes/boards.js` | Extract new shape from POST/PUT body |
| Modify | `server/src/game/GameState.js` | Full rewrite: multi-round phases, FJ logic |
| Modify | `server/src/sockets/gameHandlers.js` | 7 new event handlers; update existing handlers for multi-phase |
| Modify | `server/tests/helpers.js` | `makeTestBoard()` returns new 3-section shape |
| Modify | `server/tests/unit/GameState.test.js` | Update existing tests; add new describe blocks |
| Modify | `client/src/components/BoardEditorGrid.jsx` | Accept `{categories, values, onChange}` instead of full board |
| Modify | `client/src/pages/EditorPage.jsx` | 3-tab UI, new emptyBoard, new validateBoardJson, countFilled |
| Modify | `client/src/components/GameBoard.jsx` | Accept `round` prop; compute values from round |
| Modify | `client/src/pages/HostPage.jsx` | New phase components for all FJ phases + between-rounds |
| Modify | `client/src/pages/DisplayPage.jsx` | New phase views for all FJ phases + between-rounds |
| Modify | `client/src/pages/PlayerPage.jsx` | New views for between-rounds + all FJ phases |

---

## Task 1: Data Models

**Files:**
- Modify: `server/src/models/Board.js`
- Modify: `server/src/models/Game.js`
- Modify: `server/src/routes/boards.js`
- Modify: `server/tests/helpers.js`

- [ ] **Step 1: Update Board.js schema**

Replace the entire file with:

```js
const mongoose = require('mongoose');

const clueSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  clues: {
    type: [clueSchema],
    validate: { validator: v => v.length === 5, message: '5 clues required per category' },
  },
});

const roundSchema = new mongoose.Schema({
  categories: {
    type: [categorySchema],
    validate: { validator: v => v.length === 6, message: '6 categories required per round' },
  },
}, { _id: false });

const finalJeopardySchema = new mongoose.Schema({
  category: { type: String, required: true },
  clue: { type: String, required: true },
  answer: { type: String, required: true },
}, { _id: false });

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  round1: { type: roundSchema, required: true },
  round2: { type: roundSchema, required: true },
  finalJeopardy: { type: finalJeopardySchema, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Board', boardSchema);
```

- [ ] **Step 2: Update Game.js schema**

Open `server/src/models/Game.js`. Make these targeted changes:

1. In `scoreHistorySchema`, remove `required: true` from `categoryIndex` and `clueIndex`, and add `isFinal`:
```js
const scoreHistorySchema = new mongoose.Schema({
  isFinal: { type: Boolean, default: false },
  categoryIndex: { type: Number },
  clueIndex: { type: Number },
  clueValue: { type: Number, required: true },
  result: { type: String, enum: ['correct', 'incorrect'], required: true },
  delta: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });
```

2. In `revealedClueSchema`, add `round`:
```js
const revealedClueSchema = new mongoose.Schema({
  round: { type: Number, enum: [1, 2], required: true },
  categoryIndex: { type: Number, required: true },
  clueIndex: { type: Number, required: true },
}, { _id: false });
```

3. Add `finalJeopardyEntrySchema` before `gameSchema`:
```js
const finalJeopardyEntrySchema = new mongoose.Schema({
  playerName: { type: String, required: true },
  wager: { type: Number },
  answer: { type: String },
  correct: { type: Boolean, default: null },
}, { _id: false });
```

4. Add `finalJeopardy` field to `gameSchema`:
```js
finalJeopardy: { type: [finalJeopardyEntrySchema], default: [] },
```

- [ ] **Step 3: Update boards route to handle new shape**

Open `server/src/routes/boards.js`. In the POST handler, change the body extraction from:
```js
const { name, categories } = req.body;
```
to:
```js
const { name, round1, round2, finalJeopardy } = req.body;
```

And update the Board construction:
```js
const board = new Board({ name, round1, round2, finalJeopardy });
```

Do the same for the PUT handler:
```js
const { name, round1, round2, finalJeopardy } = req.body;
await Board.findByIdAndUpdate(req.params.id, { name, round1, round2, finalJeopardy }, { new: true, runValidators: true });
```

- [ ] **Step 4: Update test helper makeTestBoard**

Open `server/tests/helpers.js`. Replace `makeTestBoard` (or add it if only `makeTestGame` exists):

```js
function makeTestBoard(overrides = {}) {
  const makeRound = (prefix) => ({
    categories: Array.from({ length: 6 }, (_, ci) => ({
      name: `${prefix}-CAT${ci}`,
      clues: Array.from({ length: 5 }, (_, qi) => ({
        question: `${prefix}-Q${ci}-${qi}`,
        answer: `${prefix}-A${ci}-${qi}`,
      })),
    })),
  });
  return {
    name: 'Test Board',
    round1: makeRound('R1'),
    round2: makeRound('R2'),
    finalJeopardy: { category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER' },
    ...overrides,
  };
}
```

Export it alongside existing exports.

- [ ] **Step 5: Run existing tests to see current failures**

```
cd server && npm test
```

Expected: failures related to board shape (categories vs round1/round2). This confirms the data model changes are live. Note which tests fail.

- [ ] **Step 6: Commit**

```
git add server/src/models/Board.js server/src/models/Game.js server/src/routes/boards.js server/tests/helpers.js
git commit -m "feat: multi-round board and game schemas"
```

---

## Task 2: GameState Core Refactor

**Files:**
- Modify: `server/src/game/GameState.js`
- Modify: `server/tests/unit/GameState.test.js`

This task rewrites `GameState` to work with the new board shape and adds the `clueValue` helper. It does NOT add new phases — just makes the existing lobby→board→clue→judging→finished cycle work with round-aware data.

- [ ] **Step 1: Write failing tests for the refactored core**

Open `server/tests/unit/GameState.test.js`. Replace the `makeBoard()` helper at the top of the file:

```js
const { GameState, clueValue } = require('../../src/game/GameState');

function makeBoard(overrides = {}) {
  const makeRound = (prefix) => ({
    categories: Array.from({ length: 6 }, (_, ci) => ({
      name: `${prefix}-CAT${ci}`,
      clues: Array.from({ length: 5 }, (_, qi) => ({
        question: `${prefix}-Q${ci}-${qi}`,
        answer: `${prefix}-A${ci}-${qi}`,
      })),
    })),
  });
  return {
    name: 'Test Board',
    round1: makeRound('R1'),
    round2: makeRound('R2'),
    finalJeopardy: { category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER' },
    ...overrides,
  };
}
```

Add these tests (update existing describe blocks for `clueValue` and `revealedClues`):

```js
describe('clueValue', () => {
  test('round 1 values are $200-$1000', () => {
    expect(clueValue(1, 0)).toBe(200);
    expect(clueValue(1, 4)).toBe(1000);
  });
  test('round 2 values are $400-$2000', () => {
    expect(clueValue(2, 0)).toBe(400);
    expect(clueValue(2, 4)).toBe(2000);
  });
});

describe('selectClue', () => {
  test('revealedClues entry includes round: 1 after round 1 clue is scored', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.start();
    gs.selectClue(0, 0);
    gs.openBuzzers();
    gs.buzz('Alice');
    gs.judge('correct');
    expect(gs.revealedClues[0]).toMatchObject({ round: 1, categoryIndex: 0, clueIndex: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd server && npm test -- --testPathPattern=GameState
```

Expected: FAIL — `clueValue` not exported, `revealedClues` entries lack `round`.

- [ ] **Step 3: Rewrite GameState.js**

Replace the entire file with:

```js
function clueValue(round, clueIndex) {
  return (clueIndex + 1) * (round === 1 ? 200 : 400);
}

class GameState {
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
  }

  _currentCategories() {
    return this.board[`round${this.currentRound}`].categories;
  }

  addPlayer(name) {
    if (this.phase !== 'lobby') throw new Error('Game already started');
    if (this.players.find(p => p.name === name)) throw new Error('Name taken');
    this.players.push({ name, score: 0, scoreHistory: [] });
  }

  start() {
    if (this.phase !== 'lobby') throw new Error('Invalid phase');
    if (this.players.length < 2) throw new Error('Need at least 2 players');
    this.currentPicker = this.players[0].name;
    this.phase = 'board';
  }

  selectClue(categoryIndex, clueIndex) {
    if (this.phase !== 'board') throw new Error('Invalid phase');
    const cats = this._currentCategories();
    if (categoryIndex < 0 || categoryIndex >= cats.length) throw new Error('Invalid category');
    if (clueIndex < 0 || clueIndex >= cats[categoryIndex].clues.length) throw new Error('Invalid clue');
    const alreadyRevealed = this.revealedClues.some(
      r => r.round === this.currentRound && r.categoryIndex === categoryIndex && r.clueIndex === clueIndex
    );
    if (alreadyRevealed) throw new Error('Clue already revealed');
    this.currentClue = { categoryIndex, clueIndex };
    this.buzzedPlayers = [];
    this.buzzedBy = null;
    this.buzzerState = 'locked';
    this.phase = 'clue';
  }

  openBuzzers() {
    if (this.phase !== 'clue') throw new Error('Invalid phase');
    this.buzzerState = 'open';
  }

  buzz(playerName) {
    if (this.phase !== 'clue' || this.buzzerState !== 'open') throw new Error('Buzzers not open');
    if (this.buzzedPlayers.includes(playerName)) throw new Error('Already buzzed');
    this.buzzedPlayers.push(playerName);
    this.buzzedBy = playerName;
    this.buzzerState = 'claimed';
    this.phase = 'judging';
  }

  judge(result) {
    if (this.phase !== 'judging') throw new Error('Invalid phase');
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
      this._closeClue();
    } else {
      this.buzzedBy = null;
      this.buzzerState = 'open';
      this.phase = 'clue';
    }
  }

  skipClue() {
    if (this.phase !== 'clue') throw new Error('Invalid phase');
    this._closeClue();
  }

  _closeClue() {
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

  _allRevealedInRound() {
    return this.revealedClues.filter(r => r.round === this.currentRound).length >= 30;
  }

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
      } : null,
      wagersSubmitted: [...this.finalWagers.keys()],
      answersSubmitted: [...this.finalAnswers.keys()],
      finalRevealIndex: this.finalRevealIndex,
      finalJeopardyCategory: this.board.finalJeopardy?.category,
    };
  }

  getHostState() {
    const state = this.getPublicState();
    if (this.currentClue) {
      state.currentClue.answer = this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].answer;
    }
    if (this.phase === 'final-judging') {
      state.finalAnswers = Object.fromEntries(this.finalAnswers);
      state.finalWagers = Object.fromEntries(this.finalWagers);
    }
    return state;
  }
}

module.exports = { GameState, clueValue };
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd server && npm test -- --testPathPattern=GameState
```

Expected: PASS for all existing tests plus new `clueValue` and `revealedClues round` tests.

- [ ] **Step 5: Commit**

```
git add server/src/game/GameState.js server/tests/unit/GameState.test.js
git commit -m "feat: GameState core refactor for multi-round board shape"
```

---

## Task 3: GameState Between-Rounds + startRound2

**Files:**
- Modify: `server/src/game/GameState.js`
- Modify: `server/tests/unit/GameState.test.js`

- [ ] **Step 1: Write failing tests**

Add to `server/tests/unit/GameState.test.js`:

```js
describe('between-rounds', () => {
  function makeR1CompletedGs() {
    const board = makeBoard();
    const gs = new GameState(board);
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.start();
    // Reveal all 30 round-1 clues by selecting each, skipping
    for (let ci = 0; ci < 6; ci++) {
      for (let qi = 0; qi < 5; qi++) {
        gs.selectClue(ci, qi);
        gs.skipClue();
      }
    }
    return gs;
  }

  test('phase transitions to between-rounds after all 30 round-1 clues revealed', () => {
    const gs = makeR1CompletedGs();
    expect(gs.phase).toBe('between-rounds');
  });

  test('startRound2 transitions to board phase with currentRound = 2', () => {
    const gs = makeR1CompletedGs();
    gs.startRound2();
    expect(gs.phase).toBe('board');
    expect(gs.currentRound).toBe(2);
  });

  test('startRound2 sets currentPicker to player with highest score', () => {
    const gs = makeR1CompletedGs();
    gs.players[1].score = 1000; // Bob has more
    gs.startRound2();
    expect(gs.currentPicker).toBe('Bob');
  });

  test('startRound2 throws if not in between-rounds phase', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.start();
    expect(() => gs.startRound2()).toThrow('Invalid phase');
  });

  test('round 2 clue values are doubled', () => {
    const gs = makeR1CompletedGs();
    gs.startRound2();
    gs.selectClue(0, 0);
    const state = gs.getPublicState();
    expect(state.currentClue.value).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd server && npm test -- --testPathPattern=GameState
```

Expected: FAIL — `startRound2` is not a method.

- [ ] **Step 3: Add startRound2 to GameState.js**

In `server/src/game/GameState.js`, add the `startRound2` method after `skipClue`:

```js
startRound2() {
  if (this.phase !== 'between-rounds') throw new Error('Invalid phase');
  this.currentRound = 2;
  this.currentClue = null;
  this.buzzerState = 'locked';
  this.buzzedBy = null;
  this.buzzedPlayers = [];
  const sorted = [...this.players].sort((a, b) => b.score - a.score);
  this.currentPicker = sorted[0].name;
  this.phase = 'board';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd server && npm test -- --testPathPattern=GameState
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add server/src/game/GameState.js server/tests/unit/GameState.test.js
git commit -m "feat: GameState between-rounds and startRound2"
```

---

## Task 4: GameState Final Jeopardy State Machine

**Files:**
- Modify: `server/src/game/GameState.js`
- Modify: `server/tests/unit/GameState.test.js`

- [ ] **Step 1: Write failing tests**

Add to `server/tests/unit/GameState.test.js`:

```js
describe('Final Jeopardy', () => {
  function makeFjGs() {
    const board = makeBoard();
    const gs = new GameState(board);
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.start();
    // Skip all round 1 clues
    for (let ci = 0; ci < 6; ci++)
      for (let qi = 0; qi < 5; qi++) { gs.selectClue(ci, qi); gs.skipClue(); }
    gs.startRound2();
    // Skip all round 2 clues
    for (let ci = 0; ci < 6; ci++)
      for (let qi = 0; qi < 5; qi++) { gs.selectClue(ci, qi); gs.skipClue(); }
    return gs;
  }

  test('phase transitions to final-wager after all round 2 clues revealed', () => {
    const gs = makeFjGs();
    expect(gs.phase).toBe('final-wager');
  });

  test('submitWager accepts valid wager and records it', () => {
    const gs = makeFjGs();
    gs.submitWager('Alice', 500);
    expect(gs.finalWagers.get('Alice')).toBe(500);
    expect(gs.phase).toBe('final-wager'); // still waiting for Bob
  });

  test('submitWager rejects wager above max(score, 1000)', () => {
    const gs = makeFjGs();
    gs.players[0].score = 0;
    expect(() => gs.submitWager('Alice', 1001)).toThrow('Invalid wager');
  });

  test('submitWager rejects negative wager', () => {
    const gs = makeFjGs();
    expect(() => gs.submitWager('Alice', -1)).toThrow('Invalid wager');
  });

  test('max wager is score when score > 1000', () => {
    const gs = makeFjGs();
    gs.players[0].score = 5000;
    gs.submitWager('Alice', 5000);
    expect(gs.finalWagers.get('Alice')).toBe(5000);
  });

  test('phase advances to final-clue when all players submit wager', () => {
    const gs = makeFjGs();
    gs.submitWager('Alice', 500);
    gs.submitWager('Bob', 300);
    expect(gs.phase).toBe('final-clue');
  });

  test('closeWagers defaults missing wagers to 0 and advances to final-clue', () => {
    const gs = makeFjGs();
    gs.submitWager('Alice', 500);
    gs.closeWagers();
    expect(gs.finalWagers.get('Bob')).toBe(0);
    expect(gs.phase).toBe('final-clue');
  });

  test('submitAnswer records answer and advances phase when all submit', () => {
    const gs = makeFjGs();
    gs.submitWager('Alice', 500);
    gs.submitWager('Bob', 300);
    gs.submitAnswer('Alice', 'What is X?');
    expect(gs.phase).toBe('final-clue'); // still waiting for Bob
    gs.submitAnswer('Bob', 'What is Y?');
    expect(gs.phase).toBe('final-judging');
  });

  test('closeAnswers defaults missing answers to blank and advances to final-judging', () => {
    const gs = makeFjGs();
    gs.submitWager('Alice', 500);
    gs.submitWager('Bob', 300);
    gs.submitAnswer('Alice', 'What is X?');
    gs.closeAnswers();
    expect(gs.finalAnswers.get('Bob')).toBe('');
    expect(gs.phase).toBe('final-judging');
  });

  test('judgeFinal records judgment and transitions to final-reveal when all judged', () => {
    const gs = makeFjGs();
    gs.submitWager('Alice', 500);
    gs.submitWager('Bob', 300);
    gs.submitAnswer('Alice', 'What is X?');
    gs.submitAnswer('Bob', 'What is Y?');
    gs.judgeFinal('Alice', true);
    expect(gs.phase).toBe('final-judging'); // still waiting for Bob
    gs.judgeFinal('Bob', false);
    expect(gs.phase).toBe('final-reveal');
  });

  test('finalRevealOrder is ascending by score', () => {
    const gs = makeFjGs();
    gs.players[0].score = 2000; // Alice
    gs.players[1].score = 1000; // Bob
    gs.submitWager('Alice', 500);
    gs.submitWager('Bob', 300);
    gs.submitAnswer('Alice', 'A');
    gs.submitAnswer('Bob', 'B');
    gs.judgeFinal('Alice', true);
    gs.judgeFinal('Bob', false);
    expect(gs.finalRevealOrder).toEqual(['Bob', 'Alice']);
  });

  test('revealNext returns reveal data and updates score', () => {
    const gs = makeFjGs();
    gs.players[0].score = 1000; // Alice
    gs.players[1].score = 2000; // Bob — revealed first (ascending)
    gs.submitWager('Alice', 200);
    gs.submitWager('Bob', 500);
    gs.submitAnswer('Alice', 'A');
    gs.submitAnswer('Bob', 'B');
    gs.judgeFinal('Alice', true);
    gs.judgeFinal('Bob', false);
    const reveal = gs.revealNext(); // Bob revealed first (lower score)
    expect(reveal).toEqual({ playerName: 'Bob', wager: 500, answer: 'B', correct: false });
    expect(gs.players.find(p => p.name === 'Bob').score).toBe(1500); // 2000 - 500
  });

  test('phase transitions to finished after last reveal', () => {
    const gs = makeFjGs();
    gs.submitWager('Alice', 200);
    gs.submitWager('Bob', 300);
    gs.submitAnswer('Alice', 'A');
    gs.submitAnswer('Bob', 'B');
    gs.judgeFinal('Alice', true);
    gs.judgeFinal('Bob', false);
    gs.revealNext();
    expect(gs.phase).toBe('final-reveal'); // still one more
    gs.revealNext();
    expect(gs.phase).toBe('finished');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd server && npm test -- --testPathPattern=GameState
```

Expected: FAIL — `submitWager`, `closeWagers`, `submitAnswer`, `closeAnswers`, `judgeFinal`, `revealNext` are not methods.

- [ ] **Step 3: Add FJ methods to GameState.js**

After `startRound2`, add:

```js
submitWager(playerName, wager) {
  if (this.phase !== 'final-wager') throw new Error('Invalid phase');
  const player = this.players.find(p => p.name === playerName);
  if (!player) throw new Error('Player not found');
  const maxWager = Math.max(player.score, 1000);
  if (typeof wager !== 'number' || wager < 0 || wager > maxWager) throw new Error('Invalid wager');
  this.finalWagers.set(playerName, wager);
  if (this.finalWagers.size >= this.players.length) this.phase = 'final-clue';
}

closeWagers() {
  if (this.phase !== 'final-wager') throw new Error('Invalid phase');
  for (const player of this.players) {
    if (!this.finalWagers.has(player.name)) this.finalWagers.set(player.name, 0);
  }
  this.phase = 'final-clue';
}

submitAnswer(playerName, answer) {
  if (this.phase !== 'final-clue') throw new Error('Invalid phase');
  if (!this.players.find(p => p.name === playerName)) throw new Error('Player not found');
  this.finalAnswers.set(playerName, answer);
  if (this.finalAnswers.size >= this.players.length) this.phase = 'final-judging';
}

closeAnswers() {
  if (this.phase !== 'final-clue') throw new Error('Invalid phase');
  for (const player of this.players) {
    if (!this.finalAnswers.has(player.name)) this.finalAnswers.set(player.name, '');
  }
  this.phase = 'final-judging';
}

judgeFinal(playerName, correct) {
  if (this.phase !== 'final-judging') throw new Error('Invalid phase');
  if (!this.players.find(p => p.name === playerName)) throw new Error('Player not found');
  this.finalJudgments.set(playerName, correct);
  if (this.finalJudgments.size >= this.players.length) {
    this.finalRevealOrder = [...this.players]
      .sort((a, b) => a.score - b.score)
      .map(p => p.name);
    this.finalRevealIndex = 0;
    this.phase = 'final-reveal';
  }
}

revealNext() {
  if (this.phase !== 'final-reveal') throw new Error('Invalid phase');
  const playerName = this.finalRevealOrder[this.finalRevealIndex];
  const player = this.players.find(p => p.name === playerName);
  const wager = this.finalWagers.get(playerName);
  const answer = this.finalAnswers.get(playerName);
  const correct = this.finalJudgments.get(playerName);
  const delta = correct ? wager : -wager;
  player.score += delta;
  player.scoreHistory.push({
    isFinal: true,
    clueValue: wager,
    result: correct ? 'correct' : 'incorrect',
    delta,
    timestamp: new Date(),
  });
  this.finalRevealIndex++;
  if (this.finalRevealIndex >= this.players.length) this.phase = 'finished';
  return { playerName, wager, answer, correct };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd server && npm test -- --testPathPattern=GameState
```

Expected: PASS all tests.

- [ ] **Step 5: Commit**

```
git add server/src/game/GameState.js server/tests/unit/GameState.test.js
git commit -m "feat: GameState Final Jeopardy state machine"
```

---

## Task 5: Socket Handlers — Multi-Round Events

**Files:**
- Modify: `server/src/sockets/gameHandlers.js`

- [ ] **Step 1: Update require for GameState**

At the top of `server/src/sockets/gameHandlers.js`, change:
```js
const GameState = require('../game/GameState');
```
to:
```js
const { GameState } = require('../game/GameState');
```

- [ ] **Step 2: Update existing host:judge handler for multi-phase**

Find the `host:judge` handler. After `gs.judge(result)`, the handler currently calls `gs.getPublicState()` and emits `game:scored` or transitions to `finished`. Replace the post-judge logic with:

```js
const phase = gs.phase;
if (phase === 'between-rounds') {
  io.to(gameCode).emit('game:betweenRounds', { players: gs.getPublicState().players });
} else if (phase === 'final-wager') {
  io.to(gameCode).emit('game:finalWager', { category: gs.board.finalJeopardy.category });
} else if (phase === 'finished') {
  io.to(gameCode).emit('game:finished', { players: gs.getPublicState().players });
} else {
  const state = gs.getPublicState();
  io.to(gameCode).emit('game:scored', {
    players: state.players,
    currentPicker: state.currentPicker,
    revealedClues: state.revealedClues.filter(r => r.round === gs.currentRound),
  });
}
```

- [ ] **Step 3: Update host:skipClue handler for multi-phase**

Find the `host:skipClue` handler. After `gs.skipClue()`, replace the emit logic with the same multi-phase check as above (copy the if/else block from Step 2).

- [ ] **Step 4: Update game:started and game:scored emits to include currentRound**

In the `host:startGame` handler, add `currentRound: 1` to the `game:started` emit payload.

In `game:scored` emits (Step 2 and 3), add `currentRound: gs.currentRound` to the payload.

- [ ] **Step 5: Add new socket handlers**

After the existing handlers, add:

```js
socket.on('host:startRound2', () => {
  const entry = games.get(gameCode);
  if (!entry || entry.hostSocketId !== socket.id) return;
  const gs = entry.state;
  try {
    gs.startRound2();
    const state = gs.getPublicState();
    io.to(gameCode).emit('game:round2Started', {
      currentRound: 2,
      categoryNames: state.categoryNames,
      currentPicker: state.currentPicker,
      players: state.players,
    });
  } catch (e) {
    socket.emit('error:generic', { message: e.message });
  }
});

socket.on('player:submitWager', ({ wager }) => {
  const entry = games.get(gameCode);
  if (!entry) return;
  const gs = entry.state;
  try {
    gs.submitWager(playerName, wager);
    io.to(entry.hostSocketId).emit('game:wagerSubmitted', { playerName });
    // emit to display socket if tracked — for now emit to whole room (no amount)
    io.to(gameCode).emit('game:wagerSubmitted', { playerName });
    if (gs.phase === 'final-clue') {
      io.to(gameCode).emit('game:finalClue', {
        category: gs.board.finalJeopardy.category,
        clue: gs.board.finalJeopardy.clue,
      });
    }
  } catch (e) {
    socket.emit('error:generic', { message: e.message });
  }
});

socket.on('host:closeWagers', () => {
  const entry = games.get(gameCode);
  if (!entry || entry.hostSocketId !== socket.id) return;
  const gs = entry.state;
  try {
    gs.closeWagers();
    io.to(gameCode).emit('game:finalClue', {
      category: gs.board.finalJeopardy.category,
      clue: gs.board.finalJeopardy.clue,
    });
  } catch (e) {
    socket.emit('error:generic', { message: e.message });
  }
});

socket.on('player:submitAnswer', ({ answer }) => {
  const entry = games.get(gameCode);
  if (!entry) return;
  const gs = entry.state;
  try {
    gs.submitAnswer(playerName, answer);
    io.to(gameCode).emit('game:answerSubmitted', { playerName });
    if (gs.phase === 'final-judging') {
      const answers = [...gs.finalAnswers.entries()].map(([name, ans]) => ({ playerName: name, answer: ans }));
      io.to(entry.hostSocketId).emit('game:finalJudgingReady', { answers });
      io.to(gameCode).emit('game:finalJudging');
    }
  } catch (e) {
    socket.emit('error:generic', { message: e.message });
  }
});

socket.on('host:closeAnswers', () => {
  const entry = games.get(gameCode);
  if (!entry || entry.hostSocketId !== socket.id) return;
  const gs = entry.state;
  try {
    gs.closeAnswers();
    const answers = [...gs.finalAnswers.entries()].map(([name, ans]) => ({ playerName: name, answer: ans }));
    io.to(entry.hostSocketId).emit('game:finalJudgingReady', { answers });
    io.to(gameCode).emit('game:finalJudging');
  } catch (e) {
    socket.emit('error:generic', { message: e.message });
  }
});

socket.on('host:judgeFinal', ({ playerName: targetName, correct }) => {
  const entry = games.get(gameCode);
  if (!entry || entry.hostSocketId !== socket.id) return;
  const gs = entry.state;
  try {
    gs.judgeFinal(targetName, correct);
    if (gs.phase === 'final-reveal') {
      gs.finalRevealOrder; // already set
      io.to(gameCode).emit('game:revealReady', { players: gs.getPublicState().players });
    }
  } catch (e) {
    socket.emit('error:generic', { message: e.message });
  }
});

socket.on('host:revealNext', () => {
  const entry = games.get(gameCode);
  if (!entry || entry.hostSocketId !== socket.id) return;
  const gs = entry.state;
  try {
    const result = gs.revealNext();
    io.to(gameCode).emit('game:finalReveal', {
      ...result,
      players: gs.getPublicState().players,
    });
    if (gs.phase === 'finished') {
      io.to(gameCode).emit('game:finished', { players: gs.getPublicState().players });
    }
  } catch (e) {
    socket.emit('error:generic', { message: e.message });
  }
});
```

- [ ] **Step 6: Run the server tests**

```
cd server && npm test
```

Expected: all tests pass. If integration tests use `game:scored` assertions, update them to filter `revealedClues` by round.

- [ ] **Step 7: Commit**

```
git add server/src/sockets/gameHandlers.js
git commit -m "feat: socket handlers for multi-round and Final Jeopardy"
```

---

## Task 6: BoardEditorGrid — New Props API

**Files:**
- Modify: `client/src/components/BoardEditorGrid.jsx`

The grid now accepts `{categories, values, onChange}` instead of the full board. `values` is an array of 5 dollar amounts (e.g., `[200,400,600,800,1000]` for R1). `onChange(updatedCategories)` returns just the categories array.

- [ ] **Step 1: Rewrite BoardEditorGrid.jsx**

```jsx
import { useState } from 'react';

// Props: categories (array of 6), values (array of 5 dollar amounts), onChange(updatedCategories)
export default function BoardEditorGrid({ categories, values, onChange }) {
  const [activeCell, setActiveCell] = useState(null); // { ci, qi }

  function updateCategory(ci, name) {
    const updated = categories.map((c, i) => i === ci ? { ...c, name } : c);
    onChange(updated);
  }

  function updateClue(ci, qi, field, value) {
    const updated = categories.map((c, i) => {
      if (i !== ci) return c;
      const clues = c.clues.map((cl, j) => j === qi ? { ...cl, [field]: value } : cl);
      return { ...c, clues };
    });
    onChange(updated);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
      {categories.map((cat, ci) => (
        <div key={ci}>
          <input
            value={cat.name}
            onChange={e => updateCategory(ci, e.target.value)}
            style={{ width: '100%', background: '#1d4ed8', border: '1px solid #3b82f6', borderRadius: 6, padding: '7px 4px', fontSize: 11, fontWeight: 'bold', color: '#fff', textAlign: 'center', boxSizing: 'border-box', marginBottom: 4 }}
          />
          {values.map((value, qi) => {
            const clue = cat.clues[qi] || { question: '', answer: '' };
            const complete = !!(clue.question && clue.answer);
            const isActive = activeCell?.ci === ci && activeCell?.qi === qi;
            return (
              <div key={qi} style={{ marginBottom: 4 }}>
                {!isActive ? (
                  <div
                    onClick={() => setActiveCell({ ci, qi })}
                    style={{ background: '#0f172a', border: `1px solid ${complete ? '#334155' : '#1e293b'}`, borderRadius: 5, padding: '7px 6px', cursor: 'pointer', opacity: complete ? 1 : 0.5 }}
                  >
                    <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 'bold' }}>${value} {complete ? '✓' : ''}</div>
                    {!complete && <div style={{ fontSize: 9, color: '#475569', fontStyle: 'italic' }}>Click to add...</div>}
                    {complete && <div style={{ fontSize: 9, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clue.question}</div>}
                  </div>
                ) : (
                  <div style={{ background: '#1e293b', border: '2px solid #7c3aed', borderRadius: 5, padding: 8 }}>
                    <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 'bold', marginBottom: 4 }}>${value}</div>
                    <div style={{ fontSize: 10, color: '#a5b4fc', marginBottom: 3 }}>CLUE</div>
                    <textarea
                      value={clue.question}
                      onChange={e => updateClue(ci, qi, 'question', e.target.value)}
                      rows={3}
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#fff', fontSize: 10, padding: 5, resize: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ fontSize: 10, color: '#86efac', margin: '5px 0 3px' }}>ANSWER</div>
                    <input
                      value={clue.answer}
                      onChange={e => updateClue(ci, qi, 'answer', e.target.value)}
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#4ade80', fontSize: 10, padding: 5, boxSizing: 'border-box' }}
                    />
                    <button onClick={() => setActiveCell(null)} style={{ marginTop: 6, width: '100%', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 4, padding: 4, fontSize: 10, cursor: 'pointer' }}>Done</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add client/src/components/BoardEditorGrid.jsx
git commit -m "refactor: BoardEditorGrid accepts categories+values props instead of full board"
```

---

## Task 7: EditorPage — Three-Tab Layout

**Files:**
- Modify: `client/src/pages/EditorPage.jsx`

- [ ] **Step 1: Rewrite EditorPage.jsx**

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoardEditorGrid from '../components/BoardEditorGrid';

const R1_VALUES = [200, 400, 600, 800, 1000];
const R2_VALUES = [400, 800, 1200, 1600, 2000];

function emptyRound() {
  return {
    categories: Array.from({ length: 6 }, () => ({
      name: 'CATEGORY',
      clues: Array.from({ length: 5 }, () => ({ question: '', answer: '' })),
    })),
  };
}

function emptyBoard() {
  return {
    name: 'New Board',
    round1: emptyRound(),
    round2: emptyRound(),
    finalJeopardy: { category: '', clue: '', answer: '' },
  };
}

function validateBoardJson(data) {
  if (!data || typeof data !== 'object') return false;
  const validRound = (r) =>
    r && Array.isArray(r.categories) && r.categories.length === 6 &&
    r.categories.every(c => Array.isArray(c.clues) && c.clues.length === 5 &&
      c.clues.every(cl => 'question' in cl && 'answer' in cl));
  const validFj = (fj) => fj && 'category' in fj && 'clue' in fj && 'answer' in fj;
  // Reject old single-round format
  if ('categories' in data) return false;
  return validRound(data.round1) && validRound(data.round2) && validFj(data.finalJeopardy);
}

function countFilled(board) {
  const countRound = (round) =>
    round.categories.reduce((sum, c) => sum + c.clues.filter(cl => cl.question && cl.answer).length, 0);
  const fj = board.finalJeopardy;
  return {
    r1: countRound(board.round1),
    r2: countRound(board.round2),
    fj: (fj.category && fj.clue && fj.answer) ? 1 : 0,
  };
}

export default function EditorPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(emptyBoard());
  const [activeBoardId, setActiveBoardId] = useState(boardId || null);
  const [activeTab, setActiveTab] = useState('round1');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/boards')
      .then(r => { if (!r.ok) throw new Error('Failed to load boards'); return r.json(); })
      .then(setBoards)
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (activeBoardId) {
      fetch(`/api/boards/${activeBoardId}`)
        .then(r => { if (!r.ok) throw new Error('Failed to load board'); return r.json(); })
        .then(b => { setBoard(b); setDirty(false); })
        .catch(err => setError(err.message));
    }
  }, [activeBoardId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const method = activeBoardId ? 'PUT' : 'POST';
      const url = activeBoardId ? `/api/boards/${activeBoardId}` : '/api/boards';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(board) });
      if (!res.ok) throw new Error('Save failed — check that all fields are filled');
      const saved = await res.json();
      const id = activeBoardId || saved._id;
      if (!activeBoardId) {
        setActiveBoardId(saved._id);
        navigate(`/editor/${saved._id}`, { replace: true });
      }
      const allBoards = await fetch('/api/boards').then(r => r.json());
      setBoards(allBoards);
      setDirty(false);
      return id;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function play() {
    try {
      const id = await save();
      const res = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId: id }) });
      if (!res.ok) throw new Error('Failed to create game');
      const { gameCode } = await res.json();
      navigate(`/host/${gameCode}`);
    } catch (err) {
      setError(err.message);
    }
  }

  function confirmDiscard() {
    return !dirty || window.confirm('You have unsaved changes. Discard them?');
  }

  function selectBoard(id) {
    if (!confirmDiscard()) return;
    setActiveBoardId(id);
    setActiveTab('round1');
  }

  function newBoard() {
    if (!confirmDiscard()) return;
    setBoard(emptyBoard());
    setActiveBoardId(null);
    setActiveTab('round1');
    setDirty(false);
    navigate('/editor');
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!validateBoardJson(data)) {
            alert('Invalid board JSON. Must use multi-round format with round1, round2, and finalJeopardy sections. Old single-round boards are not supported.');
            return;
          }
          setBoard(data);
          setActiveBoardId(null);
          setActiveTab('round1');
          setDirty(true);
        } catch { alert('Invalid JSON file'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { r1, r2, fj } = countFilled(board);
  const allFilled = r1 === 30 && r2 === 30 && fj === 1;

  const tabStyle = (tab) => ({
    padding: '8px 16px',
    background: activeTab === tab ? '#1d4ed8' : '#1e293b',
    color: activeTab === tab ? '#fff' : '#64748b',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 'bold',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 12px', borderBottom: '1px solid #1e293b', fontSize: 12, fontWeight: 'bold', color: '#e2e8f0', letterSpacing: 1 }}>MY BOARDS</div>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {boards.map(b => (
            <div key={b._id} onClick={() => selectBoard(b._id)}
              style={{ background: b._id === activeBoardId ? '#1d4ed8' : '#0f172a', borderRadius: 6, padding: '8px 10px', marginBottom: 4, cursor: 'pointer' }}>
              <div style={{ fontSize: 11, color: b._id === activeBoardId ? '#fff' : '#94a3b8' }}>{b.name}</div>
            </div>
          ))}
          <button onClick={newBoard}
            style={{ width: '100%', background: '#0f172a', border: '1px dashed #334155', color: '#64748b', borderRadius: 6, padding: 7, fontSize: 10, cursor: 'pointer', marginTop: 4 }}>
            + New Board
          </button>
        </div>
        <div style={{ padding: 8, borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={importJson} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬆ Import JSON</button>
          <button onClick={exportJson} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬇ Export JSON</button>
        </div>
      </div>

      {/* Main editor area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #b91c1c', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#fca5a5' }}>
            {error}
          </div>
        )}
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input
            value={board.name}
            onChange={e => { setBoard(b => ({ ...b, name: e.target.value })); setDirty(true); }}
            placeholder="Board name"
            maxLength={80}
            style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', fontSize: 15, color: '#fff' }}
          />
          <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
            R1: <span style={{ color: r1 === 30 ? '#4ade80' : '#94a3b8' }}>{r1}/30</span>
            {' · '}
            R2: <span style={{ color: r2 === 30 ? '#4ade80' : '#94a3b8' }}>{r2}/30</span>
            {' · '}
            FJ: <span style={{ color: fj === 1 ? '#4ade80' : '#94a3b8' }}>{fj}/1</span>
          </span>
          <button onClick={save} disabled={saving}
            style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={play} disabled={!allFilled}
            title={!allFilled ? 'Board must be complete (R1: 30/30, R2: 30/30, FJ: 1/1) to play' : ''}
            style={{ padding: '8px 18px', background: allFilled ? '#1d4ed8' : '#1e293b', color: allFilled ? '#fff' : '#475569', border: 'none', borderRadius: 6, cursor: allFilled ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            ▶ Play
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid #1e293b' }}>
          <button style={tabStyle('round1')} onClick={() => setActiveTab('round1')}>ROUND 1</button>
          <button style={tabStyle('round2')} onClick={() => setActiveTab('round2')}>ROUND 2</button>
          <button style={tabStyle('finalJeopardy')} onClick={() => setActiveTab('finalJeopardy')}>FINAL JEOPARDY</button>
        </div>

        <div style={{ background: '#0f172a', borderRadius: '0 0 8px 8px', padding: 12 }}>
          {activeTab === 'round1' && (
            <BoardEditorGrid
              key={activeBoardId ? `${activeBoardId}-r1` : 'new-r1'}
              categories={board.round1.categories}
              values={R1_VALUES}
              onChange={cats => { setBoard(b => ({ ...b, round1: { ...b.round1, categories: cats } })); setDirty(true); }}
            />
          )}
          {activeTab === 'round2' && (
            <BoardEditorGrid
              key={activeBoardId ? `${activeBoardId}-r2` : 'new-r2'}
              categories={board.round2.categories}
              values={R2_VALUES}
              onChange={cats => { setBoard(b => ({ ...b, round2: { ...b.round2, categories: cats } })); setDirty(true); }}
            />
          )}
          {activeTab === 'finalJeopardy' && (
            <FinalJeopardyTab fj={board.finalJeopardy} onChange={fj => { setBoard(b => ({ ...b, finalJeopardy: fj })); setDirty(true); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function FinalJeopardyTab({ fj, onChange }) {
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>CATEGORY</div>
        <input
          value={fj.category}
          onChange={e => onChange({ ...fj, category: e.target.value })}
          placeholder="e.g. POTENT POTABLES"
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>CLUE</div>
        <textarea
          value={fj.clue}
          onChange={e => onChange({ ...fj, clue: e.target.value })}
          rows={4}
          placeholder="This is the Final Jeopardy clue..."
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 13, padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#86efac', marginBottom: 6 }}>ANSWER</div>
        <input
          value={fj.answer}
          onChange={e => onChange({ ...fj, answer: e.target.value })}
          placeholder="What is...?"
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#4ade80', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>
      {fj.category && fj.clue && fj.answer && (
        <div style={{ fontSize: 11, color: '#4ade80' }}>✓ Final Jeopardy complete</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add client/src/pages/EditorPage.jsx
git commit -m "feat: board editor three-tab layout for round1, round2, final jeopardy"
```

---

## Task 8: GameBoard — Round Prop

**Files:**
- Modify: `client/src/components/GameBoard.jsx`

- [ ] **Step 1: Add round prop to GameBoard**

Open `client/src/components/GameBoard.jsx`. Find the `VALUES` constant (or wherever clue values are displayed). The component needs to show the correct dollar amounts based on which round is active.

Change the component signature to accept `round` (defaulting to 1):

```jsx
export default function GameBoard({ categoryNames, revealedClues, onSelect, round = 1 }) {
```

Replace the hardcoded `VALUES` array with a computed expression:

```jsx
const values = [1, 2, 3, 4, 5].map(i => i * (round === 1 ? 200 : 400));
```

Use `values` instead of `VALUES` everywhere in the component.

- [ ] **Step 2: Update HostPage to pass round prop**

In `HostPage.jsx` `HostBoard` component, pass `round={game.currentRound || 1}` to `<GameBoard>`.

- [ ] **Step 3: Update DisplayPage to pass round prop**

In `DisplayPage.jsx`, pass `round={game.currentRound || 1}` to `<GameBoard>`.

- [ ] **Step 4: Commit**

```
git add client/src/components/GameBoard.jsx client/src/pages/HostPage.jsx client/src/pages/DisplayPage.jsx
git commit -m "feat: GameBoard accepts round prop for correct dollar values"
```

---

## Task 9: HostPage — Multi-Round Phases

**Files:**
- Modify: `client/src/pages/HostPage.jsx`

- [ ] **Step 1: Add new socket event listeners in useEffect**

In the `init()` function inside `useEffect`, add after existing listeners:

```js
socket.on('game:betweenRounds', ({ players }) =>
  setGame(g => ({ ...g, phase: 'between-rounds', players })));
socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) =>
  setGame(g => ({ ...g, phase: 'board', currentRound, categoryNames, currentPicker, players, revealedClues: [] })));
socket.on('game:finalWager', ({ category }) =>
  setGame(g => ({ ...g, phase: 'final-wager', fjCategory: category, wagersSubmitted: [] })));
socket.on('game:wagerSubmitted', ({ playerName }) =>
  setGame(g => ({ ...g, wagersSubmitted: [...(g.wagersSubmitted || []), playerName] })));
socket.on('game:finalClue', ({ category, clue }) =>
  setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, answersSubmitted: [] })));
socket.on('game:answerSubmitted', ({ playerName }) =>
  setGame(g => ({ ...g, answersSubmitted: [...(g.answersSubmitted || []), playerName] })));
socket.on('game:finalJudgingReady', ({ answers }) =>
  setGame(g => ({ ...g, phase: 'final-judging', fjAnswers: answers, judgments: {} })));
socket.on('game:revealReady', ({ players }) =>
  setGame(g => ({ ...g, phase: 'final-reveal', players, revealedPlayers: [] })));
socket.on('game:finalReveal', ({ playerName, wager, answer, correct, players }) =>
  setGame(g => ({
    ...g,
    players,
    revealedPlayers: [...(g.revealedPlayers || []), { playerName, wager, answer, correct }],
  })));
```

Also update `game:scored` listener to include `currentRound`:
```js
socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
  setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null })));
```

- [ ] **Step 2: Add new phase renders in the return JSX**

Update the main return to add new phase components:

```jsx
{phase === 'between-rounds' && <HostBetweenRounds game={game} />}
{phase === 'final-wager' && <HostFinalWager game={game} />}
{phase === 'final-clue' && <HostFinalClue game={game} />}
{phase === 'final-judging' && <HostFinalJudging game={game} />}
{phase === 'final-reveal' && <HostFinalReveal game={game} />}
```

- [ ] **Step 3: Implement new host phase components**

Add these functions to `HostPage.jsx`:

```jsx
function HostBetweenRounds({ game }) {
  const sorted = [...(game.players || [])].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: '#fbbf24', marginBottom: 8, letterSpacing: 2 }}>DOUBLE JEOPARDY</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Round 1 complete</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 20px', margin: '6px auto', maxWidth: 300, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#e2e8f0' }}>{i === 0 ? '👑 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? '#4ade80' : '#f87171' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
      <button
        onClick={() => socket.emit('host:startRound2')}
        style={{ marginTop: 24, padding: '14px 40px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
        Start Round 2 →
      </button>
    </div>
  );
}

function HostFinalWager({ game }) {
  const submitted = game.wagersSubmitted || [];
  const total = (game.players || []).length;
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: '#fbbf24', marginBottom: 8 }}>FINAL JEOPARDY</div>
      <div style={{ fontSize: 18, color: '#e2e8f0', marginBottom: 4 }}>{game.fjCategory}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Place your wagers!</div>
      <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>{submitted.length}/{total} submitted</div>
      {(game.players || []).map(p => (
        <div key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', borderRadius: 20, padding: '6px 14px', margin: 4 }}>
          <span style={{ color: submitted.includes(p.name) ? '#4ade80' : '#94a3b8' }}>
            {submitted.includes(p.name) ? '✓' : '⏳'}
          </span>
          <span style={{ color: '#e2e8f0', fontSize: 13 }}>{p.name}</span>
        </div>
      ))}
      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => socket.emit('host:closeWagers')}
          style={{ padding: '10px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Close Wagers (force)
        </button>
      </div>
    </div>
  );
}

function HostFinalClue({ game }) {
  const submitted = game.answersSubmitted || [];
  const total = (game.players || []).length;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>{game.fjCategory}</div>
      <div style={{ background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: '#e2e8f0' }}>{game.fjClue}</div>
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Answers: {submitted.length}/{total}</div>
      {(game.players || []).map(p => (
        <div key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', borderRadius: 20, padding: '6px 14px', margin: 4 }}>
          <span style={{ color: submitted.includes(p.name) ? '#4ade80' : '#94a3b8' }}>
            {submitted.includes(p.name) ? '✓' : '⏳'}
          </span>
          <span style={{ color: '#e2e8f0', fontSize: 13 }}>{p.name}</span>
        </div>
      ))}
      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => socket.emit('host:closeAnswers')}
          style={{ padding: '10px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Close Answers (force)
        </button>
      </div>
    </div>
  );
}

function HostFinalJudging({ game }) {
  const answers = game.fjAnswers || [];
  const judged = game.judgments || {};
  const allJudged = answers.length > 0 && answers.every(a => judged[a.playerName] !== undefined);
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 20 }}>Judge Final Answers</div>
      {answers.map(({ playerName, answer }) => (
        <div key={playerName} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 'bold', color: '#e2e8f0', marginBottom: 6 }}>{playerName}</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10, fontStyle: 'italic' }}>{answer || '(blank)'}</div>
          {judged[playerName] === undefined ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  socket.emit('host:judgeFinal', { playerName, correct: true });
                  setGame && setGame(g => ({ ...g, judgments: { ...g.judgments, [playerName]: true } }));
                }}
                style={{ flex: 1, padding: 10, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                ✓ Correct
              </button>
              <button
                onClick={() => {
                  socket.emit('host:judgeFinal', { playerName, correct: false });
                  setGame && setGame(g => ({ ...g, judgments: { ...g.judgments, [playerName]: false } }));
                }}
                style={{ flex: 1, padding: 10, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                ✗ Incorrect
              </button>
            </div>
          ) : (
            <div style={{ color: judged[playerName] ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
              {judged[playerName] ? '✓ Correct' : '✗ Incorrect'}
            </div>
          )}
        </div>
      ))}
      {allJudged && (
        <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>All players judged — waiting for server to begin reveal...</div>
      )}
    </div>
  );
}

function HostFinalReveal({ game }) {
  const revealed = game.revealedPlayers || [];
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 20 }}>Final Jeopardy Reveal</div>
      {revealed.map(({ playerName, wager, answer, correct }) => (
        <div key={playerName} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
          <div style={{ fontWeight: 'bold', color: '#e2e8f0', marginBottom: 4 }}>{playerName}</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Wager: ${wager}</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Answer: {answer || '(blank)'}</div>
          <div style={{ color: correct ? '#4ade80' : '#f87171', fontWeight: 'bold', marginTop: 4 }}>{correct ? `+$${wager}` : `-$${wager}`}</div>
        </div>
      ))}
      <button
        onClick={() => socket.emit('host:revealNext')}
        style={{ marginTop: 16, padding: '12px 32px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
        Reveal Next →
      </button>
    </div>
  );
}
```

Note: `HostFinalJudging` uses `socket.emit` for judgments and updates local `judgments` state via `setGame`. Since `setGame` isn't in scope of the function, move the `judgments` state update to the `game:finalJudgingReady` listener: instead of local state, track judgments via a separate `useState` in `HostPage` or inline. The simplest fix: add `const [judgments, setJudgments] = useState({})` in `HostPage` and pass it as a prop to `HostFinalJudging`, using `setJudgments` on each judgment button click.

Refactor `HostFinalJudging` to use passed props:

```jsx
function HostFinalJudging({ game, judgments, onJudge }) {
  const answers = game.fjAnswers || [];
  const allJudged = answers.length > 0 && answers.every(a => judgments[a.playerName] !== undefined);
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 20 }}>Judge Final Answers</div>
      {answers.map(({ playerName, answer }) => (
        <div key={playerName} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 'bold', color: '#e2e8f0', marginBottom: 6 }}>{playerName}</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10, fontStyle: 'italic' }}>{answer || '(blank)'}</div>
          {judgments[playerName] === undefined ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onJudge(playerName, true)}
                style={{ flex: 1, padding: 10, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                ✓ Correct
              </button>
              <button onClick={() => onJudge(playerName, false)}
                style={{ flex: 1, padding: 10, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                ✗ Incorrect
              </button>
            </div>
          ) : (
            <div style={{ color: judgments[playerName] ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
              {judgments[playerName] ? '✓ Correct' : '✗ Incorrect'}
            </div>
          )}
        </div>
      ))}
      {allJudged && <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>All judged — waiting for server...</div>}
    </div>
  );
}
```

In `HostPage`, add:
```jsx
const [judgments, setJudgments] = useState({});
```

And render:
```jsx
{phase === 'final-judging' && (
  <HostFinalJudging
    game={game}
    judgments={judgments}
    onJudge={(playerName, correct) => {
      socket.emit('host:judgeFinal', { playerName, correct });
      setJudgments(j => ({ ...j, [playerName]: correct }));
    }}
  />
)}
```

- [ ] **Step 3: Commit**

```
git add client/src/pages/HostPage.jsx
git commit -m "feat: HostPage multi-round and Final Jeopardy phase views"
```

---

## Task 10: DisplayPage — Multi-Round Phases

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx`

- [ ] **Step 1: Add new socket event listeners**

In `DisplayPage.jsx` `useEffect`, add after existing listeners (mirror HostPage but without host-only events):

```js
socket.on('game:betweenRounds', ({ players }) =>
  setGame(g => ({ ...g, phase: 'between-rounds', players })));
socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) =>
  setGame(g => ({ ...g, phase: 'board', currentRound, categoryNames, currentPicker, players, revealedClues: [] })));
socket.on('game:finalWager', ({ category }) =>
  setGame(g => ({ ...g, phase: 'final-wager', fjCategory: category, wagersSubmitted: [] })));
socket.on('game:wagerSubmitted', ({ playerName }) =>
  setGame(g => ({ ...g, wagersSubmitted: [...(g.wagersSubmitted || []), playerName] })));
socket.on('game:finalClue', ({ category, clue }) =>
  setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, answersSubmitted: [] })));
socket.on('game:answerSubmitted', ({ playerName }) =>
  setGame(g => ({ ...g, answersSubmitted: [...(g.answersSubmitted || []), playerName] })));
socket.on('game:finalJudging', () =>
  setGame(g => ({ ...g, phase: 'final-judging' })));
socket.on('game:revealReady', ({ players }) =>
  setGame(g => ({ ...g, phase: 'final-reveal', players, revealedPlayers: [] })));
socket.on('game:finalReveal', ({ playerName, wager, answer, correct, players }) =>
  setGame(g => ({
    ...g,
    players,
    revealedPlayers: [...(g.revealedPlayers || []), { playerName, wager, answer, correct }],
  })));
```

Also update `game:scored` to include `currentRound`:
```js
socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
  setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound })));
```

- [ ] **Step 2: Add new phase renders and components**

Add to the main return in `DisplayPage.jsx`:

```jsx
{phase === 'between-rounds' && <DisplayBetweenRounds game={game} />}
{phase === 'final-wager' && <DisplayFinalWager game={game} />}
{phase === 'final-clue' && <DisplayFinalClue game={game} />}
{phase === 'final-judging' && <DisplayFinalJudging />}
{phase === 'final-reveal' && <DisplayFinalReveal game={game} />}
```

Add component functions:

```jsx
function DisplayBetweenRounds({ game }) {
  const sorted = [...(game.players || [])].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 56, fontWeight: 'bold', color: '#fbbf24', letterSpacing: 4, marginBottom: 40 }}>DOUBLE JEOPARDY</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ fontSize: 24, display: 'flex', justifyContent: 'center', gap: 40, padding: '10px 0' }}>
          <span style={{ color: i === 0 ? '#fbbf24' : '#e2e8f0' }}>{i === 0 ? '👑 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? '#4ade80' : '#f87171' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function DisplayFinalWager({ game }) {
  const submitted = game.wagersSubmitted || [];
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, fontWeight: 'bold', color: '#fbbf24', marginBottom: 16 }}>FINAL JEOPARDY</div>
      <div style={{ fontSize: 28, color: '#e2e8f0', marginBottom: 8 }}>{game.fjCategory}</div>
      <div style={{ fontSize: 18, color: '#64748b', marginBottom: 32 }}>Place your wagers!</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: '#1e293b', borderRadius: 20, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: submitted.includes(p.name) ? '#4ade80' : '#64748b', fontSize: 18 }}>
              {submitted.includes(p.name) ? '✓' : '⏳'}
            </span>
            <span style={{ color: '#e2e8f0', fontSize: 16 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DisplayFinalClue({ game }) {
  const submitted = game.answersSubmitted || [];
  return (
    <div style={{ padding: 60, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ fontSize: 22, color: '#a5b4fc', marginBottom: 16, textAlign: 'center' }}>{game.fjCategory}</div>
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 32, marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 24, lineHeight: 1.6, color: '#e2e8f0' }}>{game.fjClue}</div>
      </div>
      <div style={{ textAlign: 'center', color: '#64748b', marginBottom: 20, fontSize: 16 }}>Write your answers!</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: '#1e293b', borderRadius: 20, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: submitted.includes(p.name) ? '#4ade80' : '#64748b', fontSize: 18 }}>
              {submitted.includes(p.name) ? '✓' : '⏳'}
            </span>
            <span style={{ color: '#e2e8f0', fontSize: 16 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DisplayFinalJudging() {
  return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 32, color: '#64748b' }}>Judging in progress...</div>
    </div>
  );
}

function DisplayFinalReveal({ game }) {
  const revealed = game.revealedPlayers || [];
  return (
    <div style={{ padding: 40, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: '#fbbf24', textAlign: 'center', marginBottom: 32 }}>FINAL JEOPARDY</div>
      {revealed.map(({ playerName, wager, answer, correct }) => (
        <RevealCard key={playerName} playerName={playerName} wager={wager} answer={answer} correct={correct} />
      ))}
    </div>
  );
}

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
    <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px 24px', marginBottom: 16 }}>
      <div style={{ fontWeight: 'bold', fontSize: 20, color: '#e2e8f0', marginBottom: 8 }}>{playerName}</div>
      {showWager && <div style={{ color: '#a5b4fc', fontSize: 16, marginBottom: 4 }}>Wager: ${wager}</div>}
      {showAnswer && <div style={{ color: '#e2e8f0', fontSize: 16, marginBottom: 4, fontStyle: 'italic' }}>{answer || '(blank)'}</div>}
      {showResult && (
        <div style={{ color: correct ? '#4ade80' : '#f87171', fontWeight: 'bold', fontSize: 20 }}>
          {correct ? `+$${wager}` : `-$${wager}`}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```
git add client/src/pages/DisplayPage.jsx
git commit -m "feat: DisplayPage multi-round and Final Jeopardy phase views"
```

---

## Task 11: PlayerPage — Multi-Round Phases

**Files:**
- Modify: `client/src/pages/PlayerPage.jsx`

- [ ] **Step 1: Add new socket event listeners**

In `PlayerPage.jsx` `useEffect`, add after existing listeners:

```js
socket.on('game:betweenRounds', ({ players }) =>
  setGame(g => ({ ...g, phase: 'between-rounds', players })));
socket.on('game:round2Started', ({ currentRound, currentPicker, players }) =>
  setGame(g => ({ ...g, phase: 'board', currentRound, currentPicker, players, revealedClues: [], currentClue: null })));
socket.on('game:finalWager', ({ category }) =>
  setGame(g => ({ ...g, phase: 'final-wager', fjCategory: category, myWagerSubmitted: false })));
socket.on('game:finalClue', ({ category, clue }) =>
  setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, myAnswerSubmitted: false })));
socket.on('game:finalJudging', () =>
  setGame(g => ({ ...g, phase: 'final-judging' })));
socket.on('game:revealReady', ({ players }) =>
  setGame(g => ({ ...g, phase: 'final-reveal', players, revealedPlayers: [] })));
socket.on('game:finalReveal', ({ playerName, wager, answer, correct, players }) =>
  setGame(g => ({
    ...g,
    players,
    revealedPlayers: [...(g.revealedPlayers || []), { playerName, wager, answer, correct }],
  })));
```

Also update `game:scored` to include `currentRound`:
```js
socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
  setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null, buzzerState: 'locked' })));
```

- [ ] **Step 2: Add wager and answer state**

Add at the top of the `PlayerPage` component function:
```jsx
const [wagerInput, setWagerInput] = useState('');
const [answerInput, setAnswerInput] = useState('');
```

- [ ] **Step 3: Add new phase views in return JSX**

Add after the `board` phase block and before `finished`:

```jsx
{game.phase === 'between-rounds' && (
  <div>
    <div style={{ color: '#fbbf24', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>DOUBLE JEOPARDY</div>
    <div style={{ color: '#64748b', marginBottom: 12 }}>Get ready for Round 2!</div>
    <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>SCORES</div>
    {[...(game.players || [])].sort((a, b) => b.score - a.score).map(p => (
      <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: p.name === myName ? '#fbbf24' : '#64748b' }}>
        <span>{p.name}</span>
        <span style={{ color: p.score < 0 ? '#f87171' : '#4ade80' }}>{p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}</span>
      </div>
    ))}
  </div>
)}

{game.phase === 'final-wager' && (
  <div>
    <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>FINAL JEOPARDY</div>
    <div style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 16 }}>{game.fjCategory}</div>
    {game.myWagerSubmitted ? (
      <div style={{ color: '#4ade80', fontSize: 14 }}>Wager locked in! ${wagerInput}</div>
    ) : (
      <div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
          Enter your wager (max: ${Math.max(myScore, 1000)})
        </div>
        <input
          type="number"
          value={wagerInput}
          onChange={e => setWagerInput(e.target.value)}
          min={0}
          max={Math.max(myScore, 1000)}
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 18, padding: '10px 12px', boxSizing: 'border-box', marginBottom: 10 }}
        />
        <button
          onClick={() => {
            const w = parseInt(wagerInput, 10);
            if (isNaN(w) || w < 0 || w > Math.max(myScore, 1000)) return;
            socket.emit('player:submitWager', { wager: w });
            setGame(g => ({ ...g, myWagerSubmitted: true }));
          }}
          style={{ width: '100%', padding: 12, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
          Submit Wager
        </button>
      </div>
    )}
  </div>
)}

{game.phase === 'final-clue' && (
  <div>
    <div style={{ color: '#a5b4fc', fontSize: 12, marginBottom: 8 }}>{game.fjCategory}</div>
    <div style={{ background: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 14, lineHeight: 1.6, color: '#e2e8f0' }}>
      {game.fjClue}
    </div>
    {game.myAnswerSubmitted ? (
      <div style={{ color: '#4ade80', fontSize: 14 }}>Answer locked in!</div>
    ) : (
      <div>
        <textarea
          value={answerInput}
          onChange={e => setAnswerInput(e.target.value)}
          placeholder="What is...?"
          rows={3}
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 14, padding: '10px 12px', resize: 'none', boxSizing: 'border-box', marginBottom: 10 }}
        />
        <button
          onClick={() => {
            socket.emit('player:submitAnswer', { answer: answerInput });
            setGame(g => ({ ...g, myAnswerSubmitted: true }));
          }}
          style={{ width: '100%', padding: 12, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
          Submit Answer
        </button>
      </div>
    )}
  </div>
)}

{game.phase === 'final-judging' && (
  <div style={{ color: '#64748b', fontSize: 14 }}>Judging in progress...</div>
)}

{game.phase === 'final-reveal' && (
  <div>
    <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>FINAL JEOPARDY REVEAL</div>
    {(game.revealedPlayers || []).map(({ playerName, wager, answer, correct }) => (
      <div key={playerName} style={{
        background: playerName === myName ? '#1d4ed8' : '#1e293b',
        borderRadius: 8, padding: '10px 14px', marginBottom: 8,
        border: playerName === myName ? '2px solid #60a5fa' : '1px solid #334155'
      }}>
        <div style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{playerName}</div>
        <div style={{ color: '#94a3b8', fontSize: 12 }}>Wager: ${wager}</div>
        <div style={{ color: '#94a3b8', fontSize: 12 }}>{answer || '(blank)'}</div>
        <div style={{ color: correct ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
          {correct ? `+$${wager}` : `-$${wager}`}
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Commit**

```
git add client/src/pages/PlayerPage.jsx
git commit -m "feat: PlayerPage multi-round and Final Jeopardy phase views"
```

---

## Task 12: Manual Smoke Test + Cleanup

- [ ] **Step 1: Start dev server**

```
cd server && npm run dev
```

And in a separate terminal:
```
cd client && npm run dev
```

- [ ] **Step 2: Create a complete test board**

1. Open the editor at `http://localhost:5173/editor`
2. Fill in board name
3. Fill in all Round 1 clues (or import a JSON using the new format)
4. Switch to Round 2 tab — verify values show $400–$2000
5. Fill in Round 2 clues
6. Switch to Final Jeopardy tab — fill in category, clue, answer
7. Verify completion indicator shows `R1: 30/30 · R2: 30/30 · FJ: 1/1`
8. Verify Play button is enabled
9. Save and click Play

- [ ] **Step 3: Play a full game**

1. Host opens at `/host/<code>` — verify lobby shows
2. Open 2 player tabs, join with different names
3. Start game — verify board shows Round 1 values ($200–$1000)
4. Answer enough clues to see scoring work correctly
5. Exhaust all 30 Round 1 clues — verify between-rounds screen appears
6. Host clicks "Start Round 2" — verify board shows Round 2 values ($400–$2000)
7. Exhaust all 30 Round 2 clues — verify Final Wager screen appears
8. Each player submits a wager on their device — verify submission chips update
9. Host advances — verify Final Clue screen shows clue text
10. Each player submits an answer — verify submission chips update
11. Host advances — verify judging screen appears on host
12. Host judges each player correct/incorrect
13. Verify reveal phase begins — host clicks "Reveal Next" for each player
14. Verify each player card animates wager → answer → result
15. Verify scores update correctly (correct = +wager, incorrect = -wager)
16. Verify game:finished fires and finished screen shows final standings

- [ ] **Step 4: Test edge cases**

- Player with score 0 tries to wager $1001 — verify server rejects
- Player with score $5000 tries to wager $5000 — verify accepted
- Host closes wagers before all players submit — verify missing players get $0
- Host closes answers before all players submit — verify missing players get blank answer

- [ ] **Step 5: Run full test suite**

```
cd server && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Final commit**

```
git add -A
git commit -m "feat: complete multi-round Jeopardy implementation"
```
