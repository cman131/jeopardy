# Relax Media Clue Text Requirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `question`/`clue` text field optional for image, video, and audio clues — both in the Mongoose schema and in the client-side completeness logic.

**Architecture:** Remove `required: true` from the Mongoose schema for `clueSchema.question` and `finalJeopardySchema.clue`. Update the three client-side completeness checks to gate on `type === 'regular'` instead of always requiring text. Update the grid cell preview and editor labels to reflect the optional nature of the field for media types.

**Tech Stack:** Mongoose 8, React (JSX), Vitest (client tests), Jest + mongodb-memory-server + supertest (server integration tests)

---

## File Map

| File | Change |
|------|--------|
| `server/src/models/Board.js` | Remove `required: true` from `clueSchema.question` and `finalJeopardySchema.clue` |
| `server/tests/integration/boards.test.js` | Add tests for saving image/audio/video clues with empty question |
| `server/tests/helpers.js` | Add `makeMediaClue` helper |
| `client/src/pages/EditorPage.jsx` | Update `isClueComplete` and FJ completeness checks |
| `client/src/components/BoardEditorGrid.jsx` | Update `complete` check, grid preview, and CLUE label |

---

## Task 1: Add integration tests for media clues with no text (RED)

**Files:**
- Modify: `server/tests/helpers.js`
- Modify: `server/tests/integration/boards.test.js`

- [ ] **Step 1: Add `makeMediaClue` helper to `server/tests/helpers.js`**

Add this function before `module.exports`:

```js
function makeMediaClue(type, mediaUrl, answer, overrides = {}) {
  return { question: '', answer, type, mediaUrl, answerImage: '', mediaHash: '', ...overrides };
}
```

And export it:

```js
module.exports = { startDb, stopDb, clearDb, makeTestBoard, makeMediaClue };
```

- [ ] **Step 2: Add failing tests to `server/tests/integration/boards.test.js`**

Add this import at the top (update the existing destructure):

```js
const { startDb, stopDb, clearDb, makeTestBoard, makeMediaClue } = require('../helpers');
```

Add this new `describe` block at the end of the file:

```js
describe('POST /api/boards — media clues without text', () => {
  function boardWithMediaClue(type) {
    const board = makeTestBoard();
    board.round1.categories[0].clues[0] = makeMediaClue(type, 'https://example.com/media', 'The answer');
    return board;
  }

  test('accepts image clue with empty question', async () => {
    const res = await request(app).post('/api/boards').send(boardWithMediaClue('image'));
    expect(res.status).toBe(201);
  });

  test('accepts audio clue with empty question', async () => {
    const res = await request(app).post('/api/boards').send(boardWithMediaClue('audio'));
    expect(res.status).toBe(201);
  });

  test('accepts video clue with empty question', async () => {
    const res = await request(app).post('/api/boards').send(boardWithMediaClue('video'));
    expect(res.status).toBe(201);
  });

  test('accepts final jeopardy image clue with empty clue text', async () => {
    const board = makeTestBoard();
    board.finalJeopardy = { category: 'FJ-CAT', clue: '', answer: 'FJ-ANSWER', type: 'image', mediaUrl: 'https://example.com/img.jpg' };
    const res = await request(app).post('/api/boards').send(board);
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run from the `server/` directory:
```
cd server && npx jest tests/integration/boards.test.js --no-coverage
```

Expected: 4 new tests FAIL with a 400 status (Mongoose `required` validation error).

---

## Task 2: Remove `required` from the Mongoose schema (GREEN)

**Files:**
- Modify: `server/src/models/Board.js`

- [ ] **Step 1: Remove `required: true` from `clueSchema.question`**

In `server/src/models/Board.js`, change line 4 from:
```js
  question: { type: String, required: true },
```
to:
```js
  question: { type: String },
```

- [ ] **Step 2: Remove `required: true` from `finalJeopardySchema.clue`**

Change line 29 from:
```js
  clue: { type: String, required: true },
```
to:
```js
  clue: { type: String },
```

- [ ] **Step 3: Run all server tests to verify they pass**

```
cd server && npx jest --no-coverage
```

Expected: all tests pass, including the 4 new ones from Task 1.

- [ ] **Step 4: Commit**

```bash
git add server/src/models/Board.js server/tests/integration/boards.test.js server/tests/helpers.js
git commit -m "feat: make question/clue field optional for media-type clues in Mongoose schema"
```

---

## Task 3: Update client completeness logic in EditorPage

**Files:**
- Modify: `client/src/pages/EditorPage.jsx`

These are visual/UI completeness checks — no separate unit tests exist for them. Verify by running the app after the change.

- [ ] **Step 1: Update `isClueComplete` (lines 32–35)**

Change:
```jsx
  const isClueComplete = (cl) => {
    const type = cl.type || 'regular';
    return !!(cl.question && cl.answer && (type === 'regular' || cl.mediaUrl || cl.mediaHash));
  };
```
to:
```jsx
  const isClueComplete = (cl) => {
    const type = cl.type || 'regular';
    if (type === 'regular') return !!(cl.question && cl.answer);
    return !!(cl.answer && (cl.mediaUrl || cl.mediaHash));
  };
```

- [ ] **Step 2: Update FJ completeness count (line 43)**

Change:
```jsx
    fj: (fj.category && fj.clue && fj.answer && (fjType === 'regular' || fj.mediaUrl || fj.mediaHash)) ? 1 : 0,
```
to:
```jsx
    fj: (fj.category && fj.answer && (fjType === 'regular' ? fj.clue : (fj.mediaUrl || fj.mediaHash))) ? 1 : 0,
```

- [ ] **Step 3: Update FJ completion indicator (line 344)**

Change:
```jsx
      {fj.category && fj.clue && fj.answer && (type === 'regular' || fj.mediaUrl) && (
```
to:
```jsx
      {fj.category && fj.answer && (type === 'regular' ? fj.clue : (fj.mediaUrl || fj.mediaHash)) && (
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EditorPage.jsx
git commit -m "feat: update EditorPage completeness checks to not require text for media clues"
```

---

## Task 4: Update grid cell complete check, preview, and CLUE label

**Files:**
- Modify: `client/src/components/BoardEditorGrid.jsx`

- [ ] **Step 1: Update `complete` check (line 38)**

Change:
```jsx
              const complete = !!(clue.question && clue.answer && (type === 'regular' || clue.mediaUrl));
```
to:
```jsx
              const complete = type === 'regular'
                ? !!(clue.question && clue.answer)
                : !!(clue.answer && clue.mediaUrl);
```

- [ ] **Step 2: Update grid cell preview (line 60)**

Change:
```jsx
                      {type === 'image' ? '📷 ' : type === 'video' ? '▶ ' : type === 'audio' ? '🔊 ' : ''}{clue.question}
```
to:
```jsx
                      {type === 'image' ? '📷' : type === 'video' ? '▶' : type === 'audio' ? '🔊' : ''}{clue.question ? (type !== 'regular' ? ' ' : '') + clue.question : ''}
```

- [ ] **Step 3: Update the CLUE label in `ClueModal` (line 136)**

Change:
```jsx
        <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>CLUE</div>
```
to:
```jsx
        <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>
          CLUE{type !== 'regular' ? <span style={{ color: 'var(--color-muted)', fontWeight: 'normal' }}> (optional)</span> : ''}
        </div>
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BoardEditorGrid.jsx
git commit -m "feat: update grid completeness check, preview, and label for optional media clue text"
```

---

## Task 5: Update FJ editor CLUE label in EditorPage

**Files:**
- Modify: `client/src/pages/EditorPage.jsx`

- [ ] **Step 1: Locate the FJ CLUE label**

Find the section in `EditorPage.jsx` that renders the FJ editor (around line 313–322). The label currently reads:
```jsx
        <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>CLUE</div>
```
just above the `<textarea value={fj.clue} ...>`.

- [ ] **Step 2: Update the FJ CLUE label**

`type` is already defined at line 265 as `const type = fj.type || 'regular'` inside `FinalJeopardyTab`. Change the CLUE label to:
```jsx
        <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>
          CLUE{type !== 'regular' ? <span style={{ color: 'var(--color-muted)', fontWeight: 'normal' }}> (optional)</span> : ''}
        </div>
```

- [ ] **Step 3: Run client tests**

```
cd client && npx vitest run
```

Expected: all existing tests pass (no client tests cover this component).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EditorPage.jsx
git commit -m "feat: mark FJ clue text as optional in editor label for media types"
```

---

## Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

From the project root, start the app (frontend + backend).

- [ ] **Step 2: Open the board editor and create an image clue with no text**

  1. Open the editor, pick any cell.
  2. Set type to "📷 Image", enter a media URL, leave CLUE empty, fill in the answer.
  3. Verify: the cell shows ✓ and full opacity with just the 📷 icon (no text after it).
  4. Save the board. Verify no error.

- [ ] **Step 3: Verify a regular clue still requires text**

  1. Pick another cell, set type to "Text", fill in the answer but leave CLUE empty.
  2. Verify: the cell does NOT show ✓ (incomplete).

- [ ] **Step 4: Verify FJ with audio type and no clue text**

  1. Switch to Final Jeopardy tab.
  2. Set type to "🔊 Audio", enter a media URL, fill in category and answer, leave CLUE empty.
  3. Verify: "✓ Final Jeopardy complete" indicator appears.
  4. Save. Verify no error.

- [ ] **Step 5: Verify CLUE label shows "(optional)" for media types and not for text type**

  Check both the ClueModal and the FJ editor.
