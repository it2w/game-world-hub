/**
 * StageLayout — rendered inside VoicePanel when the active room is a stage channel.
 *
 * Layout:
 *   ┌─ STAGE header ────────────────┐
 *   │  Speakers row (speaking rings) │
 *   ├───────────────────────────────┤
 *   │  Audience list + hand-raise    │
 *   └───────────────────────────────┘
 *
 * Room owner sees "Grant" buttons next to hand-raised audience members.
 * Audience members see a "✋ Request to Speak" / "Lower Hand" button.
 */

import { useMemo } from "react";
import { Hand, Mic, MicOff, Crown } from "lucide-react";
import { useVoice, type StageParticipant } from "../voice-context";
import { useGetMe } from "@workspace/api-client-react";

/* ── Avatar helpers (mirror those in voice-panel.tsx) ─────────────────────── */
const COLORS = [
  "#3b82f6","#8b5cf6","#ec4899","#f59e0b",
  "#10b981","#06b6d4","#f97316","#e11d48",
];
function nameColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}
function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
}

/* ── Small avatar used in speakers row ─────────────────────────────────────── */
function SpeakerAvatar({
  participant,
  isSpeaking,
  isMuted,
}: {
  participant: StageParticipant;
  isSpeaking: boolean;
  isMuted: boolean;
}) {
  const color = nameColor(participant.displayName);
  return (
    <div className="flex flex-col items-center gap-1 min-w-0" style={{ width: 52 }}>
      <div style={{ position: "relative", width: 44, height: 44 }}>
        {/* Speaking ring */}
        {isSpeaking && (
          <div
            style={{
              position: "absolute",
              inset: -3,
              borderRadius: "50%",
              border: "2px solid #f59e0b",
              opacity: 0.9,
              animation: "pulse 1s ease-in-out infinite",
            }}
          />
        )}
        {/* Avatar */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: `2px solid ${isSpeaking ? "#f59e0b" : "rgba(255,255,255,0.12)"}`,
            overflow: "hidden",
            background: participant.avatarUrl ? undefined : color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
              {initials(participant.displayName)}
            </span>
          )}
        </div>
        {/* Muted badge */}
        {isMuted && (
          <div
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "rgba(239,68,68,0.9)",
              border: "1px solid rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MicOff style={{ width: 8, height: 8, color: "#fff" }} />
          </div>
        )}
      </div>
      <span
        className="font-mono truncate w-full text-center"
        style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", letterSpacing: "0.05em" }}
      >
        {participant.displayName}
      </span>
    </div>
  );
}

/* ── Audience row ─────────────────────────────────────────────────────────── */
function AudienceRow({
  participant,
  isOwner,
  onGrant,
}: {
  participant: StageParticipant;
  isOwner: boolean;
  onGrant: (userId: number) => void;
}) {
  const color = nameColor(participant.displayName);
  return (
    <div className="flex items-center gap-2 px-2 py-1" style={{ minHeight: 28 }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: participant.avatarUrl ? undefined : color,
          overflow: "hidden",
          flexShrink: 0,
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {participant.avatarUrl ? (
          <img
            src={participant.avatarUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: 8,
              fontWeight: 700,
              color: "#fff",
              fontFamily: "monospace",
            }}
          >
            {initials(participant.displayName)}
          </span>
        )}
      </div>
      <span
        className="flex-1 font-mono truncate"
        style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}
      >
        {participant.displayName}
      </span>

      {/* Hand raised indicator */}
      {participant.handRaised && (
        <Hand
          style={{ width: 11, height: 11, color: "#f59e0b", flexShrink: 0 }}
        />
      )}

      {/* Grant button — visible to owner only when hand is raised */}
      {isOwner && participant.handRaised && (
        <button
          onClick={() => onGrant(participant.userId)}
          style={{
            background: "rgba(245,158,11,0.15)",
            border: "1px solid rgba(245,158,11,0.4)",
            color: "#f59e0b",
            fontSize: 8,
            padding: "1px 6px",
            fontFamily: "monospace",
            letterSpacing: "0.1em",
            flexShrink: 0,
          }}
          className="hover:opacity-80 transition-opacity"
        >
          GRANT
        </button>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export function StageLayout() {
  const { stageInfo, peers, raiseHand, grantSpeaker, revokeSpeaker } = useVoice();
  const { data: me } = useGetMe();
  const myUserId = me?.id ?? 0;

  // Drive moderation controls from the authoritative ownerId returned by the API,
  // not from list position — which is unstable across reconnects.
  const isOwner = useMemo(() => {
    if (!stageInfo || !myUserId || stageInfo.ownerId == null) return false;
    return myUserId === stageInfo.ownerId;
  }, [stageInfo, myUserId]);

  if (!stageInfo?.isStageRoom) return null;

  const speakers  = stageInfo.participants.filter((p) => p.role === "speaker");
  const audience  = stageInfo.participants.filter((p) => p.role === "audience");
  const myInfo    = stageInfo.participants.find((p) => p.userId === myUserId);
  const myRole    = stageInfo.myRole;
  const handRaised = myInfo?.handRaised ?? false;

  // Check speaking state from LiveKit peers
  const speakingMap = useMemo(() => {
    const m: Record<number, boolean> = {};
    for (const p of peers) { m[p.userId] = p.speaking; m[p.userId] = p.speaking; }
    return m;
  }, [peers]);
  const mutedMap = useMemo(() => {
    const m: Record<number, boolean> = {};
    for (const p of peers) m[p.userId] = p.muted;
    return m;
  }, [peers]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* ── Speakers section ─────────────────────────────────────────────── */}
      <div
        style={{ borderBottom: "1px solid rgba(245,158,11,0.15)" }}
        className="px-3 pt-3 pb-2"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Mic style={{ width: 9, height: 9, color: "#f59e0b" }} />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ fontSize: 8, color: "#f59e0b" }}
          >
            On Stage
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 8, color: "rgba(245,158,11,0.5)", marginLeft: "auto" }}
          >
            {speakers.length}
          </span>
        </div>

        {speakers.length === 0 ? (
          <p
            className="font-mono text-center py-2"
            style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}
          >
            No speakers yet
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {speakers.map((sp) => (
              <div key={sp.userId} style={{ position: "relative" }}>
                <SpeakerAvatar
                  participant={sp}
                  isSpeaking={speakingMap[sp.userId] ?? false}
                  isMuted={mutedMap[sp.userId] ?? false}
                />
                {/* Owner badge on the actual room owner (authoritative ownerId) */}
                {sp.userId === stageInfo.ownerId && (
                  <Crown
                    style={{
                      position: "absolute",
                      top: -4,
                      left: -4,
                      width: 12,
                      height: 12,
                      color: "#f59e0b",
                    }}
                  />
                )}
                {/* Revoke button for owner — only on non-owner speakers */}
                {isOwner && sp.userId !== myUserId && (
                  <button
                    onClick={() => void revokeSpeaker(sp.userId)}
                    title="Revoke speaker"
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "rgba(239,68,68,0.7)",
                      border: "1px solid rgba(239,68,68,0.9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                    }}
                    className="hover:opacity-80 transition-opacity"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Audience section ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}
          >
            Audience
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginLeft: "auto" }}
          >
            {audience.length}
          </span>
        </div>

        {audience.length === 0 ? (
          <p
            className="font-mono text-center py-2"
            style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}
          >
            No audience
          </p>
        ) : (
          <div>
            {audience.map((p) => (
              <AudienceRow
                key={p.userId}
                participant={p}
                isOwner={isOwner}
                onGrant={(uid) => void grantSpeaker(uid)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Audience self-controls ───────────────────────────────────────── */}
      {myRole === "audience" && (
        <div
          className="px-3 pb-2 pt-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <button
            onClick={() => void raiseHand(!handRaised)}
            style={{
              width: "100%",
              background: handRaised
                ? "rgba(245,158,11,0.18)"
                : "rgba(255,255,255,0.05)",
              border: `1px solid ${handRaised ? "rgba(245,158,11,0.55)" : "rgba(255,255,255,0.1)"}`,
              color: handRaised ? "#f59e0b" : "rgba(255,255,255,0.65)",
              padding: "6px 0",
              fontFamily: "monospace",
              fontSize: 10,
              letterSpacing: "0.12em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            className="hover:opacity-85 transition-opacity"
          >
            <Hand style={{ width: 11, height: 11 }} />
            {handRaised ? "Lower Hand" : "Request to Speak"}
          </button>
        </div>
      )}
    </div>
  );
}
