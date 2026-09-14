# QR Code Lobby Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a QR code to the pre-game lobby screen so players can scan to join instead of typing the game code.

**Architecture:** `react-qr-code` renders a pure SVG QR code client-side. `LobbyDisplay` in `DisplayPage.jsx` is restructured to a two-column layout — large QR panel on the left (encodes the full join URL, shows URL text below), game code + player list on the right. No server changes.

**Tech Stack:** React 19, react-qr-code, Vite

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `client/package.json` | Add `react-qr-code` dependency |
| Modify | `client/src/pages/DisplayPage.jsx` | Add QRCode import; restructure `LobbyDisplay` |

---

### Task 1: Install react-qr-code

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install the package**

Run from the `client/` directory:
```bash
cd client && npm install react-qr-code
```

Expected output includes a line like:
```
added 1 package
```

- [ ] **Step 2: Verify it was added**

Open `client/package.json` and confirm `"react-qr-code"` appears under `"dependencies"`.

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add react-qr-code dependency"
```

---

### Task 2: Update LobbyDisplay with QR code layout

**Files:**
- Modify: `client/src/pages/DisplayPage.jsx:1-6` (add import)
- Modify: `client/src/pages/DisplayPage.jsx:89-107` (replace LobbyDisplay body)

- [ ] **Step 1: Add the import**

At the top of `client/src/pages/DisplayPage.jsx`, add the QRCode import after the existing imports:

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../socket';
import GameBoard from '../components/GameBoard';
import ScoreBar from '../components/ScoreBar';
import QRCode from 'react-qr-code';
```

- [ ] **Step 2: Replace the LobbyDisplay function**

Replace the entire `LobbyDisplay` function (lines 89–107) with:

```jsx
function LobbyDisplay({ game, gameCode }) {
  const joinUrl = `${window.location.origin}/play/${gameCode}`;
  const displayUrl = `${window.location.hostname}/play/${gameCode}`;

  return (
    <div style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 48, fontWeight: 'bold', color: '#fbbf24', letterSpacing: 6, marginBottom: 8 }}>JEOPARDY!</div>
      <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 32 }}>Join at this device's address</div>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ background: '#1e293b', border: '3px solid #fbbf24', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, display: 'inline-block' }}>
            <QRCode value={joinUrl} size={160} />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginTop: 12 }}>SCAN TO JOIN</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{displayUrl}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ background: '#1e293b', border: '3px solid #fbbf24', borderRadius: 16, padding: '24px 48px' }}>
            <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 3, marginBottom: 8 }}>GAME CODE</div>
            <div style={{ fontSize: 56, fontWeight: 'bold', color: '#fbbf24', letterSpacing: 12 }}>{gameCode}</div>
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>PLAYERS JOINED</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(game.players || []).map(p => (
              <div key={p.name} style={{ background: '#1e40af', borderRadius: 8, padding: '10px 20px', fontSize: 16, fontWeight: 'bold' }}>{p.name}</div>
            ))}
            {(!game.players || game.players.length === 0) && <div style={{ color: '#475569' }}>Waiting for players...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Start the dev server and verify visually**

```bash
# From the project root
npm run dev   # or use start-dev.ps1 if present
```

Navigate to a display URL, e.g. `http://localhost:5173/display/TEST`.

Expected: lobby screen shows the two-column layout — QR code on the left inside a yellow border, game code + player list on the right. The QR panel shows "SCAN TO JOIN" and the URL text below the QR. No console errors.

Scan the QR code with a phone (or paste the URL text into a browser) and confirm it lands on the join page for that game code.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DisplayPage.jsx
git commit -m "feat: show QR code on lobby display screen"
```
