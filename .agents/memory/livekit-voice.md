---
name: LiveKit voice transport
description: Architecture of the LiveKit Cloud integration that replaced the custom P2P WebRTC mesh for voice/video/screen.
---

## Architecture

- **LiveKit Cloud** is the sole media SFU. The custom `Peer` class, ICE servers, SDP/candidate relay, and `rooms` map in signaling.ts are all gone.
- **`/api/livekit/token` (GET)** issues LiveKit access tokens after server-side authorization:
  - `party:<id>` rooms → verify DB party membership
  - `call:<id>` rooms → verify presence in the in-memory `callRooms` map (exported from signaling.ts)
- **`/api/ws` WebSocket** is kept but stripped to: call-invite handshake, admin force-mute relay, force-evict relay, typing indicators. No SDP or ICE relay.
- **`callRooms`** is exported from `signaling.ts` so the livekit token route can authorize call participants.
- **`evictUserFromRoom`** sends `force-leave` via WS; the client calls `room.disconnect()` — LiveKit cleans up naturally.
- **Deafen** is implemented via `RemoteAudioTrack.setVolume(0/1)`, not by stopping streams.
- **RemoteAudioSink** is a no-op for audio (LiveKit auto-plays); it renders empty `<audio>` elements with `srcObject=null`.
- **Speaking detection** uses `RoomEvent.ActiveSpeakersChanged` and `participant.isSpeaking`.
- **PeerUiState** interface is unchanged so VoicePanel, VideoTile, IncomingCallDialog are untouched.
- **Participant identity** = userId string; metadata = `{ displayName, avatarUrl }` JSON.

## Key files

- `artifacts/api-server/src/routes/livekit.ts` — token route
- `artifacts/api-server/src/ws/signaling.ts` — exports `callRooms`; no room tracking
- `artifacts/game-world-hub/src/voice/voice-context.tsx` — full LiveKit Room lifecycle
- `artifacts/game-world-hub/src/voice/webrtc.ts` — only `getSignalingUrl` + `getApiBase` remain

**Why:** LiveKit Cloud SFU eliminates NAT traversal complexity, STUN/TURN costs, and mesh scalability limits. The WS server only needs to broker call intent, not relay media.

**How to apply:** When adding new voice features, use `Room` events and `LocalParticipant` APIs directly. For authorization on new room types, add a branch in `livekit.ts` and populate `callRooms` (or equivalent) before the client requests a token.
