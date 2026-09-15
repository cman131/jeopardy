# Audio Media Type + Buzzinga Hash Auto-Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full audio clue support and auto-resolve Buzzinga content hashes to CDN URLs at import time, eliminating the manual-replacement warning.

**Architecture:** Hash-to-URL conversion happens in `parseBuzzingaCsv` so the rest of the pipeline sees plain `mediaUrl` values and needs no special hash awareness. Audio playback reuses the existing `host:playVideo`/`game:videoPlay` socket event pair — same behavior, different label. The `videoReady` prop on `ClueMedia` is renamed `mediaReady` since it now gates both video and audio.

**Tech Stack:** React (Vite), Socket.IO, Vitest for unit tests

---

## File Map

| File | Change |
|------|--------|
| `client/src/utils/boardImportUtils.js` | Hash → CDN URL in `mapClueRow` + FJ block; remove `warnings` counter |
| `client/src/utils/boardImportUtils.test.js` | Update IMAGE + AUDIO tests to expect CDN URLs, warnings → 0 |
| `client/src/components/ClueMedia.jsx` | Rename `videoReady` → `mediaReady`; add `audio` render branch |
| `client/src/pages/DisplayPage.jsx` | Update `videoReady` → `mediaReady` prop; extend condition to `audio` |
| `client/src/components/BoardEditorGrid.jsx` | Add `audio` type button + URL input + grid icon |
| `client/src/pages/EditorPage.jsx` | Add `audio` to FJ type buttons + URL label; remove warnings banner |
| `client/src/pages/HostPage.jsx` | Extend play button to `audio` in `HostClue` + `HostFinalClue` |

---

### Task 1: Update import tests to expect CDN URL resolution

**Files:**
- Modify: `client/src/utils/boardImportUtils.test.js:100-134`

- [ ] **Step 1: Update the IMAGE test**

Replace lines 100–110 with:

```js
it('maps IMAGE clue to image type with mediaUrl resolved from hash', () => {
  const row =
    '1,1,Cat1,,1,,abc123hash,The answer,FALSE,IMAGE,Name the movie,,,TEXT,,,none,FALSE,FALSE';
  const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
  const clue = board.round1.categories[0].clues[0];
  expect(clue.type).toBe('image');
  expect(clue.question).toBe('Name the movie');
  expect(clue.mediaUrl).toBe('https://buzzinga.s3.us-east-2.amazonaws.com/abc123hash');
  expect(clue.mediaHash).toBe('');
  expect(warnings).toBe(0);
});
```

- [ ] **Step 2: Update the AUDIO test**

Replace lines 124–134 with:

```js
it('maps AUDIO clue to audio type with mediaUrl resolved from hash', () => {
  const row =
    '1,1,Cat1,,1,,def456hash,Song name,FALSE,AUDIO,Name the song,,,TEXT,,,none,FALSE,FALSE';
  const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
  const clue = board.round1.categories[0].clues[0];
  expect(clue.type).toBe('audio');
  expect(clue.question).toBe('Name the song');
  expect(clue.mediaUrl).toBe('https://buzzinga.s3.us-east-2.amazonaws.com/def456hash');
  expect(clue.mediaHash).toBe('');
  expect(warnings).toBe(0);
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```
cd client && npm test -- --reporter=verbose src/utils/boardImportUtils.test.js
```

Expected: the two updated tests FAIL with mismatched `mediaUrl` / `mediaHash` / `warnings` values. All other tests pass.

---

### Task 2: Update boardImportUtils.js to resolve hashes at import

**Files:**
- Modify: `client/src/utils/boardImportUtils.js`

- [ ] **Step 1: Update `mapClueRow` to build a CDN URL for image/audio**

Replace the `else` branch (currently lines 31–35):

```js
  } else {
    // image or audio — clueText is a Buzzinga content hash; resolve to CDN URL
    clue.question = (row.topCaption || '').trim();
    const hash = (row.clueText || '').trim();
    clue.mediaUrl = hash ? `https://buzzinga.s3.us-east-2.amazonaws.com/${hash}` : '';
  }
```

- [ ] **Step 2: Update the final-jeopardy block and remove `warnings`**

Replace the entire `parseBuzzingaCsv` function body up to (but not including) the `buildRound` helper with:

```js
export function parseBuzzingaCsv(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  const rounds = { 1: {}, 2: {} };
  let finalJeopardy = null;

  for (const row of data) {
    const roundVal = String(row.round || '').trim().toLowerCase();
    if (!roundVal) continue;

    if (roundVal === 'final') {
      const buzzingaType = (row.clueType || 'TEXT').trim().toUpperCase();
      const ourType = CLUE_TYPE_MAP[buzzingaType] || 'regular';
      const clueText = (row.clueText || '').trim();
      finalJeopardy = {
        category: (row.cat || '').trim(),
        clue: ourType === 'regular' ? clueText : (row.topCaption || '').trim(),
        answer: (row.correctResponse || '').trim(),
        type: ourType,
        mediaUrl: ourType === 'video'
          ? clueText
          : (ourType === 'image' || ourType === 'audio') && clueText
            ? `https://buzzinga.s3.us-east-2.amazonaws.com/${clueText}`
            : '',
        mediaHash: '',
        answerImage: '',
      };
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

    rounds[roundNum][col].clues[rowNum] = mapClueRow(row);
  }
```

- [ ] **Step 3: Update the return value to always yield `warnings: 0`**

Replace the final `return` statement:

```js
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
    warnings: 0,
  };
```

- [ ] **Step 4: Run the tests to confirm they pass**

```
cd client && npm test -- --reporter=verbose src/utils/boardImportUtils.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```
git add client/src/utils/boardImportUtils.js client/src/utils/boardImportUtils.test.js
git commit -m "feat: auto-resolve Buzzinga media hashes to CDN URLs at import"
```

---

### Task 3: Add audio to ClueMedia and update DisplayPage prop

**Files:**
- Modify: `client/src/components/ClueMedia.jsx`
- Modify: `client/src/pages/DisplayPage.jsx:183,276`

These two files must be updated together — renaming the prop in `ClueMedia` without updating `DisplayPage` would break video playback.

- [ ] **Step 1: Rewrite ClueMedia.jsx**

Replace the entire file with:

```jsx
function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function ClueMedia({ type, mediaUrl, compact = false, mediaReady = true }) {
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

    if (!mediaReady) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: compact ? 480 : 640,
          height: compact ? 270 : 360,
          background: '#111',
          borderRadius: 8,
          margin: '12px auto 0',
        }}>
          <span style={{ color: '#555', fontSize: 14 }}>▶ Video ready — host will start playback</span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <iframe
          width={compact ? 480 : 640}
          height={compact ? 270 : 360}
          src={`https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 8, border: 'none' }}
        />
      </div>
    );
  }

  if (type === 'audio') {
    if (!mediaReady) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 64,
          maxWidth: compact ? 480 : 640,
          background: '#111',
          borderRadius: 8,
          margin: '12px auto 0',
        }}>
          <span style={{ color: '#555', fontSize: 14 }}>♪ Audio ready — host will start playback</span>
        </div>
      );
    }

    return (
      <audio
        autoPlay
        controls
        src={mediaUrl}
        style={{ display: 'block', margin: '12px auto 0', maxWidth: '100%' }}
      />
    );
  }

  return null;
}
```

- [ ] **Step 2: Update DisplayPage.jsx — regular clue ClueMedia call**

Find line 183 (inside `ClueDisplay`):
```jsx
<ClueMedia type={currentClue.type} mediaUrl={currentClue.mediaUrl} videoReady={currentClue.type === 'video' ? videoPlaying : true} />
```

Replace with:
```jsx
<ClueMedia type={currentClue.type} mediaUrl={currentClue.mediaUrl} mediaReady={['video', 'audio'].includes(currentClue.type) ? videoPlaying : true} />
```

- [ ] **Step 3: Update DisplayPage.jsx — Final Jeopardy ClueMedia call**

Find line 276 (inside the Final Jeopardy render section):
```jsx
<ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} videoReady={game.fjType === 'video' ? game.videoPlaying : true} />
```

Replace with:
```jsx
<ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} mediaReady={['video', 'audio'].includes(game.fjType) ? game.videoPlaying : true} />
```

- [ ] **Step 4: Commit**

```
git add client/src/components/ClueMedia.jsx client/src/pages/DisplayPage.jsx
git commit -m "feat: add audio rendering to ClueMedia with host-controlled playback"
```

---

### Task 4: Add audio type to the clue editor modal

**Files:**
- Modify: `client/src/components/BoardEditorGrid.jsx`

- [ ] **Step 1: Add `audio` to the type button array in `ClueModal`**

Find the type buttons section (around line 104):
```jsx
{['regular', 'image', 'video'].map(t => (
  <button
    key={t}
    onClick={() => onUpdate('type', t)}
    ...
  >
    {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : '▶ Video'}
  </button>
))}
```

Replace with:
```jsx
{['regular', 'image', 'video', 'audio'].map(t => (
  <button
    key={t}
    onClick={() => onUpdate('type', t)}
    style={{
      flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
      background: type === t ? '#7c3aed' : 'var(--bg-surface)',
      color: type === t ? '#fff' : 'var(--color-muted)',
      border: `1px solid ${type === t ? '#7c3aed' : 'var(--border-subtle)'}`,
      borderRadius: 5,
    }}
  >
    {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : t === 'video' ? '▶ Video' : '🔊 Audio'}
  </button>
))}
```

- [ ] **Step 2: Extend the URL input to cover audio type**

Find (around line 122):
```jsx
{(type === 'image' || type === 'video') && (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>
      {type === 'image' ? 'IMAGE URL' : 'YOUTUBE URL'}
    </div>
    <input
      value={clue.mediaUrl || ''}
      onChange={e => onUpdate('mediaUrl', e.target.value)}
      placeholder={type === 'image' ? 'https://...' : 'https://youtube.com/watch?v=...'}
      style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 13, padding: '10px 12px', boxSizing: 'border-box' }}
    />
  </div>
)}
```

Replace with:
```jsx
{(type === 'image' || type === 'video' || type === 'audio') && (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>
      {type === 'image' ? 'IMAGE URL' : type === 'video' ? 'YOUTUBE URL' : 'AUDIO URL'}
    </div>
    <input
      value={clue.mediaUrl || ''}
      onChange={e => onUpdate('mediaUrl', e.target.value)}
      placeholder={type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...'}
      style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 13, padding: '10px 12px', boxSizing: 'border-box' }}
    />
  </div>
)}
```

- [ ] **Step 3: Add audio icon to the grid cell preview**

Find (around line 60):
```jsx
{type === 'image' ? '📷 ' : type === 'video' ? '▶ ' : ''}{clue.question}
```

Replace with:
```jsx
{type === 'image' ? '📷 ' : type === 'video' ? '▶ ' : type === 'audio' ? '🔊 ' : ''}{clue.question}
```

- [ ] **Step 4: Commit**

```
git add client/src/components/BoardEditorGrid.jsx
git commit -m "feat: add audio type option to clue editor modal"
```

---

### Task 5: Add audio type to Final Jeopardy tab and remove warnings banner

**Files:**
- Modify: `client/src/pages/EditorPage.jsx`

- [ ] **Step 1: Add `audio` to type buttons in `FinalJeopardyTab`**

Find (around line 300):
```jsx
{['regular', 'image', 'video'].map(t => (
  <button
    key={t}
    onClick={() => onChange({ ...fj, type: t, mediaUrl: '' })}
    style={{
      flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
      background: type === t ? '#7c3aed' : 'var(--bg-panel)',
      color: type === t ? '#fff' : 'var(--color-muted)',
      border: `1px solid ${type === t ? '#7c3aed' : 'var(--border-subtle)'}`,
      borderRadius: 5,
    }}
  >
    {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : '▶ Video'}
  </button>
))}
```

Replace with:
```jsx
{['regular', 'image', 'video', 'audio'].map(t => (
  <button
    key={t}
    onClick={() => onChange({ ...fj, type: t, mediaUrl: '' })}
    style={{
      flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
      background: type === t ? '#7c3aed' : 'var(--bg-panel)',
      color: type === t ? '#fff' : 'var(--color-muted)',
      border: `1px solid ${type === t ? '#7c3aed' : 'var(--border-subtle)'}`,
      borderRadius: 5,
    }}
  >
    {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : t === 'video' ? '▶ Video' : '🔊 Audio'}
  </button>
))}
```

- [ ] **Step 2: Extend the URL input section in `FinalJeopardyTab` to cover audio**

Find (around line 318):
```jsx
{type !== 'regular' && (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>
      {type === 'image' ? 'IMAGE URL' : 'YOUTUBE URL'}
    </div>
    <input
      value={fj.mediaUrl || ''}
      onChange={e => onChange({ ...fj, mediaUrl: e.target.value })}
      placeholder={type === 'image' ? 'https://...' : 'https://youtube.com/watch?v=...'}
      style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
    />
  </div>
)}
```

Replace with:
```jsx
{type !== 'regular' && (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>
      {type === 'image' ? 'IMAGE URL' : type === 'video' ? 'YOUTUBE URL' : 'AUDIO URL'}
    </div>
    <input
      value={fj.mediaUrl || ''}
      onChange={e => onChange({ ...fj, mediaUrl: e.target.value })}
      placeholder={type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...'}
      style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
    />
  </div>
)}
```

- [ ] **Step 3: Remove the import warnings banner**

Find and delete the entire block (around lines 198–216):
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

- [ ] **Step 4: Commit**

```
git add client/src/pages/EditorPage.jsx
git commit -m "feat: add audio type to Final Jeopardy editor; remove stale hash warning"
```

---

### Task 6: Extend host play button to cover audio clues

**Files:**
- Modify: `client/src/pages/HostPage.jsx`

- [ ] **Step 1: Update the play button in `HostClue`**

Find (around line 212):
```jsx
{clueData?.type === 'video' && (
  <button
    onClick={onPlayVideo}
    disabled={game.videoPlayed}
    style={{ flex: '1 1 100%', padding: 12, background: game.videoPlayed ? 'var(--bg-surface)' : '#7c3aed', color: game.videoPlayed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: game.videoPlayed ? 'not-allowed' : 'pointer' }}>
    {game.videoPlayed ? '✓ Video Playing on Display' : '▶ Play Video on Display'}
  </button>
)}
```

Replace with:
```jsx
{['video', 'audio'].includes(clueData?.type) && (
  <button
    onClick={onPlayVideo}
    disabled={game.videoPlayed}
    style={{ flex: '1 1 100%', padding: 12, background: game.videoPlayed ? 'var(--bg-surface)' : '#7c3aed', color: game.videoPlayed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: game.videoPlayed ? 'not-allowed' : 'pointer' }}>
    {clueData.type === 'audio'
      ? game.videoPlayed ? '✓ Audio Playing on Display' : '🔊 Play Audio on Display'
      : game.videoPlayed ? '✓ Video Playing on Display' : '▶ Play Video on Display'}
  </button>
)}
```

- [ ] **Step 2: Update the play button in `HostFinalClue`**

Find (around line 334):
```jsx
{game.fjType === 'video' && (
  <button
    onClick={onPlayVideo}
    disabled={game.videoPlayed}
    style={{ width: '100%', padding: 12, background: game.videoPlayed ? 'var(--bg-surface)' : '#7c3aed', color: game.videoPlayed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: game.videoPlayed ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
    {game.videoPlayed ? '✓ Video Playing on Display' : '▶ Play Video on Display'}
  </button>
)}
```

Replace with:
```jsx
{['video', 'audio'].includes(game.fjType) && (
  <button
    onClick={onPlayVideo}
    disabled={game.videoPlayed}
    style={{ width: '100%', padding: 12, background: game.videoPlayed ? 'var(--bg-surface)' : '#7c3aed', color: game.videoPlayed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: game.videoPlayed ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
    {game.fjType === 'audio'
      ? game.videoPlayed ? '✓ Audio Playing on Display' : '🔊 Play Audio on Display'
      : game.videoPlayed ? '✓ Video Playing on Display' : '▶ Play Video on Display'}
  </button>
)}
```

- [ ] **Step 3: Commit**

```
git add client/src/pages/HostPage.jsx
git commit -m "feat: show Play Audio button on host panel for audio clues"
```

---

## Self-Review

**Spec coverage:**
- ✅ Hash → CDN URL in `parseBuzzingaCsv` (Tasks 1–2)
- ✅ Warning message removed (Task 5, Step 3)
- ✅ Audio rendering in `ClueMedia` with placeholder (Task 3)
- ✅ `videoReady` → `mediaReady` rename (Task 3)
- ✅ Audio type button + URL input in `ClueModal` (Task 4)
- ✅ Audio type button + URL input in `FinalJeopardyTab` (Task 5)
- ✅ Host play button for audio in `HostClue` + `HostFinalClue` (Task 6)
- ✅ `DisplayPage` `mediaReady` condition extended to audio (Task 3, Steps 2–3)

**Placeholder scan:** None found.

**Type consistency:**
- `mediaReady` prop used in ClueMedia definition (Task 3 Step 1) and all call sites (Task 3 Steps 2–3). ✅
- `['video', 'audio'].includes(...)` pattern used consistently in DisplayPage and HostPage. ✅
- CDN URL constant `https://buzzinga.s3.us-east-2.amazonaws.com/` used identically in `mapClueRow` and FJ block. ✅
