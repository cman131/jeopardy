# Media Clues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Image and Video clue types (URL-based media) and an optional host-triggered answer image reveal to all clue types, including Final Jeopardy.

**Architecture:** Extend the Mongoose clue schema with `type`/`mediaUrl`/`answerImage`; propagate `type`/`mediaUrl` through `GameState`'s public state and socket events; add a `host:revealAnswer` socket event that broadcasts `game:answerRevealed`; render media via a shared `ClueMedia` React component imported in both Display and Host pages.

**Tech Stack:** Node.js, Mongoose, Socket.IO, React + Vite, Jest (server tests only — no React test infrastructure exists)

---

## File Map

| File | Change |
|------|--------|
| `server/src/models/Board.js` | Add `type`, `mediaUrl`, `answerImage` to `clueSchema` and `finalJeopardySchema` |
| `server/src/game/GameState.js` | Expose `type`/`mediaUrl` in public state; `answerImage` in host state |
| `server/src/sockets/gameHandlers.js` | Add `host:revealAnswer`; add `type`/`mediaUrl` to `game:finalClue`; add `fjAnswerImage` to `game:finalJudgingReady` |
| `client/src/components/ClueMedia.jsx` | New shared component: renders image or YouTube iframe |
| `client/src/components/BoardEditorGrid.jsx` | Type selector, conditional media URL, answer image URL, updated completeness check |
| `client/src/pages/EditorPage.jsx` | Update `emptyRound`/`emptyBoard`/`countFilled`, update `FinalJeopardyTab` |
| `client/src/pages/DisplayPage.jsx` | Use `ClueMedia`, handle `game:answerRevealed`, update `DisplayFinalClue` |
| `client/src/pages/HostPage.jsx` | Use `ClueMedia`, "Reveal Answer" button in `HostClue`, FJ media in `HostFinalClue`, answer image in `HostFinalJudging` |

---

### Task 1: Extend Board schema

**Files:**
- Modify: `server/src/models/Board.js`

- [ ] **Step 1: Add media fields to clueSchema**

In `server/src/models/Board.js`, replace the existing `clueSchema`:

```js
const clueSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  type: { type: String, enum: ['regular', 'image', 'video'], default: 'regular' },
  mediaUrl: { type: String },
  answerImage: { type: String },
});
```

- [ ] **Step 2: Add same fields to finalJeopardySchema**

Replace `finalJeopardySchema`:

```js
const finalJeopardySchema = new mongoose.Schema({
  category: { type: String, required: true },
  clue: { type: String, required: true },
  answer: { type: String, required: true },
  type: { type: String, enum: ['regular', 'image', 'video'], default: 'regular' },
  mediaUrl: { type: String },
  answerImage: { type: String },
}, { _id: false });
```

- [ ] **Step 3: Run existing tests**

```
cd server && npm test
```

Expected: all existing tests pass. The new fields are optional with defaults; existing test boards that omit them are unaffected.

- [ ] **Step 4: Commit**

```bash
git add server/src/models/Board.js
git commit -m "feat: add type, mediaUrl, answerImage to clue and FJ schemas"
```

---

### Task 2: Update GameState to expose media fields

**Files:**
- Modify: `server/src/game/GameState.js`
- Test: `server/tests/unit/GameState.test.js`

- [ ] **Step 1: Write failing unit tests**

Add this describe block at the end of `server/tests/unit/GameState.test.js` (before the closing of the file):

```js
describe('GameState — media clue fields', () => {
  function makeBoardWithMedia() {
    const board = makeBoard();
    board.round1.categories[0].clues[0].type = 'image';
    board.round1.categories[0].clues[0].mediaUrl = 'https://example.com/img.jpg';
    board.round1.categories[0].clues[0].answerImage = 'https://example.com/ans.jpg';
    return board;
  }

  function startAndSelect(board) {
    const gs = new GameState(board);
    gs.addPlayer('Alice'); gs.addPlayer('Bob');
    gs.startGame();
    gs.selectClue(0, 0);
    return gs;
  }

  test('getPublicState includes type and mediaUrl for image clue', () => {
    const pub = startAndSelect(makeBoardWithMedia()).getPublicState();
    expect(pub.currentClue.type).toBe('image');
    expect(pub.currentClue.mediaUrl).toBe('https://example.com/img.jpg');
  });

  test('getPublicState defaults to type regular and null mediaUrl when fields absent', () => {
    const pub = startAndSelect(makeBoard()).getPublicState();
    expect(pub.currentClue.type).toBe('regular');
    expect(pub.currentClue.mediaUrl).toBeNull();
  });

  test('getPublicState does NOT expose answerImage', () => {
    const pub = startAndSelect(makeBoardWithMedia()).getPublicState();
    expect(pub.currentClue.answerImage).toBeUndefined();
  });

  test('getHostState includes answerImage', () => {
    const host = startAndSelect(makeBoardWithMedia()).getHostState();
    expect(host.currentClue.answerImage).toBe('https://example.com/ans.jpg');
  });

  test('getHostState answerImage is null when clue has none', () => {
    const host = startAndSelect(makeBoard()).getHostState();
    expect(host.currentClue.answerImage).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```
cd server && npx jest tests/unit/GameState.test.js --no-coverage 2>&1 | tail -20
```

Expected: 5 failures in "media clue fields" suite.

- [ ] **Step 3: Update getPublicState**

In `server/src/game/GameState.js`, replace the `currentClue:` property inside `getPublicState()`:

```js
currentClue: this.currentClue ? {
  categoryIndex: this.currentClue.categoryIndex,
  clueIndex: this.currentClue.clueIndex,
  question: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].question,
  value: clueValue(this.currentRound, this.currentClue.clueIndex),
  type: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].type || 'regular',
  mediaUrl: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].mediaUrl || null,
} : null,
```

- [ ] **Step 4: Update getHostState**

In `server/src/game/GameState.js`, replace the `if (this.currentClue)` block inside `getHostState()`:

```js
if (this.currentClue) {
  const clue = this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex];
  state.currentClue.answer = clue.answer;
  state.currentClue.answerImage = clue.answerImage || null;
}
```

- [ ] **Step 5: Run tests to confirm pass**

```
cd server && npx jest tests/unit/GameState.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/game/GameState.js server/tests/unit/GameState.test.js
git commit -m "feat: expose type/mediaUrl in public clue state, answerImage in host state"
```

---

### Task 3: Add host:revealAnswer and update Final Jeopardy socket events

**Files:**
- Modify: `server/src/sockets/gameHandlers.js`
- Test: `server/tests/integration/socket.test.js`

- [ ] **Step 1: Write failing integration tests**

Add the following two describe blocks to `server/tests/integration/socket.test.js` (at the end of the file):

```js
describe('host:revealAnswer', () => {
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

  test('broadcasts game:answerRevealed with answer and answerImage', async () => {
    const board = makeTestBoard();
    board.round1.categories[0].clues[0].answerImage = 'https://example.com/ans.jpg';
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const { host, display, p1, p2 } = await reachJudgingPhase(gameCode);
    const revealed = waitFor(display, 'game:answerRevealed');
    host.emit('host:revealAnswer');
    const data = await revealed;
    expect(data.answer).toBe('R1-A0-0');
    expect(data.answerImage).toBe('https://example.com/ans.jpg');
    host.disconnect(); display.disconnect(); p1.disconnect(); p2.disconnect();
  });

  test('game:answerRevealed has null answerImage when clue has none', async () => {
    const { gameCode } = await setupGame();
    const { host, display, p1, p2 } = await reachJudgingPhase(gameCode);
    const revealed = waitFor(display, 'game:answerRevealed');
    host.emit('host:revealAnswer');
    const data = await revealed;
    expect(data.answer).toBe('R1-A0-0');
    expect(data.answerImage).toBeNull();
    host.disconnect(); display.disconnect(); p1.disconnect(); p2.disconnect();
  });

  test('host:revealAnswer is ignored outside judging phase', async () => {
    const { gameCode } = await setupGame();
    const host = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    let received = false;
    host.on('game:answerRevealed', () => { received = true; });
    host.emit('host:revealAnswer');
    await new Promise(r => setTimeout(r, 100));
    expect(received).toBe(false);
    host.disconnect();
  });
});

describe('FJ socket events include media fields', () => {
  function forceFinalWager(gameCode) {
    const entry = gameStore.get(gameCode);
    entry.state.players = [{ name: 'Alice', score: 0, scoreHistory: [] }];
    entry.state.phase = 'final-wager';
  }

  function forceFinalClue(gameCode) {
    const entry = gameStore.get(gameCode);
    entry.state.players = [{ name: 'Alice', score: 0, scoreHistory: [] }];
    entry.state.phase = 'final-clue';
  }

  test('game:finalClue includes type and mediaUrl', async () => {
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
    const display = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');

    forceFinalWager(gameCode);
    const finalClue = waitFor(display, 'game:finalClue');
    host.emit('host:closeWagers');
    const data = await finalClue;
    expect(data.type).toBe('image');
    expect(data.mediaUrl).toBe('https://example.com/fj.jpg');
    host.disconnect(); display.disconnect();
  });

  test('game:finalJudgingReady includes fjAnswerImage', async () => {
    const board = makeTestBoard({
      finalJeopardy: {
        category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER',
        answerImage: 'https://example.com/fjans.jpg',
      },
    });
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const host = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');

    forceFinalClue(gameCode);
    const judging = waitFor(host, 'game:finalJudgingReady');
    host.emit('host:closeAnswers');
    const data = await judging;
    expect(data.fjAnswerImage).toBe('https://example.com/fjans.jpg');
    host.disconnect();
  });

  test('game:finalJudgingReady has null fjAnswerImage when not set', async () => {
    const { gameCode } = await setupGame();
    const host = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');

    forceFinalClue(gameCode);
    const judging = waitFor(host, 'game:finalJudgingReady');
    host.emit('host:closeAnswers');
    const data = await judging;
    expect(data.fjAnswerImage).toBeNull();
    host.disconnect();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```
cd server && npx jest tests/integration/socket.test.js --no-coverage 2>&1 | tail -30
```

Expected: failures in "host:revealAnswer" and "FJ socket events include media fields" suites.

- [ ] **Step 3: Add host:revealAnswer handler in gameHandlers.js**

In `server/src/sockets/gameHandlers.js`, add this handler before the `socket.on('disconnect', ...)` line:

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

- [ ] **Step 4: Update game:finalClue emits to include type and mediaUrl**

`game:finalClue` is emitted in two places. Find and update both.

In `socket.on('player:submitWager', ...)`:
```js
if (gs.phase === 'final-clue') {
  io.to(gameCode).emit('game:finalClue', {
    category: gs.board.finalJeopardy.category,
    clue: gs.board.finalJeopardy.clue,
    type: gs.board.finalJeopardy.type || 'regular',
    mediaUrl: gs.board.finalJeopardy.mediaUrl || null,
  });
}
```

In `socket.on('host:closeWagers', ...)`:
```js
io.to(gameCode).emit('game:finalClue', {
  category: gs.board.finalJeopardy.category,
  clue: gs.board.finalJeopardy.clue,
  type: gs.board.finalJeopardy.type || 'regular',
  mediaUrl: gs.board.finalJeopardy.mediaUrl || null,
});
```

- [ ] **Step 5: Update game:finalJudgingReady emits to include fjAnswerImage**

`game:finalJudgingReady` is emitted in two places. Find and update both.

In `socket.on('player:submitAnswer', ...)`:
```js
if (gs.phase === 'final-judging') {
  const answers = [...gs.finalAnswers.entries()].map(([name, ans]) => ({ playerName: name, answer: ans }));
  io.to(entry.hostSocketId).emit('game:finalJudgingReady', {
    answers,
    fjAnswerImage: gs.board.finalJeopardy.answerImage || null,
  });
  io.to(gameCode).emit('game:finalJudging');
}
```

In `socket.on('host:closeAnswers', ...)`:
```js
const answers = [...gs.finalAnswers.entries()].map(([name, ans]) => ({ playerName: name, answer: ans }));
io.to(entry.hostSocketId).emit('game:finalJudgingReady', {
  answers,
  fjAnswerImage: gs.board.finalJeopardy.answerImage || null,
});
io.to(gameCode).emit('game:finalJudging');
```

- [ ] **Step 6: Run integration tests to confirm pass**

```
cd server && npx jest tests/integration/socket.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 7: Run full test suite**

```
cd server && npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/sockets/gameHandlers.js server/tests/integration/socket.test.js
git commit -m "feat: add host:revealAnswer event; include type/mediaUrl in game:finalClue; fjAnswerImage in game:finalJudgingReady"
```

---

### Task 4: Create shared ClueMedia component

**Files:**
- Create: `client/src/components/ClueMedia.jsx`

- [ ] **Step 1: Create ClueMedia.jsx**

Create `client/src/components/ClueMedia.jsx`:

```jsx
function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function ClueMedia({ type, mediaUrl, compact = false }) {
  const maxHeight = compact ? 220 : 400;

  if (!type || type === 'regular' || !mediaUrl) return null;

  if (type === 'image') {
    return (
      <img
        src={mediaUrl}
        alt="clue"
        style={{ maxWidth: '100%', maxHeight, borderRadius: 8, display: 'block', margin: '12px auto 0' }}
      />
    );
  }

  if (type === 'video') {
    const videoId = extractYouTubeId(mediaUrl);
    if (!videoId) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <iframe
          width={compact ? 480 : 640}
          height={compact ? 270 : 360}
          src={`https://www.youtube.com/embed/${videoId}?rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 8, border: 'none' }}
        />
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Verify the file is created and looks correct**

Open `client/src/components/ClueMedia.jsx` and confirm its structure.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ClueMedia.jsx
git commit -m "feat: add shared ClueMedia component for image and YouTube video rendering"
```

---

### Task 5: Update BoardEditorGrid with type selector and media inputs

**Files:**
- Modify: `client/src/components/BoardEditorGrid.jsx`

- [ ] **Step 1: Update the completeness check**

In `BoardEditorGrid.jsx`, change this line inside the `values.map(...)` callback:

```js
// old
const complete = !!(clue.question && clue.answer);
```

to:

```js
const type = clue.type || 'regular';
const complete = !!(clue.question && clue.answer && (type === 'regular' || clue.mediaUrl));
```

- [ ] **Step 2: Update the collapsed cell preview to show a type badge**

Replace the collapsed `complete &&` line:

```jsx
// old
{complete && <div style={{ fontSize: 9, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clue.question}</div>}
```

with:

```jsx
{complete && (
  <div style={{ fontSize: 9, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    {type === 'image' ? '📷 ' : type === 'video' ? '▶ ' : ''}{clue.question}
  </div>
)}
```

- [ ] **Step 3: Add type selector, media URL input, and answer image input to the expanded cell**

Replace the entire expanded cell `<div>` (the one with `background: '#1e293b', border: '2px solid #7c3aed'`) with:

```jsx
<div style={{ background: '#1e293b', border: '2px solid #7c3aed', borderRadius: 5, padding: 8 }}>
  <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 'bold', marginBottom: 6 }}>${value}</div>

  {/* Type selector */}
  <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
    {['regular', 'image', 'video'].map(t => (
      <button
        key={t}
        onClick={() => updateClue(ci, qi, 'type', t)}
        style={{
          flex: 1, padding: '3px 0', fontSize: 9, fontWeight: 'bold', cursor: 'pointer',
          background: (clue.type || 'regular') === t ? '#7c3aed' : '#0f172a',
          color: (clue.type || 'regular') === t ? '#fff' : '#475569',
          border: `1px solid ${(clue.type || 'regular') === t ? '#7c3aed' : '#334155'}`,
          borderRadius: 3,
        }}
      >
        {t === 'regular' ? 'Text' : t === 'image' ? '📷 Img' : '▶ Vid'}
      </button>
    ))}
  </div>

  {/* Media URL (image or video) */}
  {(clue.type === 'image' || clue.type === 'video') && (
    <>
      <div style={{ fontSize: 10, color: '#c4b5fd', marginBottom: 3 }}>
        {clue.type === 'image' ? 'IMAGE URL' : 'YOUTUBE URL'}
      </div>
      <input
        value={clue.mediaUrl || ''}
        onChange={e => updateClue(ci, qi, 'mediaUrl', e.target.value)}
        placeholder={clue.type === 'image' ? 'https://...' : 'https://youtube.com/watch?v=...'}
        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#fff', fontSize: 10, padding: 5, boxSizing: 'border-box', marginBottom: 5 }}
      />
    </>
  )}

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

  <div style={{ fontSize: 10, color: '#64748b', margin: '5px 0 3px' }}>ANSWER IMAGE (optional)</div>
  <input
    value={clue.answerImage || ''}
    onChange={e => updateClue(ci, qi, 'answerImage', e.target.value)}
    placeholder="https://..."
    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: 5, boxSizing: 'border-box' }}
  />

  <button onClick={() => setActiveCell(null)} style={{ marginTop: 6, width: '100%', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 4, padding: 4, fontSize: 10, cursor: 'pointer' }}>Done</button>
</div>
```

- [ ] **Step 4: Manual test in browser**

Start the dev server (`npm run dev` in the client folder, ensure server is running). Open the editor. Click a clue cell to expand it.

Verify:
- Three type buttons appear: Text / 📷 Img / ▶ Vid
- Selecting "📷 Img" reveals an IMAGE URL input; "▶ Vid" reveals a YOUTUBE URL input; "Text" hides it
- An ANSWER IMAGE (optional) input is always visible
- The collapsed cell preview shows `📷 ` or `▶ ` prefix for non-regular types
- An Image clue without a mediaUrl does NOT show the completeness checkmark (✓); adding the URL completes it

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BoardEditorGrid.jsx
git commit -m "feat: add type selector, media URL, and answer image inputs to clue editor cells"
```

---

### Task 6: Update EditorPage — countFilled and FinalJeopardyTab

**Files:**
- Modify: `client/src/pages/EditorPage.jsx`

- [ ] **Step 1: Update emptyRound to include new fields**

Replace the `emptyRound` function:

```js
function emptyRound() {
  return {
    categories: Array.from({ length: 6 }, () => ({
      name: 'CATEGORY',
      clues: Array.from({ length: 5 }, () => ({
        question: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '',
      })),
    })),
  };
}
```

- [ ] **Step 2: Update emptyBoard to include new FJ fields**

Replace the `emptyBoard` function:

```js
function emptyBoard() {
  return {
    name: 'New Board',
    round1: emptyRound(),
    round2: emptyRound(),
    finalJeopardy: { category: '', clue: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '' },
  };
}
```

- [ ] **Step 3: Update countFilled to use the new completeness logic**

Replace the `countFilled` function:

```js
function countFilled(board) {
  const isClueComplete = (cl) => {
    const type = cl.type || 'regular';
    return !!(cl.question && cl.answer && (type === 'regular' || cl.mediaUrl));
  };
  const countRound = (round) =>
    round.categories.reduce((sum, c) => sum + c.clues.filter(isClueComplete).length, 0);
  const fj = board.finalJeopardy;
  const fjType = fj.type || 'regular';
  return {
    r1: countRound(board.round1),
    r2: countRound(board.round2),
    fj: (fj.category && fj.clue && fj.answer && (fjType === 'regular' || fj.mediaUrl)) ? 1 : 0,
  };
}
```

- [ ] **Step 4: Replace FinalJeopardyTab with updated version**

Replace the entire `FinalJeopardyTab` component:

```jsx
function FinalJeopardyTab({ fj, onChange }) {
  const type = fj.type || 'regular';
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
        <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>CLUE TYPE</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['regular', 'image', 'video'].map(t => (
            <button
              key={t}
              onClick={() => onChange({ ...fj, type: t, mediaUrl: '' })}
              style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                background: type === t ? '#7c3aed' : '#1e293b',
                color: type === t ? '#fff' : '#475569',
                border: `1px solid ${type === t ? '#7c3aed' : '#334155'}`,
                borderRadius: 5,
              }}
            >
              {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : '▶ Video'}
            </button>
          ))}
        </div>
      </div>

      {type !== 'regular' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>
            {type === 'image' ? 'IMAGE URL' : 'YOUTUBE URL'}
          </div>
          <input
            value={fj.mediaUrl || ''}
            onChange={e => onChange({ ...fj, mediaUrl: e.target.value })}
            placeholder={type === 'image' ? 'https://...' : 'https://youtube.com/watch?v=...'}
            style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
          />
        </div>
      )}

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

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>ANSWER IMAGE (optional)</div>
        <input
          value={fj.answerImage || ''}
          onChange={e => onChange({ ...fj, answerImage: e.target.value })}
          placeholder="https://..."
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>

      {fj.category && fj.clue && fj.answer && (type === 'regular' || fj.mediaUrl) && (
        <div style={{ fontSize: 11, color: '#4ade80' }}>✓ Final Jeopardy complete</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Manual test in browser**

In the editor, navigate to the FINAL JEOPARDY tab. Verify:
- Type selector appears with Text / 📷 Image / ▶ Video buttons
- Selecting Image or Video reveals a URL input; Text hides it
- ANSWER IMAGE (optional) input is always present
- The FJ/1 counter only shows green `1/1` when all required fields (including mediaUrl for Image/Video) are filled
- The Play button only enables when all 61 clues (R1: 30, R2: 30, FJ: 1) are complete

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/EditorPage.jsx
git commit -m "feat: update EditorPage countFilled and FinalJeopardyTab for media clue types"
```

---

### Task 7: Update DisplayPage to render clue media and handle answerRevealed

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx`

- [ ] **Step 1: Import ClueMedia**

Add the import at the top of `client/src/pages/DisplayPage.jsx` (after existing imports):

```js
import ClueMedia from '../components/ClueMedia';
```

- [ ] **Step 2: Add game:answerRevealed to the socket event listeners**

Inside the `useEffect` in `DisplayPage`, add this listener alongside the others:

```js
socket.on('game:answerRevealed', ({ answer, answerImage }) =>
  setGame(g => ({ ...g, answerRevealed: true, revealedAnswer: answer, revealedAnswerImage: answerImage })));
```

Also reset `answerRevealed` when a new clue starts. Update the existing `game:clueRevealed` handler:

```js
socket.on('game:clueRevealed', clue =>
  setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null, buzzerState: 'locked', answerRevealed: false, revealedAnswer: null, revealedAnswerImage: null })));
```

And the `game:scored` handler (add the three reset fields to the existing spread):

```js
socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
  setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null, answerRevealed: false, revealedAnswer: null, revealedAnswerImage: null })));
```

And the `game:clueSkipped` handler:

```js
socket.on('game:clueSkipped', ({ revealedClues, currentPicker }) =>
  setGame(g => ({ ...g, phase: 'board', revealedClues, currentPicker, currentClue: null, answerRevealed: false, revealedAnswer: null, revealedAnswerImage: null })));
```

- [ ] **Step 3: Update game:finalClue handler to capture type and mediaUrl**

Replace the existing `game:finalClue` handler:

```js
socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
  setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [] })));
```

- [ ] **Step 4: Update ClueDisplay to render media and answer reveal**

Replace the `ClueDisplay` function:

```jsx
function ClueDisplay({ game }) {
  const { currentClue, phase, buzzedBy, players, currentPicker, buzzerState, answerRevealed, revealedAnswer, revealedAnswerImage } = game;
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      {currentClue && (
        <>
          <div style={{ fontSize: 13, color: '#93c5fd', letterSpacing: 3, marginBottom: 12 }}>
            {currentClue.categoryIndex !== undefined ? `CLUE · $${currentClue.value}` : ''}
          </div>
          <div style={{ fontSize: 28, fontWeight: 'bold', lineHeight: 1.5, maxWidth: 700, margin: '0 auto 16px' }}>
            {currentClue.question}
          </div>
          <ClueMedia type={currentClue.type} mediaUrl={currentClue.mediaUrl} />
          {answerRevealed && (
            <div style={{ marginTop: 24, padding: '16px 24px', background: '#0f172a', borderRadius: 10, display: 'inline-block' }}>
              <div style={{ fontSize: 22, color: '#4ade80', fontWeight: 'bold', marginBottom: revealedAnswerImage ? 12 : 0 }}>
                {revealedAnswer}
              </div>
              {revealedAnswerImage && (
                <img src={revealedAnswerImage} alt="answer" style={{ maxWidth: 480, maxHeight: 320, borderRadius: 8, display: 'block', margin: '0 auto' }} />
              )}
            </div>
          )}
        </>
      )}
      {phase === 'clue' && (
        <div style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1e293b', border: '1px solid #f87171', borderRadius: 20, padding: '6px 16px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
          <span style={{ fontSize: 13, color: '#f87171', fontWeight: 'bold' }}>BUZZERS LOCKED</span>
        </div>
      )}
      {phase === 'judging' && buzzedBy && (
        <div style={{ marginTop: 24, background: '#f59e0b', borderRadius: 12, padding: '16px 32px', display: 'inline-block' }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#0a0a0a' }}>{buzzedBy.toUpperCase()}</div>
          <div style={{ fontSize: 13, color: '#78350f' }}>buzzed in first!</div>
        </div>
      )}
      <ScoreBar players={players} currentPicker={phase === 'board' ? currentPicker : null} />
    </div>
  );
}
```

- [ ] **Step 5: Update DisplayFinalClue to render FJ media**

Replace the `DisplayFinalClue` function:

```jsx
function DisplayFinalClue({ game }) {
  const submitted = game.answersSubmitted || [];
  return (
    <div style={{ padding: 60, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ fontSize: 22, color: '#a5b4fc', marginBottom: 16, textAlign: 'center' }}>{game.fjCategory}</div>
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 32, marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 24, lineHeight: 1.6, color: '#e2e8f0' }}>{game.fjClue}</div>
        <ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} />
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
```

- [ ] **Step 6: Manual test in browser**

Start a game with at least 2 players. Select an image clue (you'll need to create a board with one first). Verify:
- The image appears below the clue text on the display screen
- When the host clicks "Reveal Answer" (Task 8), the answer text + image appear on the display
- For FJ: a FJ clue with an image type shows the image during the answer-writing phase

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/DisplayPage.jsx
git commit -m "feat: render clue media and answer reveal on display page; add FJ media to DisplayFinalClue"
```

---

### Task 8: Update HostPage — media rendering, Reveal Answer button, FJ updates

**Files:**
- Modify: `client/src/pages/HostPage.jsx`

- [ ] **Step 1: Import ClueMedia**

Add the import at the top of `client/src/pages/HostPage.jsx` (after existing imports):

```js
import ClueMedia from '../components/ClueMedia';
```

- [ ] **Step 2: Add game:answerRevealed to host socket listeners and reset on new clue**

In the `init` function's socket setup, add:

```js
socket.on('game:answerRevealed', () => setGame(g => ({ ...g, answerRevealed: true })));
```

Update the existing `host:clue` handler to reset answerRevealed:

```js
socket.on('host:clue', clue => setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null, answerRevealed: false })));
```

Update the `game:scored` handler to reset answerRevealed:

```js
socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
  setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null, answerRevealed: false })));
```

Update the `game:clueSkipped` handler:

```js
socket.on('game:clueSkipped', ({ revealedClues, currentPicker }) =>
  setGame(g => ({ ...g, phase: 'board', revealedClues, currentPicker, currentClue: null, answerRevealed: false })));
```

- [ ] **Step 3: Update game:finalClue handler to capture type and mediaUrl**

Replace the existing `game:finalClue` handler:

```js
socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
  setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [] })));
```

- [ ] **Step 4: Update game:finalJudgingReady handler to capture fjAnswerImage**

Replace the existing `game:finalJudgingReady` handler:

```js
socket.on('game:finalJudgingReady', ({ answers, fjAnswerImage }) =>
  setGame(g => ({ ...g, phase: 'final-judging', fjAnswers: answers, fjAnswerImage: fjAnswerImage || null })));
```

- [ ] **Step 5: Update HostClue component to render clue media, answer image, and Reveal Answer button**

Replace the `HostClue` function:

```jsx
function HostClue({ game, board }) {
  const { currentClue, phase, buzzedBy, players, buzzerState, answerRevealed } = game;
  const currentRound = game.currentRound || 1;
  const currentCategories = board[`round${currentRound}`].categories;
  const clueData = currentClue && currentCategories[currentClue.categoryIndex]?.clues[currentClue.clueIndex];
  const clueValue = currentClue ? (currentClue.clueIndex + 1) * (currentRound === 1 ? 200 : 400) : 0;

  return (
    <div>
      {buzzedBy && (
        <div style={{ background: '#f59e0b', borderRadius: 8, padding: '10px 14px', textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 'bold', fontSize: 16, color: '#0a0a0a' }}>{buzzedBy} is answering</div>
        </div>
      )}
      {clueData && (
        <>
          <div style={{ fontSize: 11, color: '#a5b4fc', letterSpacing: 2, marginBottom: 6 }}>
            {currentCategories[currentClue.categoryIndex].name} · ${clueValue}
          </div>
          <div style={{ background: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>CLUE</div>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{clueData.question}</div>
            <ClueMedia type={clueData.type} mediaUrl={clueData.mediaUrl} compact />
          </div>
          <div style={{ background: '#14532d', border: '1px solid #16a34a', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#86efac', marginBottom: 4 }}>ANSWER</div>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: '#4ade80' }}>{clueData.answer}</div>
            {clueData.answerImage && (
              <img src={clueData.answerImage} alt="answer" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, marginTop: 8, display: 'block' }} />
            )}
          </div>
        </>
      )}
      {phase === 'clue' && !buzzedBy && (
        <div style={{ display: 'flex', gap: 10 }}>
          {buzzerState !== 'open' && (
            <button onClick={() => socket.emit('host:unlock')}
              style={{ flex: 1, padding: 14, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              🔓 Unlock Buzzers
            </button>
          )}
          <button onClick={() => socket.emit('host:skipClue')}
            style={{ padding: '14px 18px', background: '#374151', color: '#94a3b8', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Skip
          </button>
        </div>
      )}
      {phase === 'judging' && clueData && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {clueData.answerImage && (
            <button
              onClick={() => socket.emit('host:revealAnswer')}
              disabled={answerRevealed}
              style={{ width: '100%', padding: '10px 0', background: answerRevealed ? '#334155' : '#7c3aed', color: answerRevealed ? '#64748b' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: answerRevealed ? 'not-allowed' : 'pointer', marginBottom: 4 }}>
              {answerRevealed ? '✓ Answer Revealed' : '🖼 Reveal Answer on Display'}
            </button>
          )}
          <button onClick={() => socket.emit('host:judge', { result: 'correct' })}
            style={{ flex: 1, padding: 16, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
            ✓ Correct<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>+${clueValue}</span>
          </button>
          <button onClick={() => socket.emit('host:judge', { result: 'incorrect' })}
            style={{ flex: 1, padding: 16, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
            ✗ Incorrect<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>-${clueValue}</span>
          </button>
        </div>
      )}
      <ScoreBar players={players || []} />
    </div>
  );
}
```

- [ ] **Step 6: Update HostFinalClue to render FJ media**

Replace the `HostFinalClue` function:

```jsx
function HostFinalClue({ game }) {
  const submitted = game.answersSubmitted || [];
  const total = (game.players || []).length;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>{game.fjCategory}</div>
      <div style={{ background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: '#e2e8f0' }}>{game.fjClue}</div>
        <ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} compact />
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
```

- [ ] **Step 7: Update HostFinalJudging to show fjAnswerImage**

In the `HostFinalJudging` function, add the answer image display above the player list. Replace the opening of the return block:

```jsx
function HostFinalJudging({ game, judgments, onJudge }) {
  const answers = game.fjAnswers || [];
  const allJudged = answers.length > 0 && answers.every(a => judgments[a.playerName] !== undefined);
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 20 }}>Judge Final Answers</div>
      {game.fjAnswerImage && (
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>ANSWER IMAGE</div>
          <img src={game.fjAnswerImage} alt="FJ answer" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8 }} />
        </div>
      )}
      {answers.map(({ playerName, answer }) => (
        // ... rest of the existing map is unchanged
```

The full replacement for `HostFinalJudging`:

```jsx
function HostFinalJudging({ game, judgments, onJudge }) {
  const answers = game.fjAnswers || [];
  const allJudged = answers.length > 0 && answers.every(a => judgments[a.playerName] !== undefined);
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 20 }}>Judge Final Answers</div>
      {game.fjAnswerImage && (
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>ANSWER IMAGE</div>
          <img src={game.fjAnswerImage} alt="FJ answer" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8 }} />
        </div>
      )}
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

- [ ] **Step 8: Manual test in browser — regular clue flow**

Start a game. Select a regular (text) clue. Verify:
- No media appears in the host or display clue view
- No "Reveal Answer" button appears in the judging panel (since no answerImage)

- [ ] **Step 9: Manual test — image clue with answer image**

Create a board with an image clue that has both `mediaUrl` and `answerImage`. Start a game and select that clue. Verify:
- The image appears below the clue text on both the host panel and the display
- The answer image appears below the answer text in the host panel
- In judging phase: the "🖼 Reveal Answer on Display" button appears
- Clicking it sends the answer text + answer image to the display
- The button disables after clicking ("✓ Answer Revealed")
- After judging, the display returns to the board (answer reveal clears)

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/HostPage.jsx
git commit -m "feat: render clue media and answer image in host panel; add Reveal Answer button; FJ media and answer image in judging"
```
