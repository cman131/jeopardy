# Nav Breadcrumb Design

**Date:** 2026-09-14

## Goal

Add a "← Home" navigation link at the top-left of relevant screens so users can return to the home page without using the browser's back button.

## Scope

| Page | Shows breadcrumb? | Condition |
|------|-------------------|-----------|
| HomePage (`/`) | No | Already home |
| EditorPage (`/editor`, `/editor/:boardId`) | Yes | Always |
| HostPage (`/host/:gameCode`) | Yes | Only when `phase === 'finished'` |
| PlayerPage (`/play/:gameCode`) | Yes | Only when `phase === 'finished'` |
| DisplayPage (`/display/:gameCode`) | No | TV/projector screen — no nav chrome |

## Component

A new shared component `client/src/components/NavBreadcrumb.jsx`.

- Uses `useNavigate` from `react-router-dom` to navigate to `/`
- Renders a single "← Home" button
- Inline styles matching the app's dark theme — small, muted, low-contrast (similar to the existing "Open TV Display ↗" link in HostPage)
- Positioned at the top-left via a wrapper `div` with `position` or normal flow

## Placement per page

- **EditorPage**: rendered once at the top of the returned JSX, above all existing content
- **HostPage → `HostFinished` component**: rendered at the top of `HostFinished`'s JSX
- **PlayerPage**: rendered inside the `phase === 'finished'` block

## What it does NOT do

- No confirmation dialog — at the finished phase there is no active socket state to lose
- No multi-level breadcrumb trail — the app hierarchy is shallow
- No change to DisplayPage

## Styling reference

Matches the muted link style already used in HostPage:

```
background: #1e293b
color: #94a3b8
border-radius: 6px
padding: 6px 12px
font-size: 13px
border: none
cursor: pointer
```
