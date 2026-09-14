# Nav Breadcrumb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "← Home" button at the top-left of EditorPage (always), HostPage (game over screen only), and PlayerPage (game over screen only).

**Architecture:** A shared `NavBreadcrumb` component uses `useNavigate` to go to `/`. Each page imports and renders it at the appropriate point — always for EditorPage, conditionally for HostPage and PlayerPage only when `phase === 'finished'`. DisplayPage is excluded (TV screen).

**Tech Stack:** React 19, react-router-dom v7, inline styles (no CSS files).

---

### Task 1: Create NavBreadcrumb component

**Files:**
- Create: `client/src/components/NavBreadcrumb.jsx`

- [ ] **Step 1: Create the file**

```jsx
import { useNavigate } from 'react-router-dom';

export default function NavBreadcrumb() {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => navigate('/')}
        style={{
          background: '#1e293b',
          color: '#94a3b8',
          border: 'none',
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

- [ ] **Step 2: Commit**

```bash
git add client/src/components/NavBreadcrumb.jsx
git commit -m "feat: add NavBreadcrumb component"
```

---

### Task 2: Add NavBreadcrumb to EditorPage

**Files:**
- Modify: `client/src/pages/EditorPage.jsx` (~line 213)

EditorPage has a two-column layout: a sidebar on the left and a main editor area on the right (`flex: 1, overflow: auto, padding: 16`). Add the breadcrumb as the first element inside that main area div.

- [ ] **Step 1: Import NavBreadcrumb**

At the top of `client/src/pages/EditorPage.jsx`, add the import after the existing imports:

```jsx
import NavBreadcrumb from '../components/NavBreadcrumb';
```

- [ ] **Step 2: Add NavBreadcrumb inside the main editor area**

Find this block (around line 213):

```jsx
      {/* Main editor area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {error && (
```

Replace with:

```jsx
      {/* Main editor area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <NavBreadcrumb />
        {error && (
```

- [ ] **Step 3: Verify manually**

Start the dev server (`npm run dev` in the `client/` directory, or use your existing dev script). Open the board editor at `http://localhost:5173/editor`. Confirm a "← Home" button appears at the top-left of the main area. Click it — confirm it navigates to `/`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EditorPage.jsx
git commit -m "feat: add home breadcrumb to EditorPage"
```

---

### Task 3: Add NavBreadcrumb to HostPage (finished screen)

**Files:**
- Modify: `client/src/pages/HostPage.jsx` (the `HostFinished` function, ~line 215)

`HostFinished` is a standalone function component defined in the same file. It renders a "Game Over!" heading followed by the sorted player list. Add the breadcrumb at the very top of its returned JSX.

- [ ] **Step 1: Import NavBreadcrumb**

At the top of `client/src/pages/HostPage.jsx`, add the import after the existing imports:

```jsx
import NavBreadcrumb from '../components/NavBreadcrumb';
```

- [ ] **Step 2: Add NavBreadcrumb inside HostFinished**

Find this block (around line 217):

```jsx
function HostFinished({ players }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: '#fbbf24', marginBottom: 24 }}>Game Over!</div>
```

Replace with:

```jsx
function HostFinished({ players }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <NavBreadcrumb />
      <div style={{ fontSize: 28, fontWeight: 'bold', color: '#fbbf24', marginBottom: 24 }}>Game Over!</div>
```

- [ ] **Step 3: Verify manually**

In the host view, play through to the `finished` phase. Confirm "← Home" appears at the top. Click it — confirm it goes to `/`. During earlier phases (lobby, board, clue, etc.) confirm the button is NOT visible.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/HostPage.jsx
git commit -m "feat: add home breadcrumb to HostPage finished screen"
```

---

### Task 4: Add NavBreadcrumb to PlayerPage (finished screen)

**Files:**
- Modify: `client/src/pages/PlayerPage.jsx` (~line 252)

The `phase === 'finished'` block renders "Game Over!" and the sorted player list. Add the breadcrumb at the top of that block.

- [ ] **Step 1: Import NavBreadcrumb**

At the top of `client/src/pages/PlayerPage.jsx`, add the import after the existing imports:

```jsx
import NavBreadcrumb from '../components/NavBreadcrumb';
```

- [ ] **Step 2: Add NavBreadcrumb in the finished phase block**

Find this block (around line 252):

```jsx
      {game.phase === 'finished' && (
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 16 }}>Game Over!</div>
```

Replace with:

```jsx
      {game.phase === 'finished' && (
        <div>
          <NavBreadcrumb />
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 16 }}>Game Over!</div>
```

- [ ] **Step 3: Verify manually**

In a player view, play through to the `finished` phase. Confirm "← Home" appears above the "Game Over!" heading. Click it — confirm it goes to `/`. During earlier phases confirm the button is NOT visible.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PlayerPage.jsx
git commit -m "feat: add home breadcrumb to PlayerPage finished screen"
```
