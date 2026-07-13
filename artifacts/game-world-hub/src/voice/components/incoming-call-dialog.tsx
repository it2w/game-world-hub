import { useVoice } from "../voice-context";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, PhoneOutgoing } from "lucide-react";

/**
 * Global prompts for the direct-call handshake: an incoming ringing dialog for
 * the callee and a "calling…" state for the caller. Rendered once in the Shell
 * so they surface on any page.
 */
export function CallOverlays() {
  const { incomingCall, outgoingCall, acceptCall, declineCall, cancelCall } = useVoice();

  if (incomingCall) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm">
        <div className="w-[340px] bg-card border border-border shadow-2xl">
          <div className="p-6 flex flex-col items-center text-center gap-4">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
              {incomingCall.from.avatarUrl ? (
                <img
                  src={incomingCall.from.avatarUrl}
                  alt=""
                  className="relative w-16 h-16 border border-border object-cover"
                />
              ) : (
                <div className="relative w-16 h-16 bg-muted border border-border flex items-center justify-center font-mono text-2xl">
                  {incomingCall.from.displayName.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="font-bold text-lg">{incomingCall.from.displayName}</div>
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1 animate-pulse">
                Incoming Call
              </div>
            </div>
            <div className="flex gap-3 w-full mt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-none font-mono text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={declineCall}
              >
                <PhoneOff className="w-4 h-4 mr-2" /> DECLINE
              </Button>
              <Button className="flex-1 rounded-none font-mono" onClick={() => void acceptCall()}>
                <Phone className="w-4 h-4 mr-2" /> ACCEPT
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (outgoingCall) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] bg-card border border-border shadow-xl px-5 py-3 flex items-center gap-4">
        <PhoneOutgoing className="w-4 h-4 text-primary animate-pulse" />
        <div className="font-mono text-sm">
          Calling <span className="font-bold">{outgoingCall.to.displayName}</span>…
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-none font-mono text-xs h-7 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          onClick={cancelCall}
        >
          CANCEL
        </Button>
      </div>
    );
  }

  return null;
}
