import { useState, useEffect, useCallback, useRef } from "react";
import { X, Upload, Trash2, Loader2 } from "lucide-react";
import { customFetch, useGetMePro } from "@workspace/api-client-react";
import { SYSTEM_SOUNDS, playSoundKey, playPersonalSound } from "../sounds";
import { useVoice } from "../voice-context";
import { getApiBase } from "../webrtc";

interface PersonalSound {
  id: number;
  title: string;
  mimeType: string;
  durationMs: number;
  createdAt: string;
}

interface SoundboardPanelProps {
  onClose: () => void;
}

export function SoundboardPanel({ onClose }: SoundboardPanelProps) {
  const { sendSoundboardTrigger } = useVoice();
  const { data: proStatus } = useGetMePro();
  const isPro = !!proStatus?.isPro;

  const [personalSounds, setPersonalSounds] = useState<PersonalSound[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPersonal = useCallback(async () => {
    if (!isPro) return;
    setLoadingPersonal(true);
    try {
      const data = (await customFetch("/api/soundboard/sounds")) as { personal: PersonalSound[] };
      setPersonalSounds(data.personal ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingPersonal(false);
    }
  }, [isPro]);

  useEffect(() => {
    void fetchPersonal();
  }, [fetchPersonal]);

  const flash = (key: string) => {
    setPlayingKey(key);
    setTimeout(() => setPlayingKey((prev) => (prev === key ? null : prev)), 750);
  };

  const handleSystemSound = (key: string) => {
    flash(key);
    playSoundKey(key); // play locally immediately
    sendSoundboardTrigger(key); // broadcast to others via LiveKit
  };

  const handlePersonalSound = (sound: PersonalSound) => {
    const pk = `personal:${sound.id}`;
    flash(pk);
    void playPersonalSound(sound.id, getApiBase()); // play locally
    sendSoundboardTrigger(pk); // broadcast to others
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 100);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("audio", file);
      const token = localStorage.getItem("gwh_token");
      const res = await fetch(`${getApiBase()}/api/soundboard/sounds`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        alert(err.error ?? "Upload failed");
        return;
      }
      await fetchPersonal();
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (soundId: number) => {
    try {
      await customFetch(`/api/soundboard/sounds/${soundId}`, { method: "DELETE" });
      setPersonalSounds((prev) => prev.filter((s) => s.id !== soundId));
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        background: "rgba(6,6,12,0.98)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderBottom: "none",
        zIndex: 20,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          🎵 Soundboard
        </span>
        <button onClick={onClose} className="p-0.5 hover:opacity-70 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* ── System sounds 4×2 grid ──────────────────────────────────────────── */}
      <div className="p-3 pb-2">
        <div className="grid grid-cols-4 gap-1.5">
          {SYSTEM_SOUNDS.map((s) => {
            const isPlaying = playingKey === s.key;
            return (
              <button
                key={s.key}
                onClick={() => handleSystemSound(s.key)}
                style={{
                  background: isPlaying ? `${s.color}28` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isPlaying ? s.color : "rgba(255,255,255,0.08)"}`,
                  boxShadow: isPlaying ? `0 0 8px ${s.color}44` : "none",
                  transition: "all 0.12s",
                }}
                className="py-2 flex flex-col items-center gap-0.5 font-mono rounded-none"
              >
                <span style={{ fontSize: 15 }}>{s.emoji}</span>
                <span
                  style={{
                    fontSize: 8,
                    letterSpacing: "0.12em",
                    color: isPlaying ? s.color : "rgba(255,255,255,0.65)",
                  }}
                >
                  {s.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Personal sounds (Pro only) ──────────────────────────────────────── */}
      {isPro && (
        <div
          className="px-3 pb-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8 }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              My Sounds
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || personalSounds.length >= 10}
              style={{ color: "rgba(163,163,163,0.85)" }}
              className="flex items-center gap-1 font-mono text-[9px] hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              {uploading ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Upload className="w-2.5 h-2.5" />
              )}
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav"
              className="hidden"
              onChange={handleUpload}
            />
          </div>

          {loadingPersonal ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            </div>
          ) : personalSounds.length === 0 ? (
            <p className="font-mono text-[9px] text-muted-foreground text-center py-2">
              No clips yet — upload MP3/OGG/WAV (≤ 5 s)
            </p>
          ) : (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {personalSounds.map((s) => {
                const pk = `personal:${s.id}`;
                const isPlaying = playingKey === pk;
                return (
                  <div
                    key={s.id}
                    style={{
                      background: isPlaying
                        ? "rgba(139,92,246,0.14)"
                        : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isPlaying ? "rgba(139,92,246,0.45)" : "rgba(255,255,255,0.06)"}`,
                    }}
                    className="flex items-center gap-2 px-2 py-1"
                  >
                    <button
                      className="flex-1 text-start font-mono text-[10px] truncate"
                      style={{ color: isPlaying ? "#8b5cf6" : "rgba(255,255,255,0.82)" }}
                      onClick={() => handlePersonalSound(s)}
                    >
                      ▶ {s.title}
                    </button>
                    <button
                      onClick={() => void handleDelete(s.id)}
                      className="p-0.5 hover:opacity-70 transition-opacity shrink-0"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-muted-foreground" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {personalSounds.length >= 10 && (
            <p className="font-mono text-[9px] text-muted-foreground mt-1 text-center">
              Max 10 clips reached
            </p>
          )}
        </div>
      )}

      {!isPro && (
        <div className="px-3 pb-3 pt-1">
          <p className="font-mono text-[9px] text-muted-foreground/50 text-center">
            ⭐ Pro members can upload custom clips
          </p>
        </div>
      )}
    </div>
  );
}
