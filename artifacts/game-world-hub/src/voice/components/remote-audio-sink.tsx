import { useEffect, useRef } from "react";
import type { PeerUiState } from "../voice-context";

/**
 * Renders hidden <audio> elements per remote peer so their audio plays.
 * Mounted globally (inside the provider) so playback continues
 * regardless of which page is visible.
 *
 * Volume and muting are controlled directly on `el.volume` / `el.muted`
 * because we use our own <audio srcObject> elements (not LiveKit's internal
 * attachment), so RemoteAudioTrack.setVolume() would be a no-op here.
 *
 * Two elements per peer when they have screen-share audio:
 *   1. Mic audio  — volume from peerVolumes; muted when deafened
 *   2. Screen audio — volume 1; muted when deafened OR in screenAudioMutes
 */
export function RemoteAudioSink({
  peers,
  deafened,
  peerVolumes,
  screenAudioMutes,
}: {
  peers: PeerUiState[];
  deafened: boolean;
  peerVolumes: Record<number, number>;
  screenAudioMutes: Set<number>;
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
            volume={1}
            muted={deafened || screenAudioMutes.has(p.userId)}
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

  // Apply deafen / screen-audio-mute by toggling `muted` — the stream stays
  // connected so audio resumes immediately when the state changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  // Apply per-peer volume directly on the element.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  return <audio ref={ref} autoPlay playsInline />;
}
