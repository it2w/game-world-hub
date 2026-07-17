import { useEffect, useRef } from "react";
import type { PeerUiState } from "../voice-context";

/**
 * Renders hidden <audio> elements per remote peer so their audio plays.
 * Mounted globally (inside the provider) so playback continues
 * regardless of which page is visible.
 *
 * Volume and muting are controlled directly on el.volume / el.muted
 * because we use our own <audio srcObject> elements (not LiveKit's internal
 * attachment), so RemoteAudioTrack.setVolume() would be a no-op here.
 *
 * Two elements per peer when they have screen-share audio:
 *   1. Mic audio    — volume from peerVolumes;         muted when deafened
 *   2. Screen audio — volume from screenAudioVolumes;  muted when deafened
 *                     (volume=0 in screenAudioVolumes acts as per-peer mute)
 */
export function RemoteAudioSink({
  peers,
  deafened,
  peerVolumes,
  screenAudioVolumes,
}: {
  peers: PeerUiState[];
  deafened: boolean;
  peerVolumes: Record<number, number>;
  screenAudioVolumes: Record<number, number>;
}) {
  return (
    <div aria-hidden className="sr-only">
      {peers.map((p) => (
        <PeerAudio
          key={`mic-${p.userId}`}
          stream={p.audioStream}
          volume={peerVolumes[p.userId] ?? 1}
          muted={deafened}
        />
      ))}
      {peers.map((p) =>
        p.screenAudioStream ? (
          <PeerAudio
            key={`screen-${p.userId}`}
            stream={p.screenAudioStream}
            volume={screenAudioVolumes[p.userId] ?? 1}
            muted={deafened}
          />
        ) : null,
      )}
    </div>
  );
}

function PeerAudio({
  stream,
  volume,
  muted,
}: {
  stream: MediaStream | null;
  volume: number;
  muted: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  // Swap the MediaStream source when it changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      void el.play().catch(() => {
        /* autoplay may be blocked until a user gesture; retried on next render */
      });
    }
  }, [stream]);

  // Deafen: mute the element entirely; stream stays live so it resumes cleanly.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  // Per-peer volume (0 = silent / muted, 1 = full).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  return <audio ref={ref} autoPlay playsInline />;
}
