# Audio Media Type + Buzzinga Hash Auto-Resolution

**Date:** 2026-09-15  
**Status:** Approved

## Problem

Buzzinga CSV exports produce two gaps in the current app:

1. `AUDIO` clues import correctly typed as `audio` but are never rendered — `ClueMedia` has no audio branch, the editor has no audio type button, and the host has no "play audio" control.
2. `IMAGE` and `AUDIO` clues come with a content hash (not a URL) in the `clueText` field. The app stores this in `mediaHash` and shows a warning asking users to manually replace the hash with a real URL. This is friction that can be eliminated because the Buzzinga CDN URL pattern is known: `https://buzzinga.s3.us-east-2.amazonaws.com/{hash}`.

## Approach

Reuse the existing video host-control infrastructure (same socket events, same `videoPlayed`/`videoPlaying` state) for audio. Rename the `videoReady` prop on `ClueMedia` to `mediaReady` for clarity. No new socket events needed — the behavior is identical.

## Changes

### 1. Import (`client/src/utils/boardImportUtils.js`)

- In `mapClueRow` and the final-jeopardy block, when `ourType === 'image' || ourType === 'audio'`, set `mediaUrl = 'https://buzzinga.s3.us-east-2.amazonaws.com/' + hash` and leave `mediaHash` empty.
- Remove the `warnings` counter and all `if (clue.mediaHash) warnings++` checks.
- Return `{ board, warnings: 0 }` (or drop the field entirely if callers don't need it).

### 2. ClueMedia (`client/src/components/ClueMedia.jsx`)

- Rename prop `videoReady` → `mediaReady`.
- Add audio branch: when `mediaReady` is false, show the same dark placeholder box as video (text: "♪ Audio ready — host will start playback"). When `mediaReady` is true, render `<audio autoPlay src={mediaUrl} controls style={{ marginTop: 12 }} />`.

### 3. Editor — ClueModal (`client/src/components/BoardEditorGrid.jsx`)

- Add `'audio'` to the type button array: `['regular', 'image', 'video', 'audio']`.
- Button label: `'🔊 Audio'`.
- Show `mediaUrl` input when `type === 'audio'` (label: `'AUDIO URL'`, placeholder: `'https://...'`).
- Fix completeness check: `(type === 'regular' || clue.mediaUrl)` — already correct once hashes resolve to URLs; no change needed to the logic itself.
- Update grid cell preview icon: add `type === 'audio' ? '🔊 ' : ''`.

### 4. Editor — FinalJeopardyTab (`client/src/pages/EditorPage.jsx`)

- Same additions: `'audio'` button with `'🔊 Audio'` label, `mediaUrl` input for audio type with `'AUDIO URL'` label.
- Update the `IMAGE URL / YOUTUBE URL` label logic to also handle `audio`.
- Remove the import warnings banner (the `importWarnings > 0` block) — no longer needed.

### 5. Host controls (`client/src/pages/HostPage.jsx`)

- In `HostClue`: change `clueData?.type === 'video'` → `['video', 'audio'].includes(clueData?.type)`. Show `'▶ Play Video on Display'` for video and `'🔊 Play Audio on Display'` for audio. Disabled/played states remain the same.
- In `HostFinalClue`: same — `game.fjType === 'video'` → `['video', 'audio'].includes(game.fjType)` with matching labels.
- The `onPlayVideo` prop name can stay as-is (cosmetic, no behavioral difference).

### 6. Display (`client/src/pages/DisplayPage.jsx`)

- In `ClueDisplay`: change `currentClue.type === 'video' ? videoPlaying : true` → `['video', 'audio'].includes(currentClue.type) ? videoPlaying : true`.
- In the Final Jeopardy section: same change for `game.fjType`.
- Prop rename: pass `mediaReady` instead of `videoReady` to `ClueMedia`.

## Data Flow

```
Import (parseBuzzingaCsv)
  AUDIO/IMAGE hash → mediaUrl = CDN + hash, mediaHash = ''
  No warnings emitted

Editor
  audio type button → sets type='audio', clears mediaUrl
  audio URL input → sets mediaUrl directly

Gameplay
  host:clue / game:clueRevealed → clue carries { type: 'audio', mediaUrl }
  Host sees "🔊 Play Audio on Display" button
  Host clicks → socket emits host:playVideo → server broadcasts game:videoPlay
  Display sets videoPlaying=true → passes mediaReady=true to ClueMedia
  ClueMedia renders <audio autoPlay src={mediaUrl} />
```

## Testing

- Import a Buzzinga CSV with IMAGE and AUDIO rows → no warning shown, URLs resolve correctly.
- Create an audio clue manually in the editor → saves and renders correctly in gameplay.
- Audio clue on display shows dark placeholder until host clicks play, then autoplays.
- Final Jeopardy audio clue follows the same flow.
- Existing image and video clues are unaffected.

## Files Changed

| File | Change |
|------|--------|
| `client/src/utils/boardImportUtils.js` | Hash → URL conversion, remove warnings |
| `client/src/utils/boardImportUtils.test.js` | Update tests for new behavior |
| `client/src/components/ClueMedia.jsx` | Add audio branch, rename prop |
| `client/src/components/BoardEditorGrid.jsx` | Add audio type button + URL input |
| `client/src/pages/EditorPage.jsx` | Add audio to FJ tab, remove warnings banner |
| `client/src/pages/HostPage.jsx` | Extend play button to audio type |
| `client/src/pages/DisplayPage.jsx` | Extend mediaReady condition to audio type |
