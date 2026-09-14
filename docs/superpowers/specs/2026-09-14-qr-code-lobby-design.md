# QR Code Lobby Display

**Date:** 2026-09-14  
**Status:** Approved

## Summary

Add a QR code to the lobby screen (pre-game, `phase === 'lobby'`) of the display page so players can scan directly to the join URL instead of typing the game code.

## Scope

- Modify `LobbyDisplay` in `client/src/pages/DisplayPage.jsx`
- Add `react-qr-code` npm dependency to `client/`
- No server changes, no socket changes, no other pages affected

## Layout

Two-column flex layout beneath the "JEOPARDY!" title:

- **Left panel** — yellow-bordered box containing:
  - `react-qr-code` SVG QR code (encodes full join URL)
  - "SCAN TO JOIN" label
  - URL text below QR: `window.location.hostname + '/play/' + gameCode` (no protocol, for readability)
- **Right panel** — existing content repositioned:
  - Game code box (unchanged)
  - "PLAYERS JOINED" label + player chips (unchanged)

"JEOPARDY!" title and subtitle remain centered at the top above the two columns.

## QR Code Value

```
window.location.origin + '/play/' + gameCode
```

Full origin (protocol + hostname + port) ensures the link works regardless of port configuration.

## Library

`react-qr-code` — renders a pure SVG QR code entirely client-side. No internet required; works on isolated local networks. Install: `npm install react-qr-code` in `client/`.

## Behaviour

- QR code only renders during `phase === 'lobby'`
- No other phases are affected
- Purely presentational — no state, no socket events

## Out of Scope

- Animated or pulsing QR code
- QR code on any screen other than the lobby
- Server-side QR generation
