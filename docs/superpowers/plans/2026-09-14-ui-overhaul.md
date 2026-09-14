# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a "Cinematic Dark" design token system across the display, host, and editor views, and replace the board editor's inline cell expansion with a modal overlay.

**Architecture:** A single `theme.css` file defines CSS custom properties consumed by all components via inline `var(--token)` references. No new dependencies. The display page's clue/judging state becomes full-screen via `position: fixed`. The board editor replaces its inline active-cell editor with a modal that overlays the grid.

**Tech Stack:** React 19, Vite 8, inline styles with CSS custom properties, socket.io-client

---

## File Map

| File | Action |
|------|--------|
| `client/src/theme.css` | **Create** — CSS custom property definitions |
| `client/src/main.jsx` | **Modify** — import theme.css |
| `client/src/components/GameBoard.jsx` | **Modify** — cinematic dark cells, vanishing revealed state |
| `client/src/components/ScoreBar.jsx` | **Modify** — design tokens |
| `client/src/components/BuzzerButton.jsx` | **Modify** — design tokens |
| `client/src/components/NavBreadcrumb.jsx` | **Modify** — design tokens |
| `client/src/pages/DisplayPage.jsx` | **Modify** — full-screen clue, dramatic buzz-in, token pass on all states |
| `client/src/pages/HostPage.jsx` | **Modify** — answer panel, weighted judge buttons, token pass |
| `client/src/components/BoardEditorGrid.jsx` | **Modify** — modal editing, larger cells, token pass |
| `client/src/pages/EditorPage.jsx` | **Modify** — token pass |
| `client/src/pages/PlayerPage.jsx` | **Modify** — token pass (no visual change) |
| `client/src/pages/HomePage.jsx` | **Modify** — token pass |

---

## Task 1: Create theme.css and import it

**Files:**
- Create: `client/src/theme.css`
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Create the token file**

Create `client/src/theme.css` with this exact content:

```css
:root {
  --bg-deep: #050a14;
  --bg-panel: #0d1b35;
  --bg-surface: #0a1628;
  --border-subtle: #1e3a6e;
  --border-accent: #fbbf24;
  --color-amber: #fbbf24;
  --color-white: #e2e8f0;
  --color-muted: #6b7280;
  --color-label: #c0cfe8;
  --color-green: #4ade80;
  --color-red: #f87171;
}

* {
  box-sizing: border-box;
}

body {
  background: var(--bg-deep);
  color: var(--color-white);
  margin: 0;
}
```

- [ ] **Step 2: Import theme.css in main.jsx**

Edit `client/src/main.jsx` — add the import before the App import:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './theme.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

- [ ] **Step 3: Verify**

Run `cd client && npm run dev` (requires the backend server running — use `start-dev.ps1` from the repo root).
Navigate to `http://localhost:5173`. The page background should now be `#050a14` (near-black). No console errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/theme.css client/src/main.jsx
git commit -m "feat: add CSS design token system (theme.css)"
```

---

## Task 2: Update GameBoard — cinematic dark cells, vanishing revealed state

**Files:**
- Modify: `client/src/components/GameBoard.jsx`

The `GameBoard` component is used by both `DisplayPage` (the TV screen) and `HostPage`. This task upgrades its visual treatment for both.

- [ ] **Step 1: Replace GameBoard.jsx with the updated version**

```jsx
// Props: categoryNames (string[6]), revealedClues ({categoryIndex,clueIndex}[]),
//        onSelect (optional fn(ci,qi)), activeClue ({categoryIndex,clueIndex}|null), round (1|2)
export default function GameBoard({ categoryNames = [], revealedClues = [], onSelect, activeClue, round = 1 }) {
  const values = [1, 2, 3, 4, 5].map(i => i * (round === 1 ? 200 : 400));

  function isRevealed(ci, qi) {
    return revealedClues.some(r => r.round === round && r.categoryIndex === ci && r.clueIndex === qi);
  }

  function isActive(ci, qi) {
    return activeClue && activeClue.categoryIndex === ci && activeClue.clueIndex === qi;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
      {categoryNames.map((name, ci) => (
        <div key={ci} style={{
          background: 'var(--bg-panel)',
          borderTop: '2px solid var(--border-accent)',
          padding: '10px 4px',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: 12,
          lineHeight: 1.3,
          letterSpacing: '1.5px',
          color: 'var(--color-label)',
        }}>
          {name}
        </div>
      ))}
      {values.map((value, qi) =>
        categoryNames.map((_, ci) => {
          const revealed = isRevealed(ci, qi);
          const active = isActive(ci, qi);
          return (
            <div
              key={`${ci}-${qi}`}
              onClick={() => !revealed && onSelect && onSelect(ci, qi)}
              style={{
                background: revealed ? 'var(--bg-deep)' : active ? '#7c3aed' : 'var(--bg-panel)',
                border: revealed ? 'none' : active ? '1px solid #7c3aed' : '1px solid var(--border-subtle)',
                padding: '10px 2px',
                textAlign: 'center',
                color: revealed ? 'transparent' : 'var(--color-amber)',
                fontWeight: 'bold',
                fontSize: 13,
                borderRadius: 4,
                cursor: !revealed && onSelect ? 'pointer' : 'default',
                userSelect: 'none',
                transition: 'all 0.1s',
              }}
            >
              {revealed ? '' : `$${value}`}
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Start the dev server. Navigate to a game in progress (or create one) and reach the board phase. Confirm:
- Category headers have a gold/amber top border and blue-grey text
- Clue cells are dark with a subtle border and amber dollar values
- Revealed clues are completely empty (no checkmark, no color)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/GameBoard.jsx
git commit -m "feat: cinematic dark board — amber category borders, vanishing revealed cells"
```

---

## Task 3: Update ScoreBar — design tokens

**Files:**
- Modify: `client/src/components/ScoreBar.jsx`

- [ ] **Step 1: Replace ScoreBar.jsx with the updated version**

```jsx
// Props: players ({name, score}[]), currentPicker (string|null)
export default function ScoreBar({ players = [], currentPicker }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      {players.map(p => {
        const isPicker = p.name === currentPicker;
        return (
          <div key={p.name} style={{
            background: isPicker ? 'var(--color-amber)' : 'var(--bg-panel)',
            borderRadius: 6,
            padding: '6px 14px',
            textAlign: 'center',
            minWidth: 80,
            position: 'relative',
            border: isPicker ? '2px solid var(--border-accent)' : '1px solid var(--border-subtle)',
          }}>
            {isPicker && (
              <div style={{
                position: 'absolute',
                top: -10,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--color-amber)',
                color: '#0a0a0a',
                fontSize: 9,
                fontWeight: 'bold',
                padding: '1px 5px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
              }}>
                PICKING
              </div>
            )}
            <div style={{ fontSize: 12, color: isPicker ? '#0a0a0a' : 'var(--color-muted)' }}>{p.name}</div>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: isPicker ? '#0a0a0a' : p.score < 0 ? 'var(--color-red)' : 'var(--color-green)' }}>
              {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Check the board phase on the display and host pages. The score bar cards should use the dark panel style with subtle borders. The current picker card should have an amber border and amber background.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ScoreBar.jsx
git commit -m "feat: apply design tokens to ScoreBar"
```

---

## Task 4: Update BuzzerButton and NavBreadcrumb — design tokens

**Files:**
- Modify: `client/src/components/BuzzerButton.jsx`
- Modify: `client/src/components/NavBreadcrumb.jsx`

- [ ] **Step 1: Replace BuzzerButton.jsx**

```jsx
// Props: locked (bool), onBuzz (fn), buzzedBy (string|null), myName (string)
export default function BuzzerButton({ locked, onBuzz, buzzedBy, myName }) {
  const isMine = buzzedBy === myName;
  const isOther = buzzedBy && !isMine;

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        onClick={!locked && !buzzedBy ? onBuzz : undefined}
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: locked || buzzedBy ? 'not-allowed' : 'pointer',
          background: isMine ? '#14532d' : locked || isOther ? 'var(--bg-panel)' : '#1d4ed8',
          border: `4px solid ${isMine ? 'var(--color-green)' : locked || isOther ? 'var(--border-subtle)' : '#3b82f6'}`,
          opacity: locked || isOther ? 0.4 : 1,
          fontSize: 14,
          fontWeight: 'bold',
          color: isMine ? 'var(--color-green)' : locked || isOther ? 'var(--color-muted)' : '#fff',
          userSelect: 'none',
          transition: 'all 0.1s',
        }}
      >
        {isMine ? 'YOU!' : 'BUZZ'}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-muted)' }}>
        {isMine ? 'Answer out loud!' : isOther ? `${buzzedBy} is answering...` : locked ? '🔒 Locked' : 'Buzzers open!'}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace NavBreadcrumb.jsx**

```jsx
import { useNavigate } from 'react-router-dom';

export default function NavBreadcrumb() {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => navigate('/')}
        style={{
          background: 'var(--bg-panel)',
          color: 'var(--color-muted)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        ← Home
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Navigate to the player page. The buzzer button should show the dark panel style when locked. NavBreadcrumb should appear with a subtle border button.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BuzzerButton.jsx client/src/components/NavBreadcrumb.jsx
git commit -m "feat: apply design tokens to BuzzerButton and NavBreadcrumb"
```

---

## Task 5: Update DisplayPage — ClueDisplay (full-screen, dramatic buzz-in)

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx` (the `ClueDisplay` function only)

The `ClueDisplay` function currently renders a partial-height panel with a ScoreBar at the bottom. The new version is full-screen (`position: fixed`) with no score bar, and the judging state shows the player name dramatically.

- [ ] **Step 1: Replace the ClueDisplay function**

Find the `ClueDisplay` function in `DisplayPage.jsx` and replace it entirely:

```jsx
function ClueDisplay({ game }) {
  const { currentClue, phase, buzzedBy, buzzerState, answerRevealed, revealedAnswer, revealedAnswerImage } = game;
  const categoryName = game.board?.categoryNames?.[currentClue?.categoryIndex] ?? '';
  const isBuzzedIn = phase === 'judging' && buzzedBy;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 48,
      border: isBuzzedIn ? '3px solid var(--border-accent)' : '3px solid transparent',
    }}>
      {isBuzzedIn ? (
        <>
          <div style={{ fontSize: 11, color: 'var(--color-label)', letterSpacing: 3, marginBottom: 20 }}>
            {categoryName} · ${currentClue?.value}
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, color: 'var(--color-amber)', letterSpacing: 4, lineHeight: 1 }}>
            {buzzedBy.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: '#92400e', letterSpacing: 3, marginTop: 10 }}>BUZZED IN</div>
          {currentClue && (
            <div style={{ marginTop: 28, fontSize: 15, color: 'var(--color-muted)', fontStyle: 'italic', maxWidth: 640 }}>
              {currentClue.question}
            </div>
          )}
        </>
      ) : (
        <>
          {currentClue && (
            <>
              <div style={{
                fontSize: 11,
                color: 'var(--color-label)',
                letterSpacing: 3,
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 12,
                marginBottom: 24,
                width: '100%',
                maxWidth: 720,
              }}>
                {categoryName}
              </div>
              <div style={{ fontSize: 32, fontWeight: 'bold', lineHeight: 1.5, maxWidth: 720, marginBottom: 20, color: 'var(--color-white)' }}>
                {currentClue.question}
              </div>
              <ClueMedia type={currentClue.type} mediaUrl={currentClue.mediaUrl} />
              {answerRevealed && (
                <div style={{ marginTop: 24, padding: '16px 24px', background: 'var(--bg-surface)', borderRadius: 10, display: 'inline-block' }}>
                  <div style={{ fontSize: 22, color: 'var(--color-green)', fontWeight: 'bold', marginBottom: revealedAnswerImage ? 12 : 0 }}>
                    {revealedAnswer}
                  </div>
                  {revealedAnswerImage && (
                    <img src={revealedAnswerImage} alt="answer" style={{ maxWidth: 480, maxHeight: 320, borderRadius: 8, display: 'block', margin: '0 auto' }} />
                  )}
                </div>
              )}
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '4px 16px', marginTop: 20 }}>
                <span style={{ fontSize: 11, color: 'var(--color-label)', letterSpacing: 1 }}>${currentClue.value}</span>
              </div>
            </>
          )}
          {phase === 'clue' && (
            <div style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: '6px 16px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-red)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-red)', fontWeight: 'bold', letterSpacing: 1 }}>BUZZERS LOCKED</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run a game to the clue phase. Confirm:
- Clue display takes over the full screen (no score bar)
- Category name appears at top with bottom border
- Dollar value pill badge below the clue text
- BUZZERS LOCKED shown as red dot indicator
- When someone buzzes in: player name appears very large in amber, screen gets amber outline, clue text dims to grey italic

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/DisplayPage.jsx
git commit -m "feat: full-screen clue display, dramatic buzz-in takeover on display page"
```

---

## Task 6: Update DisplayPage — all other states (tokens and polish)

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx` (all functions except `ClueDisplay`)

Replace all hex color values in the remaining DisplayPage functions with CSS token variables. Key changes per function:

- [ ] **Step 1: Update the outer wrapper and LobbyDisplay**

In the main `DisplayPage` return, change the outer div:
```jsx
// Before:
<div style={{ padding: 16 }}>
// After:
<div style={{ padding: 16, minHeight: '100vh', background: 'var(--bg-deep)' }}>
```

Replace `LobbyDisplay`:
```jsx
function LobbyDisplay({ game, gameCode }) {
  const joinUrl = `${window.location.origin}/play/${gameCode}`;
  const displayUrl = `${window.location.host}/play/${gameCode}`;

  return (
    <div style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 48, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 6, marginBottom: 8 }}>JEOPARDY!</div>
      <div style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 32 }}>Join at this device's address</div>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-panel)', border: '3px solid var(--border-accent)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, display: 'inline-block' }}>
            <QRCode value={joinUrl} size={160} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: 2, marginTop: 12 }}>SCAN TO JOIN</div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{displayUrl}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ background: 'var(--bg-panel)', border: '3px solid var(--border-accent)', borderRadius: 16, padding: '24px 48px' }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: 3, marginBottom: 8 }}>GAME CODE</div>
            <div style={{ fontSize: 56, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 12 }}>{gameCode}</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>PLAYERS JOINED</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(game.players || []).map(p => (
              <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 20px', fontSize: 16, fontWeight: 'bold', color: 'var(--color-white)' }}>{p.name}</div>
            ))}
            {(!game.players || game.players.length === 0) && <div style={{ color: 'var(--color-muted)' }}>Waiting for players...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update FinishedDisplay**

```jsx
function FinishedDisplay({ players }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 36, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 32 }}>GAME OVER</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ background: i === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)', border: i === 0 ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 32px', margin: '8px auto', maxWidth: 300, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: 'var(--color-white)' }}>{i === 0 ? '🏆 ' : ''}{p.name}</span>
          <span style={{ fontSize: 18, fontWeight: 'bold', color: p.score >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update DisplayBetweenRounds**

```jsx
function DisplayBetweenRounds({ game }) {
  const sorted = [...(game.players || [])].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 56, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 4, marginBottom: 40 }}>DOUBLE JEOPARDY</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ fontSize: 24, display: 'flex', justifyContent: 'center', gap: 40, padding: '10px 0' }}>
          <span style={{ color: i === 0 ? 'var(--color-amber)' : 'var(--color-white)' }}>{i === 0 ? '👑 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update DisplayFinalWager**

```jsx
function DisplayFinalWager({ game }) {
  const submitted = game.wagersSubmitted || [];
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 16, letterSpacing: 4 }}>FINAL JEOPARDY</div>
      <div style={{ width: 48, height: 1, background: 'var(--border-subtle)', margin: '0 auto 16px' }} />
      <div style={{ fontSize: 28, color: 'var(--color-white)', marginBottom: 8 }}>{game.fjCategory}</div>
      <div style={{ fontSize: 18, color: 'var(--color-muted)', marginBottom: 32 }}>Place your wagers!</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-green)' : 'var(--color-muted)', fontSize: 18 }}>
              {submitted.includes(p.name) ? '✓' : '⏳'}
            </span>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-white)' : 'var(--color-muted)', fontSize: 16 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update DisplayFinalClue**

```jsx
function DisplayFinalClue({ game }) {
  const submitted = game.answersSubmitted || [];
  return (
    <div style={{ padding: 60, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ fontSize: 22, color: 'var(--color-label)', marginBottom: 16, textAlign: 'center', letterSpacing: 2 }}>{game.fjCategory}</div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 32, marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 24, lineHeight: 1.6, color: 'var(--color-white)' }}>{game.fjClue}</div>
        <ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} />
      </div>
      <div style={{ textAlign: 'center', color: 'var(--color-muted)', marginBottom: 20, fontSize: 16 }}>Write your answers!</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-green)' : 'var(--color-muted)', fontSize: 18 }}>
              {submitted.includes(p.name) ? '✓' : '⏳'}
            </span>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-white)' : 'var(--color-muted)', fontSize: 16 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update DisplayFinalJudging and DisplayFinalReveal / RevealCard**

```jsx
function DisplayFinalJudging() {
  return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 32, color: 'var(--color-muted)' }}>Judging in progress...</div>
    </div>
  );
}

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

- [ ] **Step 7: Verify**

Walk through the display page states: lobby, board, clue, buzz-in, between-rounds, final jeopardy wager, final clue, reveal. All should use consistent dark palette with amber/green/red accents.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/DisplayPage.jsx
git commit -m "feat: apply Cinematic Dark tokens to all display page states"
```

---

## Task 7: Update HostPage — tokens, answer panel, weighted judge buttons

**Files:**
- Modify: `client/src/pages/HostPage.jsx`

Replace all hex values with CSS token variables throughout. The key visual upgrades are in `HostClue` (answer panel + judge buttons) and `HostLobby` (game code display).

- [ ] **Step 1: Update HostLobby**

```jsx
function HostLobby({ game, gameCode, boardName }) {
  return (
    <div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: 3, marginBottom: 6 }}>GAME CODE</div>
        <div style={{ fontSize: 40, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 8 }}>{gameCode}</div>
        <div style={{ fontSize: 12, color: 'var(--color-label)', marginTop: 6 }}>Board: {boardName}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-white)' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: 'var(--color-green)' }}>● connected</span>
          </div>
        ))}
      </div>
      <button
        disabled={(game.players || []).length < 2}
        onClick={() => socket.emit('host:startGame', { gameCode })}
        style={{ width: '100%', padding: 16, background: (game.players || []).length >= 2 ? '#16a34a' : 'var(--bg-panel)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: (game.players || []).length >= 2 ? 'pointer' : 'not-allowed' }}
      >
        ▶ Start Game {(game.players || []).length < 2 ? '(need 2+ players)' : ''}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update HostBoard**

```jsx
function HostBoard({ game, gameCode, board }) {
  const currentRound = game.currentRound || 1;
  const categoryNames = board[`round${currentRound}`].categories.map(c => c.name);
  return (
    <div>
      <div style={{ background: 'var(--color-amber)', color: '#0a0a0a', borderRadius: 8, padding: '8px 14px', textAlign: 'center', fontWeight: 'bold', marginBottom: 12 }}>
        🎯 {game.currentPicker} is selecting the next clue
      </div>
      <GameBoard categoryNames={categoryNames} revealedClues={game.revealedClues || []} onSelect={(ci, qi) => socket.emit('host:selectClue', { categoryIndex: ci, clueIndex: qi })} round={game.currentRound || 1} />
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
        <ScoreBar players={game.players || []} currentPicker={game.currentPicker} />
        <button onClick={() => { if (window.confirm('End game?')) socket.emit('host:endGame'); }}
          style={{ marginLeft: 'auto', padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}>
          End Game
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update HostClue — the key visual upgrade**

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
        <div style={{ background: 'var(--color-amber)', borderRadius: 8, padding: '10px 14px', textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 'bold', fontSize: 16, color: '#0a0a0a' }}>{buzzedBy}</div>
          <div style={{ fontSize: 11, color: '#78350f', letterSpacing: 1 }}>IS ANSWERING</div>
        </div>
      )}
      {clueData && (
        <>
          <div style={{ fontSize: 11, color: 'var(--color-label)', letterSpacing: 2, marginBottom: 6 }}>
            {currentCategories[currentClue.categoryIndex].name} · ${clueValue}
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: 1, marginBottom: 4 }}>CLUE</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--color-white)' }}>{clueData.question}</div>
            <ClueMedia type={clueData.type} mediaUrl={clueData.mediaUrl} compact />
          </div>
          <div style={{ background: '#0a1f0f', border: '1px solid #16a34a', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--color-green)', letterSpacing: 1, marginBottom: 4 }}>ANSWER</div>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: 'var(--color-green)' }}>{clueData.answer}</div>
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
              style={{ flex: 1, padding: 14, background: 'var(--bg-panel)', border: '2px solid var(--color-green)', color: 'var(--color-green)', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              🔓 Unlock Buzzers
            </button>
          )}
          <button onClick={() => socket.emit('host:skipClue')}
            style={{ padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--color-muted)', borderRadius: 8, cursor: 'pointer' }}>
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
              style={{ width: '100%', padding: '10px 0', background: answerRevealed ? 'var(--bg-surface)' : '#7c3aed', color: answerRevealed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: answerRevealed ? 'not-allowed' : 'pointer', marginBottom: 4 }}>
              {answerRevealed ? '✓ Answer Revealed' : '🖼 Reveal Answer on Display'}
            </button>
          )}
          <button onClick={() => socket.emit('host:judge', { result: 'correct' })}
            style={{ flex: 1, padding: 16, background: '#14532d', border: '2px solid #16a34a', color: 'var(--color-green)', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}>
            ✓ Correct<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>+${clueValue}</span>
          </button>
          <button onClick={() => socket.emit('host:judge', { result: 'incorrect' })}
            style={{ flex: 1, padding: 16, background: '#450a0a', border: '2px solid #b91c1c', color: 'var(--color-red)', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}>
            ✗ Incorrect<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>-${clueValue}</span>
          </button>
        </div>
      )}
      <ScoreBar players={players || []} />
    </div>
  );
}
```

- [ ] **Step 4: Update remaining HostPage functions**

Apply token variables to `HostFinished`, `HostBetweenRounds`, `HostFinalWager`, `HostFinalClue`, `HostFinalJudging`, `HostFinalReveal`. Replace all hex values:
- `#1e293b` → `var(--bg-panel)`
- `#0f172a` → `var(--bg-surface)`
- `#334155` → `var(--border-subtle)`
- `#fbbf24` → `var(--color-amber)`
- `#4ade80` → `var(--color-green)`
- `#f87171` → `var(--color-red)`
- `#94a3b8` → `var(--color-muted)`
- `#e2e8f0` → `var(--color-white)`
- `#a5b4fc` → `var(--color-label)`
- `#64748b` → `var(--color-muted)`
- `#1d4ed8` → keep as-is (blue action button)
- `#16a34a` → keep as-is (green action button background)
- `#dc2626` → keep as-is (destructive action)

- [ ] **Step 5: Verify**

Run a full game as host. Check each phase. Key assertions:
- Lobby: game code in amber, players in dark panel cards
- Clue state: clue in dark inset panel, answer in green-tinted panel
- Judging: Correct button is dark-green with green border, Incorrect is dark-red with red border
- Unlock Buzzers button has green border, Skip is visually recessive

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/HostPage.jsx
git commit -m "feat: apply Cinematic Dark tokens to host page, styled answer panel and judge buttons"
```

---

## Task 8: Update BoardEditorGrid — modal editing

**Files:**
- Modify: `client/src/components/BoardEditorGrid.jsx`

Replace inline cell expansion with a modal overlay. The grid stays always visible; clicking a cell sets `activeCell` and renders a centered modal with a dark backdrop.

- [ ] **Step 1: Replace BoardEditorGrid.jsx entirely**

```jsx
import { useState } from 'react';

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

  const activeClue = activeCell
    ? (categories[activeCell.ci]?.clues[activeCell.qi] || { question: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '' })
    : null;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {categories.map((cat, ci) => (
          <div key={ci}>
            <input
              value={cat.name}
              onChange={e => updateCategory(ci, e.target.value)}
              style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 4px', fontSize: 11, fontWeight: 'bold', color: 'var(--color-white)', textAlign: 'center', boxSizing: 'border-box', marginBottom: 4 }}
            />
            {values.map((value, qi) => {
              const clue = cat.clues[qi] || { question: '', answer: '' };
              const type = clue.type || 'regular';
              const complete = !!(clue.question && clue.answer && (type === 'regular' || clue.mediaUrl));
              const isActive = activeCell?.ci === ci && activeCell?.qi === qi;
              return (
                <div
                  key={qi}
                  onClick={() => setActiveCell({ ci, qi })}
                  style={{
                    marginBottom: 4,
                    background: 'var(--bg-surface)',
                    border: isActive ? '2px solid var(--border-accent)' : complete ? '1px solid var(--border-subtle)' : '1px dashed var(--border-subtle)',
                    borderRadius: 5,
                    padding: '8px 6px',
                    cursor: 'pointer',
                    opacity: complete ? 1 : 0.6,
                    boxShadow: isActive ? '0 0 8px rgba(251,191,36,0.3)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--color-amber)', fontWeight: 'bold' }}>
                    ${value}{complete ? ' ✓' : ''}
                  </div>
                  {complete ? (
                    <div style={{ fontSize: 9, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {type === 'image' ? '📷 ' : type === 'video' ? '▶ ' : ''}{clue.question}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: '#374151', fontStyle: 'italic', marginTop: 2 }}>Click to add...</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {activeCell && activeClue && (
        <ClueModal
          ci={activeCell.ci}
          qi={activeCell.qi}
          value={values[activeCell.qi]}
          categoryName={categories[activeCell.ci]?.name || ''}
          clue={activeClue}
          onUpdate={(field, value) => updateClue(activeCell.ci, activeCell.qi, field, value)}
          onClose={() => setActiveCell(null)}
        />
      )}
    </>
  );
}

function ClueModal({ ci, qi, value, categoryName, clue, onUpdate, onClose }) {
  const type = clue.type || 'regular';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--color-amber)', fontWeight: 'bold', letterSpacing: 1 }}>
            {categoryName} · ${value}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>CLUE TYPE</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['regular', 'image', 'video'].map(t => (
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
              {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : '▶ Video'}
            </button>
          ))}
        </div>

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

        <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>CLUE</div>
        <textarea
          value={clue.question}
          onChange={e => onUpdate('question', e.target.value)}
          rows={4}
          placeholder="Write the clue here..."
          style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 14, padding: '10px 12px', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
        />

        <div style={{ fontSize: 10, color: 'var(--color-green)', letterSpacing: 1, marginBottom: 6 }}>ANSWER</div>
        <input
          value={clue.answer}
          onChange={e => onUpdate('answer', e.target.value)}
          placeholder="What is...?"
          style={{ width: '100%', background: '#0a1f0f', border: '1px solid #16a34a', borderRadius: 6, color: 'var(--color-green)', fontSize: 14, padding: '10px 12px', boxSizing: 'border-box', marginBottom: 16 }}
        />

        <div style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: 1, marginBottom: 6 }}>
          ANSWER IMAGE <span style={{ color: '#374151' }}>(optional)</span>
        </div>
        <input
          value={clue.answerImage || ''}
          onChange={e => onUpdate('answerImage', e.target.value)}
          placeholder="https://..."
          style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-muted)', fontSize: 13, padding: '10px 12px', boxSizing: 'border-box', marginBottom: 20 }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: 12, background: '#14532d', border: '1px solid #16a34a', color: 'var(--color-green)', borderRadius: 6, fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
          >
            Save &amp; Close
          </button>
          <button
            onClick={onClose}
            style={{ padding: '12px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--color-muted)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: "Save & Close" and "Cancel" both close the modal. Changes are saved live as the user types (controlled inputs via `onUpdate`), so there's no separate save action — the modal is just a focused editing view.

- [ ] **Step 2: Verify**

Open the editor. Confirm:
- Grid cells are larger and readable at a glance
- Empty cells have dashed border, reduced opacity
- Complete cells show clue preview text with media icon prefix
- Clicking a cell opens the modal overlay over the dimmed grid
- Clicking outside the modal (on the backdrop) closes it
- Typing in the modal updates the cell preview in real time
- Active cell has amber glow border while modal is open

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BoardEditorGrid.jsx
git commit -m "feat: replace inline cell editor with modal overlay in BoardEditorGrid"
```

---

## Task 9: Update EditorPage — tokens and larger grid container

**Files:**
- Modify: `client/src/pages/EditorPage.jsx`

- [ ] **Step 1: Apply token variables throughout EditorPage**

Replace hex values in `EditorPage` and `FinalJeopardyTab`:
- `#0f172a` (sidebar/panel bg) → `var(--bg-surface)` 
- `#1e293b` (card/input bg) → `var(--bg-panel)`
- `#334155` (borders) → `var(--border-subtle)`
- `#94a3b8`, `#64748b`, `#475569` (muted text) → `var(--color-muted)`
- `#e2e8f0` (primary text) → `var(--color-white)`
- `#fbbf24` (amber) → `var(--color-amber)`
- `#4ade80` (green) → `var(--color-green)`
- `#a5b4fc` (label) → `var(--color-label)`
- `#1d4ed8` (blue active tab) → keep as-is
- `#16a34a` (save button green) → keep as-is

- [ ] **Step 2: Update the main content area background**

In the tab content container div, change:
```jsx
// Before:
<div style={{ background: '#0f172a', borderRadius: '0 0 8px 8px', padding: 12 }}>
// After:
<div style={{ background: 'var(--bg-surface)', borderRadius: '0 0 8px 8px', padding: 16 }}>
```

- [ ] **Step 3: Verify**

Open the editor page. Confirm sidebar, header, tabs, and FinalJeopardyTab all use the consistent dark palette. The grid inside should now render the updated BoardEditorGrid with modal editing.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EditorPage.jsx
git commit -m "feat: apply design tokens to EditorPage"
```

---

## Task 10: Token pass on PlayerPage and HomePage

**Files:**
- Modify: `client/src/pages/PlayerPage.jsx`
- Modify: `client/src/pages/HomePage.jsx`

No visual changes — just replace hex values with token variables so future color changes only require editing `theme.css`.

- [ ] **Step 1: Update PlayerPage.jsx**

Replace hex values throughout (all phases — lobby, board, clue, judging, final-wager, final-clue, etc.):
- `#94a3b8` → `var(--color-muted)`
- `#64748b`, `#475569` → `var(--color-muted)`
- `#4ade80` → `var(--color-green)`
- `#f87171` → `var(--color-red)`
- `#fbbf24` → `var(--color-amber)`
- `#e2e8f0` → `var(--color-white)`
- `#1e293b` → `var(--bg-panel)`
- `#0f172a` → `var(--bg-surface)`
- `#334155` → `var(--border-subtle)`
- `#1d4ed8` → keep as-is (submit wager/answer button)
- `#60a5fa` → `var(--color-label)`
- `#a5b4fc` → `var(--color-label)`

- [ ] **Step 2: Update HomePage.jsx**

```jsx
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
        if (s && !name) setName(JSON.parse(s).name);
      } catch {}
    }
  }

  function joinGame(e) {
    e.preventDefault();
    if (gameCode && name) navigate(`/play/${gameCode}`, { state: { name } });
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1 style={{ color: 'var(--color-amber)', textAlign: 'center', marginBottom: 32 }}>JEOPARDY!</h1>
      <form onSubmit={joinGame} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={gameCode} onChange={handleGameCodeChange} placeholder="Game Code" maxLength={4}
          style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--color-white)', fontSize: 18, textAlign: 'center', letterSpacing: 4 }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your Name"
          style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--color-white)', fontSize: 16 }} />
        <button type="submit" style={{ padding: 12, borderRadius: 6, background: '#1d4ed8', color: '#fff', border: 'none', fontSize: 16, cursor: 'pointer' }}>
          Join Game
        </button>
      </form>
      <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => navigate('/editor')} style={{ padding: '8px 16px', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--color-muted)', borderRadius: 6, cursor: 'pointer' }}>
          Board Editor
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Check the home page and player page at each game phase. Colors should be visually unchanged from before (the tokens resolve to the same values players were already seeing).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PlayerPage.jsx client/src/pages/HomePage.jsx
git commit -m "feat: apply design tokens to PlayerPage and HomePage"
```

---

## Final Verification

- [ ] Run a complete game from lobby → board → clue → judging → between-rounds → final jeopardy → reveal
- [ ] Verify display page on a large screen (or zoom browser to simulate TV): board cells should be crisp, clue text readable at distance
- [ ] Verify host page: clue/answer panels are visually distinct, judge buttons feel weighted
- [ ] Verify editor: open several clue modals, confirm backdrop click closes, changes persist in grid
- [ ] Check browser console for any CSS variable resolution errors (undefined `var(--...)` would show as empty/invalid)
