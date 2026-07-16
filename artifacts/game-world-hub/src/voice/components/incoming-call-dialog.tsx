import { Trans, useTranslation } from "react-i18next";
import { useVoice } from "../voice-context";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, PhoneOutgoing } from "lucide-react";

const STYLE = `
@keyframes gwh-ripple {
  0%   { transform:scale(1);   opacity:.6 }
  100% { transform:scale(2.4); opacity:0  }
}
.gwh-ripple-1 { animation: gwh-ripple 1.8s ease-out infinite; }
.gwh-ripple-2 { animation: gwh-ripple 1.8s ease-out .6s infinite; }
.gwh-ripple-3 { animation: gwh-ripple 1.8s ease-out 1.2s infinite; }
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
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(5,5,10,.85)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="w-[340px] font-mono"
            style={{ background: "#0d0d14", border: "1px solid #2a2a3a", boxShadow: "0 25px 60px rgba(0,0,0,.8)" }}
          >
            {/* Top accent bar */}
            <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg,#22c55e,#16a34a)" }} />

            <div className="p-8 flex flex-col items-center text-center gap-5">
              {/* Avatar with ripple rings */}
              <div className="relative flex items-center justify-center w-20 h-20">
                {/* concentric ripple rings */}
                <span
                  className="gwh-ripple-3 absolute w-full h-full rounded-full"
                  style={{ background: "rgba(34,197,94,.15)" }}
                />
                <span
                  className="gwh-ripple-2 absolute w-full h-full rounded-full"
                  style={{ background: "rgba(34,197,94,.2)" }}
                />
                <span
                  className="gwh-ripple-1 absolute w-full h-full rounded-full"
                  style={{ background: "rgba(34,197,94,.25)" }}
                />
                {/* Avatar */}
                <div
                  className="relative w-20 h-20 overflow-hidden"
                  style={{ outline: "2px solid #22c55e", outlineOffset: "2px" }}
                >
                  {incomingCall.from.avatarUrl ? (
                    <img
                      src={incomingCall.from.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-3xl font-bold"
                      style={{ background: "#1a1a24", color: "#9b9baa" }}
                    >
                      {incomingCall.from.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              {/* Caller info */}
              <div>
                <div className="text-lg font-bold tracking-wide text-foreground">
                  {incomingCall.from.displayName}
                </div>
                <div
                  className="text-[11px] uppercase tracking-[0.2em] mt-1.5 animate-pulse"
                  style={{ color: "#22c55e" }}
                >
                  {t("call.incoming")}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 w-full">
                {/* Decline */}
                <button
                  onClick={declineCall}
                  className="flex-1 flex items-center justify-center gap-2 h-11 font-mono text-sm uppercase tracking-widest transition-all"
                  style={{
                    background: "rgba(239,68,68,.12)",
                    color: "#f87171",
                    border: "1px solid rgba(239,68,68,.3)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,.22)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,.12)";
                  }}
                >
                  <PhoneOff className="w-4 h-4" /> {t("call.decline")}
                </button>

                {/* Accept */}
                <button
                  onClick={() => void acceptCall()}
                  className="flex-1 flex items-center justify-center gap-2 h-11 font-mono text-sm uppercase tracking-widest transition-all text-black font-bold"
                  style={{ background: "#22c55e" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#16a34a";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#22c55e";
                  }}
                >
                  <Phone className="w-4 h-4" /> {t("call.accept")}
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
      <div
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-4 px-5 py-3 font-mono"
        style={{
          background: "#0d0d14",
          border: "1px solid #2a2a3a",
          boxShadow: "0 10px 40px rgba(0,0,0,.6)",
        }}
      >
        {/* Animated ring + icon */}
        <span className="relative flex items-center justify-center w-7 h-7 shrink-0">
          <span
            className="absolute w-full h-full rounded-full animate-ping"
            style={{ background: "rgba(34,197,94,.25)", animationDuration: "1.2s" }}
          />
          <PhoneOutgoing className="relative w-4 h-4" style={{ color: "#22c55e" }} />
        </span>

        <div className="text-[13px]">
          <Trans
            i18nKey="call.calling"
            ns="common"
            values={{ name: outgoingCall.to.displayName }}
            components={[<span className="font-bold text-foreground" />]}
          />
        </div>

        <button
          onClick={cancelCall}
          className="text-[11px] uppercase tracking-widest px-3 h-7 transition-all font-mono"
          style={{
            color: "#f87171",
            border: "1px solid rgba(239,68,68,.3)",
            background: "rgba(239,68,68,.08)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,.18)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,.08)";
          }}
        >
          {t("call.cancel")}
        </button>
      </div>
    );
  }

  return null;
}
