---
name: Voice per-peer volume and screen audio
description: How per-user volume control and screen-share audio muting work in the voice context.
---

## Pattern
- `peerVolumes: Record<number,number>` and `screenAudioMutes: Set<number>` are React state.
- Each has a matching `...Ref` updated via `useEffect` — used inside `useCallback` handlers to avoid stale closures.
- `applyDeafenVolume` checks `pub.source === Track.Source.ScreenShareAudio` to decide whether to restore individual mic volume or screen-audio mute on un-deafen.

## Screen share audio
- `startScreenShare` requests `audio: true` — browser/OS may decline. Audio track captured as `stream.getAudioTracks()[0] ?? null`.
- Video and audio tracks are stored in separate refs (`screenTrackRef`, `screenAudioTrackRef`).
- Both must be unpublished in `stopScreenShare` and in the `ended` event handler on the video track.
- Published audio uses `source: Track.Source.ScreenShareAudio` (no encoding options needed).

## TrackSubscribed handler
- Must branch on `pub.source === Track.Source.ScreenShareAudio` vs mic. ScreenShareAudio → apply mute state and patch `hasScreenAudio: true`. Mic → apply volume and patch `audioStream`.
- `PeerUiState` must include `hasScreenAudio: boolean`; the `ParticipantConnected` default object must initialize it to `false`.

## VoicePanel ParticipantRow UI
- On hover (`showActions`), the name is replaced by a volume slider (Radix `Slider`, 0–100 mapped to 0–1).
- Screen-audio mute button (VolumeX/Volume2 icon) appears in the status icons section only when `sharing && hasScreenAudio`.

**Why:** Volume is controlled purely via `RemoteAudioTrack.setVolume()` — no custom `<audio>` elements are needed.
