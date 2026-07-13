/**
 * A single WebRTC peer connection wrapper implementing the "perfect
 * negotiation" pattern (https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation).
 *
 * Each pair of users in a voice room maintains one Peer on each side. Media
 * flows directly peer-to-peer; only SDP + ICE are relayed through the signaling
 * server. The `polite` flag (derived deterministically from the two user ids)
 * resolves offer glare so simultaneous renegotiations — e.g. both peers adding
 * a screen-share track at once — never deadlock.
 */

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // ── Production TURN placeholder ──────────────────────────────────────────
  // Peer-to-peer connections fail across strict/symmetric NATs and many
  // corporate networks. For reliable connectivity in production, run a TURN
  // server (e.g. coturn) and add it here with real credentials:
  //
  // { urls: "turn:turn.your-domain.com:3478", username: "USER", credential: "SECRET" },
];

export interface PeerCallbacks {
  /** Send a signaling payload ({ description } or { candidate }) to the remote peer. */
  sendSignal: (data: unknown) => void;
  onRemoteAudio: (stream: MediaStream) => void;
  onRemoteScreen: (stream: MediaStream | null) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}

export class Peer {
  readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private readonly cb: PeerCallbacks;

  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;

  private micSender: RTCRtpSender | null = null;
  private screenSender: RTCRtpSender | null = null;

  constructor(cb: PeerCallbacks, polite: boolean, iceServers: RTCIceServer[] = ICE_SERVERS) {
    this.cb = cb;
    this.polite = polite;
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.cb.sendSignal({ candidate });
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        this.cb.sendSignal({ description: this.pc.localDescription });
      } catch (err) {
        console.error("[voice] onnegotiationneeded failed", err);
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionStateChange(this.pc.connectionState);
    };

    this.pc.ontrack = ({ track, streams }) => {
      const stream = streams[0];
      if (!stream) return;
      if (track.kind === "audio") {
        this.cb.onRemoteAudio(stream);
      } else {
        this.cb.onRemoteScreen(stream);
        const clear = () => this.cb.onRemoteScreen(null);
        track.addEventListener("ended", clear);
        track.addEventListener("mute", clear);
      }
    };
  }

  /** Handle an inbound signaling payload from the remote peer. */
  async handleSignal(data: any): Promise<void> {
    try {
      if (data?.description) {
        const description = data.description as RTCSessionDescriptionInit;
        const readyForOffer =
          !this.makingOffer &&
          (this.pc.signalingState === "stable" || this.isSettingRemoteAnswerPending);
        const offerCollision = description.type === "offer" && !readyForOffer;

        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) return;

        this.isSettingRemoteAnswerPending = description.type === "answer";
        await this.pc.setRemoteDescription(description);
        this.isSettingRemoteAnswerPending = false;

        if (description.type === "offer") {
          await this.pc.setLocalDescription();
          this.cb.sendSignal({ description: this.pc.localDescription });
        }
      } else if (data?.candidate) {
        try {
          await this.pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.error("[voice] handleSignal failed", err);
    }
  }

  /** Attach or replace the outgoing microphone track. Adding fires renegotiation. */
  setMicTrack(track: MediaStreamTrack | null, stream: MediaStream): void {
    if (this.micSender) {
      void this.micSender.replaceTrack(track);
    } else if (track) {
      this.micSender = this.pc.addTrack(track, stream);
    }
  }

  /** Attach, replace, or remove the outgoing screen-share track. */
  setScreenTrack(track: MediaStreamTrack | null, stream?: MediaStream): void {
    if (this.screenSender) {
      if (track) {
        void this.screenSender.replaceTrack(track);
      } else {
        this.pc.removeTrack(this.screenSender);
        this.screenSender = null;
      }
    } else if (track && stream) {
      this.screenSender = this.pc.addTrack(track, stream);
    }
  }

  applyAudioBitrate(maxBitrate: number): void {
    this.applyEncoding(this.micSender, { maxBitrate });
  }

  applyScreenParams(maxBitrate: number, maxFramerate: number): void {
    this.applyEncoding(this.screenSender, { maxBitrate, maxFramerate });
  }

  private applyEncoding(sender: RTCRtpSender | null, patch: RTCRtpEncodingParameters): void {
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    Object.assign(params.encodings[0], patch);
    void sender.setParameters(params).catch(() => {
      /* some browsers reject live param changes; safe to ignore */
    });
  }

  close(): void {
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onnegotiationneeded = null;
    this.pc.onconnectionstatechange = null;
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Derives the WebSocket signaling URL. Mirrors the API base resolution in
 * `lib/api.ts`: in the desktop shell we talk to the bundled server over an
 * absolute URL; in the browser the signaling path is proxied under the current
 * origin at `/api/ws`.
 */
export function getSignalingUrl(token: string): string {
  const electronBase = window.electronAPI?.apiBaseUrl;
  let base: string;
  if (electronBase) {
    base = electronBase.replace(/^http/i, "ws");
  } else {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    base = `${proto}//${window.location.host}`;
  }
  return `${base.replace(/\/+$/, "")}/api/ws?token=${encodeURIComponent(token)}`;
}
