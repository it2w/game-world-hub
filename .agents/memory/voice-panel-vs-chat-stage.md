---
name: VoicePanel vs inline VoiceStage in chat
description: The floating VoicePanel (call widget) and the inline VoiceStage inside chat.tsx are different components. Auto-navigation connects them.
---

Two separate call UI components exist:

- **VoicePanel** (`voice-panel.tsx`) — global floating widget docked at `fixed bottom-4 start-4`, shown by Shell when `!inlineStageActive`. Appears on ANY page during a call. Width 300px; the user can mistake it for the "DM chat page."
- **VoiceStage** (`voice-stage.tsx`) — inline call stage embedded at the top of `chat.tsx` when `callBelongsHere` is true (the open conversation matches the call peer). Calls `acquireInlineStage()` on mount, which sets `inlineStageActive = true` and hides the floating VoicePanel.

**Why this caused a bug:** Users saw the VoicePanel floating but never navigated to `/chat/:conversationId`. They assumed the VoicePanel WAS the redesigned chat. The inline VoiceStage + redesigned sidebar + messages only appear when already on the right conversation URL.

**Fix (now in production):**
- `useCallAutoNavigate` hook in `shell.tsx` — fires once per call when `voice.activeRoom` transitions to `{ kind: "call" }`. Fetches `/api/conversations`, finds the direct conversation with `peer.userId`, navigates to `/chat/:conversationId`. Uses a `handledPeerRef` to fire only once.
- MessageSquare icon button added to VoicePanel header (call rooms only) — lets the user manually return to the chat page if they navigated away.

**How to apply:** Any feature that needs "show the chat during a call" should rely on `useCallAutoNavigate` (already fires for all call starts). The hook lives in shell.tsx and is called unconditionally inside `Shell`.
