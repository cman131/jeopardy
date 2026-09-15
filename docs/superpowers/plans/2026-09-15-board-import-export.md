# Board Import / Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Buzzinga CSV import (alongside existing JSON import) surfaced via a modal in the board editor, storing unresolvable media as a `mediaHash` field on clue schemas.

**Architecture:** Pure client-side — `boardImportUtils.js` owns all parsing/validation logic, `ImportBoardModal.jsx` owns the UI flow and calls back with a valid board, `EditorPage.jsx` wires them together. The only server change is adding `audio` type and `mediaHash` to the Mongoose schema.

**Tech Stack:** React 19, Vite 8, vitest (new), PapaParse (new), Mongoose

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `client/package.json` | Modify | Add papaparse, vitest |
| `client/vite.config.js` | Modify | Add vitest test config |
| `server/src/models/Board.js` | Modify | Add `audio` type + `mediaHash` field |
| `client/src/utils/boardImportUtils.js` | **Create** | `parseBuzzingaCsv` + `validateBoardJson` |
| `client/src/utils/boardImportUtils.test.js` | **Create** | Unit tests |
| `client/src/components/ImportBoardModal.jsx` | **Create** | Import modal UI |
| `client/src/pages/EditorPage.jsx` | Modify | Wire modal, warning banner, remove local validator, update emptyBoard |

---

### Task 1: Install dependencies and configure vitest

**Files:**
- Modify: `client/package.json`
- Modify: `client/vite.config.js`

- [ ] **Step 1: Install papaparse and vitest**

Run from `client/` directory:
```bash
npm install papaparse
npm install --save-dev vitest
```

Expected: `papaparse` appears in `dependencies`, `vitest` appears in `devDependencies`.

- [ ] **Step 2: Add test script to package.json**

In `client/package.json`, add `"test": "vitest run"` to the `scripts` block:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "oxlint",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 3: Add vitest config to vite.config.js**

Replace the full contents of `client/vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify vitest is configured**

Run from `client/`:
```bash
npx vitest run
```

Expected: Output like "No test files found" or "0 tests" — not an installation error.

- [ ] **Step 5: Commit**

```bash
git add client/package.json client/vite.config.js client/package-lock.json
git commit -m "chore: add papaparse and vitest to client"
```

---

### Task 2: Update Board schema

**Files:**
- Modify: `server/src/models/Board.js`

- [ ] **Step 1: Add `audio` type and `mediaHash` to clueSchema**

In `server/src/models/Board.js`, replace `clueSchema`:

```javascript
const clueSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  type: { type: String, enum: ['regular', 'image', 'video', 'audio'], default: 'regular' },
  mediaUrl: { type: String },
  answerImage: { type: String },
  mediaHash: { type: String },
});
```

- [ ] **Step 2: Add `audio` type and `mediaHash` to finalJeopardySchema**

Replace `finalJeopardySchema`:

```javascript
const finalJeopardySchema = new mongoose.Schema({
  category: { type: String, required: true },
  clue: { type: String, required: true },
  answer: { type: String, required: true },
  type: { type: String, enum: ['regular', 'image', 'video', 'audio'], default: 'regular' },
  mediaUrl: { type: String },
  answerImage: { type: String },
  mediaHash: { type: String },
}, { _id: false });
```

- [ ] **Step 3: Commit**

```bash
git add server/src/models/Board.js
git commit -m "feat: add audio type and mediaHash to Board schema"
```

---

### Task 3: Create boardImportUtils.js with TDD

**Files:**
- Create: `client/src/utils/boardImportUtils.js`
- Create: `client/src/utils/boardImportUtils.test.js`

- [ ] **Step 1: Write failing tests**

Create `client/src/utils/boardImportUtils.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { validateBoardJson, parseBuzzingaCsv } from './boardImportUtils.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeValidBoard() {
  const clue = { question: 'Q', answer: 'A' };
  const category = { name: 'CAT', clues: Array(5).fill(clue) };
  const round = { categories: Array(6).fill(category) };
  return {
    round1: round,
    round2: round,
    finalJeopardy: { category: 'CAT', clue: 'Q', answer: 'A' },
  };
}

const CSV_HEADER =
  'round,col,cat,catDescription,row,customValue,clueText,correctResponse,' +
  'isDailyDouble,clueType,topCaption,bottomCaption,answerType,answerTopCaption,' +
  'answerBottomCaption,buzzerActivationMode,isAudioOnly,isAnswerAudioOnly';

// Full 2-round + final CSV where all clues are TEXT, except the first clue
// (round=1, col=1, row=1) which can be replaced by `overrideRow`.
function buildCsv(overrideRow = null) {
  const rows = [CSV_HEADER];
  for (let round = 1; round <= 2; round++) {
    for (let col = 1; col <= 6; col++) {
      for (let row = 1; row <= 5; row++) {
        if (overrideRow && round === 1 && col === 1 && row === 1) {
          rows.push(overrideRow);
        } else {
          rows.push(
            `${round},${col},Cat${col},,${row},,Q${round}${col}${row},A${round}${col}${row},FALSE,TEXT,,,TEXT,,,none,FALSE,FALSE`,
          );
        }
      }
    }
  }
  rows.push(
    'final,,FinalCat,,,,"Final clue","Final answer",FALSE,TEXT,,,TEXT,,,none,FALSE,FALSE',
  );
  return rows.join('\n');
}

// ─── validateBoardJson ───────────────────────────────────────────────────────

describe('validateBoardJson', () => {
  it('returns true for a valid board', () => {
    expect(validateBoardJson(makeValidBoard())).toBe(true);
  });

  it('returns false for null', () => {
    expect(validateBoardJson(null)).toBe(false);
  });

  it('returns false for old single-round format', () => {
    expect(validateBoardJson({ categories: [] })).toBe(false);
  });

  it('returns false when round1 is missing', () => {
    const b = makeValidBoard();
    delete b.round1;
    expect(validateBoardJson(b)).toBe(false);
  });

  it('returns false when finalJeopardy is missing', () => {
    const b = makeValidBoard();
    delete b.finalJeopardy;
    expect(validateBoardJson(b)).toBe(false);
  });

  it('returns false when a round has fewer than 6 categories', () => {
    const b = makeValidBoard();
    b.round1.categories = b.round1.categories.slice(0, 5);
    expect(validateBoardJson(b)).toBe(false);
  });
});

// ─── parseBuzzingaCsv ────────────────────────────────────────────────────────

describe('parseBuzzingaCsv', () => {
  it('produces a board with 6 categories and 5 clues per round', () => {
    const { board } = parseBuzzingaCsv(buildCsv());
    expect(board.round1.categories).toHaveLength(6);
    expect(board.round2.categories).toHaveLength(6);
    expect(board.round1.categories[0].clues).toHaveLength(5);
  });

  it('maps TEXT clue to regular type with no media fields', () => {
    const { board, warnings } = parseBuzzingaCsv(buildCsv());
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('regular');
    expect(clue.question).toBe('Q111');
    expect(clue.answer).toBe('A111');
    expect(clue.mediaHash).toBe('');
    expect(clue.mediaUrl).toBe('');
    expect(warnings).toBe(0);
  });

  it('maps IMAGE clue to image type with mediaHash and topCaption as question', () => {
    const row =
      '1,1,Cat1,,1,,abc123hash,The answer,FALSE,IMAGE,Name the movie,,,TEXT,,,none,FALSE,FALSE';
    const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('image');
    expect(clue.question).toBe('Name the movie');
    expect(clue.mediaHash).toBe('abc123hash');
    expect(clue.mediaUrl).toBe('');
    expect(warnings).toBe(1);
  });

  it('maps VIDEO clue to video type with mediaUrl and no mediaHash', () => {
    const row =
      '1,1,Cat1,,1,,https://youtube.com/watch?v=abc,Squid Game,FALSE,VIDEO,Name the show,,,TEXT,,,none,FALSE,FALSE';
    const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('video');
    expect(clue.question).toBe('Name the show');
    expect(clue.mediaUrl).toBe('https://youtube.com/watch?v=abc');
    expect(clue.mediaHash).toBe('');
    expect(warnings).toBe(0);
  });

  it('maps AUDIO clue to audio type with mediaHash', () => {
    const row =
      '1,1,Cat1,,1,,def456hash,Song name,FALSE,AUDIO,Name the song,,,TEXT,,,none,FALSE,FALSE';
    const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('audio');
    expect(clue.question).toBe('Name the song');
    expect(clue.mediaHash).toBe('def456hash');
    expect(clue.mediaUrl).toBe('');
    expect(warnings).toBe(1);
  });

  it('maps the final jeopardy row correctly', () => {
    const { board } = parseBuzzingaCsv(buildCsv());
    expect(board.finalJeopardy.category).toBe('FinalCat');
    expect(board.finalJeopardy.clue).toBe('Final clue');
    expect(board.finalJeopardy.answer).toBe('Final answer');
    expect(board.finalJeopardy.type).toBe('regular');
  });

  it('uses category name from the rows of each column', () => {
    const { board } = parseBuzzingaCsv(buildCsv());
    expect(board.round1.categories[0].name).toBe('Cat1');
    expect(board.round1.categories[5].name).toBe('Cat6');
  });

  it('skips blank separator rows without errors', () => {
    const csv = buildCsv() + '\n,,,,,,,,,,,,,,,,,';
    expect(() => parseBuzzingaCsv(csv)).not.toThrow();
    const { board } = parseBuzzingaCsv(csv);
    expect(board.round1.categories).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run from `client/`:
```bash
npx vitest run src/utils/boardImportUtils.test.js
```

Expected: All tests fail with `Cannot find module './boardImportUtils.js'`.

- [ ] **Step 3: Create boardImportUtils.js**

Create `client/src/utils/boardImportUtils.js`:

```javascript
import Papa from 'papaparse';

const CLUE_TYPE_MAP = {
  TEXT: 'regular',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
};

function emptyClue() {
  return { question: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '', mediaHash: '' };
}

function mapClueRow(row) {
  const buzzingaType = (row.clueType || 'TEXT').trim().toUpperCase();
  const ourType = CLUE_TYPE_MAP[buzzingaType] || 'regular';
  const clue = {
    question: '',
    answer: (row.correctResponse || '').trim(),
    type: ourType,
    mediaUrl: '',
    answerImage: '',
    mediaHash: '',
  };

  if (ourType === 'regular') {
    clue.question = (row.clueText || '').trim();
  } else if (ourType === 'video') {
    clue.question = (row.topCaption || '').trim();
    clue.mediaUrl = (row.clueText || '').trim();
  } else {
    // image or audio — clueText is a Buzzinga content hash
    clue.question = (row.topCaption || '').trim();
    clue.mediaHash = (row.clueText || '').trim();
  }

  return clue;
}

export function parseBuzzingaCsv(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  const rounds = { 1: {}, 2: {} };
  let finalJeopardy = null;
  let warnings = 0;

  for (const row of data) {
    const roundVal = String(row.round || '').trim().toLowerCase();
    if (!roundVal) continue;

    if (roundVal === 'final') {
      const buzzingaType = (row.clueType || 'TEXT').trim().toUpperCase();
      const ourType = CLUE_TYPE_MAP[buzzingaType] || 'regular';
      finalJeopardy = {
        category: (row.cat || '').trim(),
        clue: ourType === 'regular' ? (row.clueText || '').trim() : (row.topCaption || '').trim(),
        answer: (row.correctResponse || '').trim(),
        type: ourType,
        mediaUrl: ourType === 'video' ? (row.clueText || '').trim() : '',
        mediaHash:
          ourType === 'image' || ourType === 'audio' ? (row.clueText || '').trim() : '',
        answerImage: '',
      };
      if (finalJeopardy.mediaHash) warnings++;
      continue;
    }

    const roundNum = parseInt(roundVal, 10);
    if (roundNum !== 1 && roundNum !== 2) continue;

    const col = parseInt(row.col, 10);
    const rowNum = parseInt(row.row, 10);
    if (isNaN(col) || isNaN(rowNum)) continue;

    if (!rounds[roundNum][col]) {
      rounds[roundNum][col] = { name: (row.cat || 'CATEGORY').trim(), clues: {} };
    }

    const clue = mapClueRow(row);
    if (clue.mediaHash) warnings++;
    rounds[roundNum][col].clues[rowNum] = clue;
  }

  function buildRound(roundData) {
    return {
      categories: Array.from({ length: 6 }, (_, i) => {
        const col = i + 1;
        const cat = roundData[col] || { name: 'CATEGORY', clues: {} };
        return {
          name: cat.name,
          clues: Array.from({ length: 5 }, (__, j) => cat.clues[j + 1] || emptyClue()),
        };
      }),
    };
  }

  return {
    board: {
      name: 'Imported Board',
      round1: buildRound(rounds[1]),
      round2: buildRound(rounds[2]),
      finalJeopardy: finalJeopardy || {
        category: '',
        clue: '',
        answer: '',
        type: 'regular',
        mediaUrl: '',
        mediaHash: '',
        answerImage: '',
      },
    },
    warnings,
  };
}

export function validateBoardJson(data) {
  if (!data || typeof data !== 'object') return false;
  const validRound = (r) =>
    r &&
    Array.isArray(r.categories) &&
    r.categories.length === 6 &&
    r.categories.every(
      (c) =>
        Array.isArray(c.clues) &&
        c.clues.length === 5 &&
        c.clues.every((cl) => 'question' in cl && 'answer' in cl),
    );
  const validFj = (fj) => fj && 'category' in fj && 'clue' in fj && 'answer' in fj;
  if ('categories' in data) return false;
  return validRound(data.round1) && validRound(data.round2) && validFj(data.finalJeopardy);
}
```

- [ ] **Step 4: Run tests to confirm they all pass**

Run from `client/`:
```bash
npx vitest run src/utils/boardImportUtils.test.js
```

Expected: All tests pass. If any fail, fix the implementation before continuing.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/boardImportUtils.js client/src/utils/boardImportUtils.test.js
git commit -m "feat: add boardImportUtils with parseBuzzingaCsv and validateBoardJson"
```

---

### Task 4: Create ImportBoardModal.jsx

**Files:**
- Create: `client/src/components/ImportBoardModal.jsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/ImportBoardModal.jsx`:

```jsx
import { useState, useRef } from 'react';
import { validateBoardJson, parseBuzzingaCsv } from '../utils/boardImportUtils.js';

export default function ImportBoardModal({ onImport, onClose }) {
  const [format, setFormat] = useState('json');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  function handleFormatChange(newFormat) {
    setFormat(newFormat);
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFileChange(e) {
    setFile(e.target.files[0] || null);
    setError(null);
  }

  function handleImport() {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      try {
        if (format === 'json') {
          const data = JSON.parse(text);
          if (!validateBoardJson(data)) {
            setError(
              'Invalid board JSON. Must contain round1, round2, and finalJeopardy sections. Old single-round boards are not supported.',
            );
            return;
          }
          onImport(data, 0);
        } else {
          const { board, warnings } = parseBuzzingaCsv(text);
          onImport(board, warnings);
        }
      } catch {
        setError(format === 'json' ? 'Invalid JSON file.' : 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 10, padding: 24, width: 380,
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--color-white)', marginBottom: 16 }}>
          Import Board
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 8, letterSpacing: 1 }}>
            FORMAT
          </div>
          {[
            { value: 'json', label: 'Our JSON format' },
            { value: 'buzzinga', label: 'Buzzinga CSV' },
          ].map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                cursor: 'pointer', color: 'var(--color-muted)', fontSize: 13,
              }}
            >
              <input
                type="radio"
                name="importFormat"
                value={opt.value}
                checked={format === opt.value}
                onChange={() => handleFormatChange(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={format === 'json' ? '.json' : '.csv'}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', padding: '8px 12px', background: 'var(--bg-panel)',
              border: '1px dashed var(--border-subtle)', borderRadius: 6,
              color: file ? 'var(--color-white)' : 'var(--color-muted)',
              fontSize: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            {file ? file.name : `Choose ${format === 'json' ? '.json' : '.csv'} file…`}
          </button>
        </div>

        {error && (
          <div style={{
            background: '#450a0a', border: '1px solid #b91c1c', borderRadius: 6,
            padding: '8px 12px', marginBottom: 16, fontSize: 12, color: 'var(--color-red)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', background: 'var(--bg-panel)', border: 'none',
              color: 'var(--color-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file}
            style={{
              padding: '8px 16px', background: file ? '#1d4ed8' : 'var(--bg-panel)',
              border: 'none', color: file ? '#fff' : 'var(--color-muted)',
              borderRadius: 6, cursor: file ? 'pointer' : 'not-allowed',
              fontWeight: 'bold', fontSize: 12,
            }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ImportBoardModal.jsx
git commit -m "feat: add ImportBoardModal component"
```

---

### Task 5: Wire modal and warning banner into EditorPage.jsx

**Files:**
- Modify: `client/src/pages/EditorPage.jsx`

- [ ] **Step 1: Replace imports at the top of the file**

Replace lines 1–4:
```javascript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoardEditorGrid from '../components/BoardEditorGrid';
import NavBreadcrumb from '../components/NavBreadcrumb';
```

With:
```javascript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoardEditorGrid from '../components/BoardEditorGrid';
import NavBreadcrumb from '../components/NavBreadcrumb';
import ImportBoardModal from '../components/ImportBoardModal.jsx';
import { validateBoardJson } from '../utils/boardImportUtils.js';
```

- [ ] **Step 2: Add `mediaHash` to emptyRound clue shape**

Replace lines 9–18 (`emptyRound` function):
```javascript
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

With:
```javascript
function emptyRound() {
  return {
    categories: Array.from({ length: 6 }, () => ({
      name: 'CATEGORY',
      clues: Array.from({ length: 5 }, () => ({
        question: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '', mediaHash: '',
      })),
    })),
  };
}
```

- [ ] **Step 3: Add `mediaHash` to emptyBoard finalJeopardy shape**

Replace lines 20–27 (`emptyBoard` function):
```javascript
function emptyBoard() {
  return {
    name: 'New Board',
    round1: emptyRound(),
    round2: emptyRound(),
    finalJeopardy: { category: '', clue: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '' },
  };
}
```

With:
```javascript
function emptyBoard() {
  return {
    name: 'New Board',
    round1: emptyRound(),
    round2: emptyRound(),
    finalJeopardy: { category: '', clue: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '', mediaHash: '' },
  };
}
```

- [ ] **Step 4: Delete the local validateBoardJson function**

Delete lines 29–39 entirely:
```javascript
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
```

- [ ] **Step 5: Add new state variables in the EditorPage function**

After the existing state declarations (after the line `const [error, setError] = useState(null);`), add:
```javascript
const [showImportModal, setShowImportModal] = useState(false);
const [importWarnings, setImportWarnings] = useState(0);
```

- [ ] **Step 6: Replace importJson with handleImport**

Replace the entire `importJson` function:
```javascript
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
```

With:
```javascript
function handleImport(board, warnings) {
  setBoard(board);
  setActiveBoardId(null);
  setDirty(true);
  setImportWarnings(warnings);
  setShowImportModal(false);
  setActiveTab('round1');
}
```

- [ ] **Step 7: Add warning banner after the error banner in JSX**

After the existing error block:
```jsx
{error && (
  <div style={{ background: '#450a0a', border: '1px solid #b91c1c', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--color-red)' }}>
    {error}
  </div>
)}
```

Add immediately after it:
```jsx
{importWarnings > 0 && (
  <div style={{
    background: '#422006', border: '1px solid #92400e', borderRadius: 6,
    padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#fbbf24',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  }}>
    <span>
      {importWarnings} clue{importWarnings !== 1 ? 's' : ''} imported with Buzzinga media
      hashes — open those clues and replace the hash with a real URL to use
      image/audio/video media.
    </span>
    <button
      onClick={() => setImportWarnings(0)}
      style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: 16, lineHeight: 1, marginLeft: 12 }}
    >
      ×
    </button>
  </div>
)}
```

- [ ] **Step 8: Update the sidebar buttons**

Replace the two sidebar buttons:
```jsx
<button onClick={importJson} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--color-muted)', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬆ Import JSON</button>
<button onClick={exportJson} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--color-muted)', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬇ Export JSON</button>
```

With:
```jsx
<button onClick={() => setShowImportModal(true)} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--color-muted)', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬆ Import Board</button>
<button onClick={exportJson} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--color-muted)', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬇ Export Board (JSON)</button>
```

- [ ] **Step 9: Render the modal at the end of the JSX return**

Before the closing `</div>` of the outermost container (the very end of the return statement), add:
```jsx
{showImportModal && (
  <ImportBoardModal
    onImport={handleImport}
    onClose={() => setShowImportModal(false)}
  />
)}
```

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/EditorPage.jsx
git commit -m "feat: integrate import modal and warning banner into EditorPage"
```

---

### Task 6: Smoke test the feature

- [ ] **Step 1: Start the dev server**

From the project root, run:
```powershell
.\start-dev.ps1
```

Or start client and server separately if needed.

- [ ] **Step 2: Test JSON import**

1. Navigate to the board editor (`/editor`)
2. Click "⬆ Import Board" in the sidebar
3. Verify the modal opens with two radio buttons — "Our JSON format" selected by default
4. Export the current board first via "⬇ Export Board (JSON)", then re-import that `.json` file
5. Expected: Board loads, no yellow warning banner

- [ ] **Step 3: Test Buzzinga CSV import**

1. Click "⬆ Import Board"
2. Select "Buzzinga CSV"
3. Verify the file picker now accepts `.csv` files
4. Choose `~/Downloads/Millennial Game Night 1.csv`
5. Click Import
6. Expected: Board loads. Round 1 categories should be "Guess the Movie Title", "Spell It Out", "TV Show Intros", "3 Movies, 1 Actor", "A Star Is Born...and Then Died", "7th Grade Science". Yellow warning banner appears stating the number of hashed clues.

- [ ] **Step 4: Test dismiss warning banner**

Click the `×` on the yellow warning banner. Expected: banner disappears.

- [ ] **Step 5: Test error cases**

1. Click Import → choose JSON format → pick a `.csv` file → Expected: inline error "Invalid JSON file."
2. Click Import → choose Buzzinga CSV → pick an empty `.txt` file → Expected: inline error "Failed to parse CSV file." or the board loads empty (either is acceptable)
3. Click backdrop of modal → Expected: modal closes

- [ ] **Step 6: Commit any fixes**

If any issues were found and fixed:
```bash
git add -p
git commit -m "fix: <describe what was fixed>"
```
