import { Trans, useTranslation } from "react-i18next";
import { useVoice } from "../voice-context";
import { Phone, PhoneOff, PhoneOutgoing, X, Check } from "lucide-react";

const STYLE = `
@keyframes gwh-call-sweep {
  0%   { left: -40%; }
  100% { left: 140%; }
}
@keyframes gwh-call-shrink {
  0%   { width: 100%; }
  100% { width: 0%; }
}
@keyframes gwh-call-ping {
  0%   { transform: scale(1);   opacity: 0.6; }
  100% { transform: scale(1.5); opacity: 0;   }
}
@keyframes gwh-call-blink {
  0%, 100% { opacity: 1;   }
  50%       { opacity: 0.3; }
}
.gwh-call-sweep  { animation: gwh-call-sweep 2.4s linear infinite; }
.gwh-call-shrink { animation: gwh-call-shrink 45s linear forwards; }
.gwh-call-ping   { animation: gwh-call-ping 1.8s ease-out infinite; }
.gwh-call-blink  { animation: gwh-call-blink 1.4s ease-in-out infinite; }
`;

/**
 * Global prompts for the direct-call handshake.
 * Incoming ringing dialog for the callee + "calling…" banner for the caller.
 */
export function CallOverlays() {
  const { t } = useTranslation("common");
  const { incomingCall, outgoingCall, acceptCall, declineCall, cancelCall } = useVoice();

  if (incomingCall) {
    return (
      <>
        <style>{STYLE}</style>
        {/* Full-screen dark backdrop */}
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(4,4,12,.88)", backdropFilter: "blur(10px)" }}
        >
          {/* ── Incoming call card ──────────────────────────────── */}
          <div
            className="w-[340px] overflow-hidden relative flex font-mono"
            style={{
              background: "linear-gradient(180deg, #0e0e1e, #080812)",
              border: "1px solid rgba(var(--primary-rgb,0,255,65),0.2)",
              boxShadow:
                "0 40px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(var(--primary-rgb,0,255,65),0.06)",
            }}
          >
            {/* Left accent bar */}
            <div
              className="w-[3px] shrink-0"
              style={{
                background:
                  "linear-gradient(180deg, hsl(var(--primary)), rgba(var(--primary-rgb,0,255,65),0.15))",
              }}
            />

            <div className="flex-1 flex flex-col">
              {/* Scanning line */}
              <div
                className="h-[1px] w-full relative overflow-hidden"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div
                  className="gwh-call-sweep absolute top-0 w-1/4 h-full pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)",
                  }}
                />
              </div>

              <div className="p-5 flex items-center gap-4">
                {/* Avatar with pulse ring */}
                <div className="relative shrink-0">
                  <div
                    className="w-[62px] h-[62px] flex items-center justify-center text-2xl font-bold relative z-10"
                    style={{
                      background: "linear-gradient(135deg, #182818, #0f1220)",
                      border: "1px solid rgba(var(--primary-rgb,0,255,65),0.45)",
                      boxShadow: "0 0 24px rgba(var(--primary-rgb,0,255,65),0.22)",
                      color: "hsl(var(--primary))",
                    }}
                  >
                    {incomingCall.from.avatarUrl ? (
                      <img
                        src={incomingCall.from.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      incomingCall.from.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  {/* Pulse ring */}
                  <div
                    className="gwh-call-ping absolute inset-[-8px] pointer-events-none"
                    style={{ border: "1px solid rgba(var(--primary-rgb,0,255,65),0.3)" }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className="text-[9px] uppercase tracking-[0.2em] mb-1"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    {t("call.incoming")}
                  </div>
                  <div className="text-[16px] font-bold tracking-wide text-white truncate mb-0.5">
                    {incomingCall.from.displayName}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "hsl(var(--primary))" }}>
                    <span
                      className="gwh-call-blink w-1.5 h-1.5 shrink-0 inline-block"
                      style={{ background: "hsl(var(--primary))" }}
                    />
                    {t("call.incomingLabel")}
                  </div>
                </div>
              </div>

              {/* Countdown timer bar */}
              <div className="h-[2px] w-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="gwh-call-shrink h-full"
                  style={{
                    background: "hsl(var(--primary))",
                    boxShadow: "0 0 6px hsl(var(--primary))",
                  }}
                />
              </div>

              {/* Action buttons */}
              <div className="flex">
                <button
                  onClick={declineCall}
                  className="flex-1 h-12 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-all"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    borderTop: "1px solid rgba(239,68,68,0.15)",
                    borderRight: "1px solid rgba(239,68,68,0.1)",
                    color: "#ef4444",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.18)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)";
                  }}
                >
                  <X className="w-4 h-4" /> {t("call.decline")}
                </button>

                <button
                  onClick={() => void acceptCall()}
                  className="flex-1 h-12 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-all"
                  style={{ background: "hsl(var(--primary))", color: "#000" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = "0.88";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = "1";
                  }}
                >
                  <Check className="w-4 h-4" /> {t("call.accept")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (outgoingCall) {
    return (
      <>
        <style>{STYLE}</style>
        {/* ── Outgoing call banner ──────────────────────────────── */}
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] w-[440px] overflow-hidden font-mono"
          style={{
            background: "linear-gradient(180deg, #0e0e1e, #080812)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
          }}
        >
          {/* Scanning line */}
          <div
            className="h-[1px] w-full relative overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div
              className="gwh-call-sweep absolute top-0 w-1/4 h-full pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(var(--primary-rgb,0,255,65),0.8), transparent)",
              }}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {/* Callee avatar */}
              <div className="relative w-9 h-9 shrink-0">
                <div
                  className="w-full h-full flex items-center justify-center text-[13px] font-bold"
                  style={{
                    background: "#111122",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#aaaacc",
                  }}
                >
                  {outgoingCall.to.avatarUrl ? (
                    <img
                      src={outgoingCall.to.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    outgoingCall.to.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                {/* Pulsing amber dot */}
                <span
                  className="absolute -bottom-[3px] -right-[3px] w-2 h-2 animate-pulse"
                  style={{
                    background: "#f59e0b",
                    boxShadow: "0 0 6px #f59e0b",
                  }}
                />
              </div>

              <div className="min-w-0">
                <div className="text-[12px] font-bold text-white/90 truncate">
                  <Trans
                    i18nKey="call.calling"
                    ns="common"
                    values={{ name: outgoingCall.to.displayName }}
                    components={[<span className="text-foreground" />]}
                  />
                </div>
                <div className="text-[10px] text-white/35 truncate">
                  @{outgoingCall.to.username}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[9px] text-white/25 uppercase tracking-widest hidden sm:inline">
                {t("call.tapToCancel")}
              </span>
              <button
                onClick={cancelCall}
                className="w-8 h-8 flex items-center justify-center transition-all"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#ef4444",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.22)";
                  (e.currentTarget as HTMLElement).style.borderColor = "#ef4444";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(239,68,68,0.3)";
                }}
                title={t("call.cancel")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}
