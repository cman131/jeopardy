# Category Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-controlled, ceremonious spotlight reveal of all 6 categories before each round begins, with a slide-up animation on the display screen.

**Architecture:** Server adds a single relay-only socket handler (`host:revealCategory` → broadcasts `game:categoryRevealed`). Both DisplayPage and HostPage maintain local `revealCats`/`revealStep` state; they enter reveal mode when `game:started` or `game:round2Started` fires, and advance on each `game:categoryRevealed` event. No server phase change.

**Tech Stack:** React (useState, useEffect), Socket.IO, inline CSS animations (`@keyframes`), Node.js/Express socket handlers.

> **Note:** `host:revealNext` is already registered in `gameHandlers.js` for the Final Jeopardy player reveal. The category reveal uses distinct event names: **`host:revealCategory`** (client → server) and **`game:categoryRevealed`** (server → all clients).

---

### Task 1: Server — add `host:revealCategory` relay handler

**Files:**
- Modify: `server/src/sockets/gameHandlers.js`

- [ ] **Step 1: Add the relay handler**

  Open `server/src/sockets/gameHandlers.js`. Add the following block immediately before the `socket.on('host:endGame', ...)` handler (around line 333):

  ```javascript
  socket.on('host:revealCategory', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    io.to(_gameCodeFor(socket)).emit('game:categoryRevealed');
  });
  ```

  This handler authenticates that the sender is the host (via `_getHostEntry`), then broadcasts `game:categoryRevealed` to every socket in the game room. It carries no payload — the clients track their own step counter.

- [ ] **Step 2: Verify the server starts cleanly**

  ```bash
  cd server && node src/index.js
  ```

  Expected: server starts without syntax errors. Ctrl+C to stop.

- [ ] **Step 3: Commit**

  ```bash
  git add server/src/sockets/gameHandlers.js
  git commit -m "feat: add host:revealCategory relay for category spotlight reveal"
  ```

---

### Task 2: DisplayPage — reveal state, listeners, and `CategoryRevealDisplay` component

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx`

- [ ] **Step 1: Add reveal state hooks**

  In `DisplayPage` (the default export function), add two new `useState` hooks alongside the existing ones:

  ```javascript
  const [revealCats, setRevealCats] = useState(null);
  const [revealStep, setRevealStep] = useState(0);
  ```

  `revealCats` holds the array of 6 category strings while the reveal is active (null otherwise). `revealStep` is 0 for the intro card, 1–6 for the corresponding category, and 7+ means done.

- [ ] **Step 2: Modify the `game:started` listener to enter reveal mode**

  In the `useEffect`, replace the existing `game:started` handler:

  ```javascript
  // BEFORE:
  socket.on('game:started', ({ board, players, currentPicker, currentRound }) =>
    setGame({ phase: 'board', board, players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null, buzzedBy: null }));

  // AFTER:
  socket.on('game:started', ({ board, players, currentPicker, currentRound }) => {
    setGame({ phase: 'board', board, players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null, buzzedBy: null });
    setRevealCats(board.categoryNames);
    setRevealStep(0);
  });
  ```

- [ ] **Step 3: Modify the `game:round2Started` listener to enter reveal mode**

  Replace the existing `game:round2Started` handler:

  ```javascript
  // BEFORE:
  socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) =>
    setGame(g => ({ ...g, phase: 'board', currentRound, board: { ...g.board, categoryNames }, currentPicker, players, revealedClues: [] })));

  // AFTER:
  socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) => {
    setGame(g => ({ ...g, phase: 'board', currentRound, board: { ...g.board, categoryNames }, currentPicker, players, revealedClues: [] }));
    setRevealCats(categoryNames);
    setRevealStep(0);
  });
  ```

- [ ] **Step 4: Add the `game:categoryRevealed` listener**

  Inside the same `useEffect`, add a new listener after the `game:round2Started` handler:

  ```javascript
  socket.on('game:categoryRevealed', () => setRevealStep(s => s + 1));
  ```

  When `revealStep` reaches 7, the render condition `revealStep <= 6` becomes false, so the board automatically shows — no explicit cleanup of `revealCats` is needed.

- [ ] **Step 5: Update the render to show the reveal component**

  In `DisplayPage`'s return block, replace the existing board render:

  ```javascript
  // BEFORE:
  {(game.phase === 'board') && (
    <>
      <GameBoard categoryNames={game.board?.categoryNames || []} revealedClues={game.revealedClues} activeClue={game.currentClue} round={game.currentRound || 1} />
      <ScoreBar players={game.players} currentPicker={game.currentPicker} />
    </>
  )}

  // AFTER:
  {revealCats && revealStep <= 6 && (
    <CategoryRevealDisplay categories={revealCats} step={revealStep} round={game.currentRound || 1} />
  )}
  {game.phase === 'board' && !(revealCats && revealStep <= 6) && (
    <>
      <GameBoard categoryNames={game.board?.categoryNames || []} revealedClues={game.revealedClues} activeClue={game.currentClue} round={game.currentRound || 1} />
      <ScoreBar players={game.players} currentPicker={game.currentPicker} />
    </>
  )}
  ```

- [ ] **Step 6: Add the `CategoryRevealDisplay` component**

  Add this new function at the bottom of `DisplayPage.jsx`, after the existing `RevealCard` component:

  ```jsx
  function CategoryRevealDisplay({ categories, step, round }) {
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
      }}>
        <style>{`
          @keyframes categorySlideUp {
            from { opacity: 0; transform: translateY(40px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        {step === 0 ? (
          <div style={{ fontSize: 64, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 8 }}>
            {round === 1 ? 'JEOPARDY!' : 'DOUBLE JEOPARDY!'}
          </div>
        ) : (
          <>
            <div
              key={step}
              style={{
                background: '#1e2a5e',
                borderTop: '4px solid #3b82f6',
                borderRadius: 8,
                padding: '32px 56px',
                fontSize: 28,
                fontWeight: 'bold',
                letterSpacing: 4,
                color: '#93c5fd',
                textTransform: 'uppercase',
                animation: 'categorySlideUp 0.5s ease-out',
                maxWidth: 600,
              }}
            >
              {categories[step - 1]}
            </div>
            <div style={{ marginTop: 20, fontSize: 11, color: 'var(--color-muted)', letterSpacing: 3 }}>
              CATEGORY {step} OF 6
            </div>
          </>
        )}
      </div>
    );
  }
  ```

  > **Animation note:** `key={step}` on the animated `<div>` causes React to unmount and remount it on every step change, which restarts the CSS `@keyframes` animation for each new category.

- [ ] **Step 7: Commit**

  ```bash
  git add client/src/pages/DisplayPage.jsx
  git commit -m "feat: add CategoryRevealDisplay spotlight component to DisplayPage"
  ```

---

### Task 3: HostPage — reveal state, listeners, and `HostReveal` component

**Files:**
- Modify: `client/src/pages/HostPage.jsx`

- [ ] **Step 1: Add reveal state hooks**

  In `HostPage` (the default export function), add two new `useState` hooks alongside the existing ones:

  ```javascript
  const [revealCats, setRevealCats] = useState(null);
  const [revealStep, setRevealStep] = useState(0);
  ```

- [ ] **Step 2: Modify the `game:started` listener to enter reveal mode**

  The host page fetches `boardData` (the full board object with all rounds) inside the async `init()` function before registering socket handlers. The socket closure captures `boardData`. Replace the existing `game:started` handler:

  ```javascript
  // BEFORE:
  socket.on('game:started', ({ players, currentPicker, currentRound }) =>
    setGame(g => ({ ...g, phase: 'board', players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null })));

  // AFTER:
  socket.on('game:started', ({ players, currentPicker, currentRound }) => {
    setGame(g => ({ ...g, phase: 'board', players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null }));
    const cats = boardData[`round${currentRound || 1}`].categories.map(c => c.name);
    setRevealCats(cats);
    setRevealStep(0);
  });
  ```

- [ ] **Step 3: Modify the `game:round2Started` listener to enter reveal mode**

  Replace the existing `game:round2Started` handler:

  ```javascript
  // BEFORE:
  socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) =>
    setGame(g => ({ ...g, phase: 'board', currentRound, categoryNames, currentPicker, players, revealedClues: [] })));

  // AFTER:
  socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) => {
    setGame(g => ({ ...g, phase: 'board', currentRound, categoryNames, currentPicker, players, revealedClues: [] }));
    setRevealCats(categoryNames);
    setRevealStep(0);
  });
  ```

- [ ] **Step 4: Add the `game:categoryRevealed` listener**

  Inside `init()`, after the `game:round2Started` handler, add:

  ```javascript
  socket.on('game:categoryRevealed', () => setRevealStep(s => s + 1));
  ```

- [ ] **Step 5: Update the render to show the reveal component**

  In `HostPage`'s return block, replace the existing board line:

  ```javascript
  // BEFORE:
  {phase === 'board' && <HostBoard game={game} gameCode={gameCode} board={board} />}

  // AFTER:
  {phase === 'board' && !(revealCats && revealStep <= 6) && <HostBoard game={game} gameCode={gameCode} board={board} />}
  {revealCats && revealStep <= 6 && (
    <HostReveal
      categories={revealCats}
      step={revealStep}
      onReveal={() => socket.emit('host:revealCategory')}
    />
  )}
  ```

- [ ] **Step 6: Add the `HostReveal` component**

  Add this new function at the bottom of `HostPage.jsx`, after the existing `HostFinalReveal` component:

  ```jsx
  function HostReveal({ categories, step, onReveal }) {
    const isIntro = step === 0;
    const allRevealed = step >= 6;

    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: 3, marginBottom: 24 }}>
          {isIntro ? 'INTRO CARD' : `CATEGORY ${step} OF 6 REVEALED`}
        </div>
        <div style={{ marginBottom: 28, display: 'inline-block', textAlign: 'left' }}>
          {categories.map((name, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              marginBottom: 4,
              borderRadius: 6,
              background: i < step ? 'var(--bg-panel)' : 'transparent',
              color: i < step ? 'var(--color-white)' : 'var(--color-muted)',
            }}>
              <span style={{ color: 'var(--color-green)', width: 16, flexShrink: 0 }}>
                {i < step ? '✓' : ''}
              </span>
              <span style={{ fontSize: 14, letterSpacing: 1 }}>{name}</span>
            </div>
          ))}
        </div>
        <div>
          <button
            onClick={onReveal}
            style={{
              padding: '14px 40px',
              background: '#1d4ed8',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {allRevealed ? 'Show Board →' : 'Reveal Next →'}
          </button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add client/src/pages/HostPage.jsx
  git commit -m "feat: add HostReveal component and reveal state to HostPage"
  ```

---

### Task 4: Manual smoke test

**Start the dev environment:**

```bash
# Terminal 1 — server
cd server && npm run dev

# Terminal 2 — client
cd client && npm run dev
```

Open three browser tabs:
- **Host:** `http://localhost:5173/host/<gameCode>`
- **Display:** `http://localhost:5173/display/<gameCode>`
- **Player 1 + 2:** `http://localhost:5173/play/<gameCode>` (two tabs)

- [ ] **Round 1 reveal:**
  1. Host clicks "Start Game"
  2. **Display** should immediately show a full-screen dark panel with "JEOPARDY!" in large amber text (step 0 intro card)
  3. **Host** should show the `HostReveal` component with "INTRO CARD" label, all 6 category names dimmed, and a blue "Reveal Next →" button
  4. Click "Reveal Next →" — display shows category 1 sliding up with animation; host shows category 1 checked off, counter reads "CATEGORY 1 OF 6 REVEALED"
  5. Repeat for categories 2–5 — each slide-up animation re-fires; checked categories accumulate
  6. After category 6 is revealed, host button reads "Show Board →"; display shows category 6
  7. Click "Show Board →" — both display and host transition to the game board

- [ ] **Round 2 reveal:**
  1. Complete all Round 1 clues so the between-rounds screen appears
  2. Host clicks "Start Round 2 →"
  3. **Display** should show "DOUBLE JEOPARDY!" intro card
  4. **Host** should show `HostReveal` with Round 2 category names
  5. Click through all 6; confirm board appears after 7th click

- [ ] **Verify no regressions:**
  - During reveal, the player page shows nothing unusual (players are not affected by this feature)
  - After board appears, normal clue selection and judging still works
  - Final Jeopardy reveal (the existing `host:revealNext` flow) still works as expected

- [ ] **Commit if any last-minute fixes were made**

  ```bash
  git add -p
  git commit -m "fix: <describe what you fixed>"
  ```
