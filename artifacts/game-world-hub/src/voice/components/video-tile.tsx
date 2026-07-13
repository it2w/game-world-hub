import { useEffect, useRef } from "react";

/** Renders a MediaStream into a muted <video> element (screen shares). */
export function VideoTile({
  stream,
  muted = true,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);

  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}
