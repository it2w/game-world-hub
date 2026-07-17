import { useSyncExternalStore } from "react";

/**
 * Tiny shared store that tracks whether an inline <VoiceStage /> (embedded at
 * the top of a conversation) is currently mounted. When it is, the global
 * floating <VoicePanel /> hides itself so the call UI is not shown twice.
 */
let mountedCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Called by an inline VoiceStage while it renders the active call.
 *  Returns a release function to run on unmount. */
export function acquireInlineStage(): () => void {
  mountedCount += 1;
  emit();
  return () => {
    mountedCount = Math.max(0, mountedCount - 1);
    emit();
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return mountedCount > 0;
}

/** True when an inline VoiceStage is mounted (floating panel should hide). */
export function useInlineStageActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
