# UI Overhaul Design

**Date:** 2026-09-14  
**Scope:** Display page (primary), Host page, Board Editor — visual redesign using a shared design token system

---

## Overview

The current codebase uses scattered inline hex values across all views. This overhaul introduces a CSS token system and applies a "Cinematic Dark" aesthetic consistently. The player mobile view already has the right aesthetic direction — this brings the other views in line while improving on it rather than copying any existing reference app.

The changes are visual (colors, typography, spacing, visual hierarchy) plus one structural change in the editor (inline editing → modal). No game logic or socket handling is touched.

---

## 1. Design Token System

A single `client/src/theme.css` defines CSS custom properties, imported once in `main.jsx`:

```css
:root {
  --bg-deep: #050a14;       /* page/screen background */
  --bg-panel: #0d1b35;      /* cards, cells, panels */
  --bg-surface: #0a1628;    /* inputs, inner containers */
  --border-subtle: #1e3a6e; /* default borders */
  --border-accent: #fbbf24; /* amber highlight borders */
  --color-amber: #fbbf24;   /* Jeopardy yellow, dollar values */
  --color-white: #e2e8f0;   /* primary text */
  --color-muted: #6b7280;   /* secondary labels, placeholder */
  --color-label: #c0cfe8;   /* category names, field labels */
  --color-green: #4ade80;   /* positive scores, correct */
  --color-red: #f87171;     /* negative scores, incorrect */
  --color-blue-accent: #1e3a6e; /* selector/picker highlight */
}
```

All inline hex values across `DisplayPage`, `HostPage`, `EditorPage`, `GameBoard`, `ScoreBar`, `BuzzerButton`, `BoardEditorGrid`, `NavBreadcrumb`, and `HomePage` are replaced with `var(--color-...)` references.

---

## 2. Display Page

The display page is shown on a TV or projector. The overhaul focuses on four key states.

### Board State

- **Background:** `--bg-deep`
- **Category headers:** `--bg-panel` background with a 2px `--border-accent` top border; text in `--color-label` with wide letter-spacing
- **Clue cells:** `--bg-panel` background, 1px `--border-subtle` border, `--color-amber` dollar value text, bold
- **Revealed cells:** pure `--bg-deep`, no border, no checkmark — they simply vanish
- **Picker indicator in ScoreBar:** amber border (`--border-accent`) with a small `▶ PICKING` label

### Clue State (reading)

- Full-screen, no score bar
- Category name at top in `--color-label` with wide letter-spacing, separated by a subtle border
- Clue text large and centered in `--color-white`
- Dollar value shown as a small pill badge in `--bg-panel` / `--color-label`
- Buzzer status indicator: red dot + `BUZZERS LOCKED` label below clue

### Judging State (buzz-in)

- Amber border on the entire screen edge (`--border-accent`, 3px)
- Player name dominates the center: very large, `--color-amber`, bold, wide letter-spacing
- `BUZZED IN` label below in muted brown
- Clue text remains visible but dimmed (`--color-muted`, italic) for context
- Category + value shown small at top

### Final Jeopardy States

- Follow the same Cinematic Dark palette
- Category name displayed large in `--color-white`
- `FINAL JEOPARDY` label in `--color-amber` with wide letter-spacing
- Player submission chips: `--bg-panel` with `--border-subtle`; submitted players show `--color-green` check, pending show `--color-muted` hourglass

---

## 3. Host Page

The host page is a laptop/tablet control panel. No layout restructuring — the same phase-based components remain. Visual improvements only.

### All States

- Page background: `--bg-deep`
- All panel/card containers: `--bg-panel` with `--border-subtle` border
- Inner content areas (clue text, inputs): `--bg-surface`
- Score bar: consistent with display page ScoreBar styling

### Clue/Judging State (key improvements)

- **Clue panel:** `--bg-surface` inset with `--border-subtle`, small `CLUE` label in `--color-muted`
- **Answer panel:** dark green background (`#0a1f0f`), `--color-green` border, `--color-green` answer text — visually distinct from the clue panel at a glance
- **Buzz-in banner:** amber background (`--color-amber`), player name bold in dark text
- **Correct button:** dark green background + `--color-green` border + `--color-green` text with `+$value` sub-label
- **Incorrect button:** dark red background (`#450a0a`) + red border + `--color-red` text with `-$value` sub-label
- **Unlock Buzzers button:** `--bg-panel` background + `--color-green` border + `--color-green` text
- **Skip button:** `--bg-surface` background, muted styling — visually recessive so it's never confused with judge buttons

---

## 4. Board Editor

### Grid Overview

The editor is desktop-first. Grid cells are larger and have readable clue previews.

- Grid column gap increased from 6px to 8px; cells have more vertical padding
- **Complete cells:** `--bg-panel` + `--border-subtle`, dollar value in `--color-amber` with `✓`, clue preview text in `--color-muted` (truncated, with media type icon prefix: `📷` or `▶`)
- **Empty cells:** `--bg-surface` + 1px dashed `--border-subtle`, reduced opacity, "Click to add..." in `--color-muted` italic
- **Active cell** (currently being edited): amber glow border (`--border-accent`) so the user knows which cell maps to the open modal
- Category name inputs: `--bg-panel` + `--border-subtle`, centered bold text

### Edit Modal

Clicking any clue cell opens a modal overlay instead of expanding inline.

- **Backdrop:** semi-transparent dark overlay dims the grid behind (`rgba(0,0,0,0.7)`)
- **Modal panel:** `--bg-panel` + `--border-subtle`, `border-radius: 10px`, centered, max-width ~600px
- **Header:** category + value label in `--color-amber`, close button (`✕`) top-right
- **Type selector:** three buttons (Text / Image / Video); active type highlighted in purple (`#7c3aed`), inactive in `--bg-surface` + `--border-subtle`
- **Clue textarea:** `--bg-surface` + `--border-subtle`, `--color-white`, comfortable `14px` font, 4+ rows
- **Answer input:** dark green background + `--color-green` border + `--color-green` text (visually matches host page answer panel)
- **Answer image input (optional):** `--bg-surface` + `--border-subtle`, `--color-muted` text, clearly de-emphasized
- **Footer:** "Save & Close" in green styling; "Cancel" in `--bg-surface` muted styling

The grid remains visible and dimmed behind the modal so the user retains spatial context.

---

## What Is Not Changing

- Game logic, socket events, server code — untouched
- Player mobile page — already has the right aesthetic; gets token variables applied but no visual changes
- HomePage — minimal; gets token variables applied, no layout changes
- Component interfaces — same props as today; only internal style values change
- No new dependencies (no CSS framework, no component library)

---

## File Impact Summary

| File | Change |
|------|--------|
| `client/src/theme.css` | New file — design token variables |
| `client/src/main.jsx` | Import `theme.css` |
| `client/src/pages/DisplayPage.jsx` | Cinematic Dark board, full-screen clue, dramatic buzz-in |
| `client/src/pages/HostPage.jsx` | Token variables, answer panel, weighted judge buttons |
| `client/src/pages/EditorPage.jsx` | Token variables, modal editing, larger grid cells |
| `client/src/components/GameBoard.jsx` | Cinematic Dark cells, vanishing revealed state |
| `client/src/components/ScoreBar.jsx` | Token variables, picker amber border |
| `client/src/components/BuzzerButton.jsx` | Token variables |
| `client/src/components/BoardEditorGrid.jsx` | Modal trigger, larger cells, token variables |
| `client/src/pages/PlayerPage.jsx` | Token variables only (no visual change) |
| `client/src/pages/HomePage.jsx` | Token variables only |
| `client/src/components/NavBreadcrumb.jsx` | Token variables only |
