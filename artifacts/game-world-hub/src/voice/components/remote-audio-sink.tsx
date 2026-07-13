import { useEffect, useRef } from "react";
import type { PeerUiState } from "../voice-context";

/**
 * Renders a hidden <audio> element per remote peer so their microphone audio
 * actually plays. Mounted globally (inside the provider) so playback continues
 * regardless of which page is visible.
 */
export function RemoteAudioSink({ peers }: { peers: PeerUiState[] }) {
  return (
    <div aria-hidden className="sr-only">
      {peers.map((p) => (
        <PeerAudio key={p.userId} stream={p.audioStream} />
      ))}
    </div>
  );
}

function PeerAudio({ stream }: { stream: MediaStream | null }) {
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

  return <audio ref={ref} autoPlay playsInline />;
}
