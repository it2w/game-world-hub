---
name: Voice per-peer volume and screen audio
description: How per-user volume control and screen-share audio muting work in the voice context.
---

## Architecture (correct approach)

Audio for remote peers plays via our own `<audio srcObject={mediaStream}>` elements in `RemoteAudioSink`, NOT through LiveKit's internal element attachment. This means **`RemoteAudioTrack.setVolume()` is always a no-op** — `attachedElements` is empty because we never call `track.attach()`.

**Do not use `track.setVolume()` for volume control.** Apply volume/mute directly on the DOM element:
- `el.volume = value` for per-peer mic volume
- `el.muted = true/false` for deafen and screen-audio mute

## State
- `peerVolumes: Record<number,number>` — mic volume per userId (0–1, default 1)
- `screenAudioMutes: Set<number>` — userIds whose screen audio is locally muted
- Each has a matching `...Ref` updated via `useEffect` for stale-closure-safe callbacks
- Both are passed as props to `RemoteAudioSink` (do NOT use `useVoice()` inside the sink — that creates a circular import with voice-context.tsx)

## RemoteAudioSink
- Renders one `<PeerAudio stream={p.audioStream} volume={peerVolumes[uid]} muted={deafened}>` per peer for mic audio
- Renders one `<PeerAudio stream={p.screenAudioStream} volume={1} muted={deafened || screenAudioMutes.has(uid)}>` per peer when `p.screenAudioStream` is non-null
- `PeerAudio` applies `el.volume` and `el.muted` reactively via `useEffect([volume])` and `useEffect([muted])`
- Deafen toggles `el.muted` — stream stays alive, resumes immediately on un-deafen
- No `applyDeafenVolume()` function needed; deafen is purely reactive via state → props → effect

## PeerUiState
- `audioStream: MediaStream | null` — mic audio (set in TrackSubscribed, cleared on TrackUnsubscribed)
- `screenAudioStream: MediaStream | null` — screen share audio (set in TrackSubscribed for ScreenShareAudio, cleared on TrackUnsubscribed)
- `hasScreenAudio: boolean` — UI flag (set alongside screenAudioStream)
- `ParticipantConnected` default must initialize `screenAudioStream: null`

## Screen share audio
- `startScreenShare` requests `audio: true` — browser/OS may decline on Linux
- Video and audio published as separate LiveKit tracks (ScreenShare + ScreenShareAudio sources)
- Both stored in separate refs (`screenTrackRef`, `screenAudioTrackRef`) and unpublished in `stopScreenShare`

## Circular import warning
- `remote-audio-sink.tsx` is imported by `voice-context.tsx`
- Never import `useVoice` inside `remote-audio-sink.tsx` — that creates a circular dep and breaks Vite Fast Refresh
- Pass all needed state as explicit props from the VoiceProvider render

**Why:** LiveKit v2 does not auto-attach remote audio tracks when subscribed — the SDK requires explicit `track.attach()` calls. Since we use our own `<audio srcObject>` pipeline, setVolume() never has elements to apply to.
