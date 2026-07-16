import { useEffect, useRef } from "react";
import type { PeerUiState } from "../voice-context";

/**
 * Renders a hidden <audio> element per remote peer so their microphone audio
 * actually plays. Mounted globally (inside the provider) so playback continues
 * regardless of which page is visible.
 *
 * `deafened` mutes ALL remote audio instantly without stopping the tracks,
 * so the streams stay alive and resume cleanly when the user un-deafens.
 */
export function RemoteAudioSink({
  peers,
  deafened,
}: {
  peers: PeerUiState[];
  deafened: boolean;
}) {
  return (
    <div aria-hidden className="sr-only">
      {peers.map((p) => (
        <PeerAudio key={p.userId} stream={p.audioStream} deafened={deafened} />
      ))}
    </div>
  );
}

function PeerAudio({
  stream,
  deafened,
}: {
  stream: MediaStream | null;
  deafened: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);

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

  // Apply deafen by toggling the `muted` attribute — the stream stays
  // connected so audio resumes immediately when the user un-deafens.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = deafened;
  }, [deafened]);

  return <audio ref={ref} autoPlay playsInline />;
}
