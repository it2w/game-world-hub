/**
 * Lightweight speaking / voice-activity detector.
 *
 * Feeds one or more audio MediaStreams through a shared AudioContext and
 * reports, via a single requestAnimationFrame loop, when each source crosses a
 * loudness threshold. Used to drive "who is talking" indicators for the local
 * user and every remote peer.
 */

const SPEAKING_THRESHOLD = 14; // average byte magnitude (0-255)
const RELEASE_FRAMES = 12; // frames below threshold before marking silent

interface Source {
  analyser: AnalyserNode;
  node: MediaStreamAudioSourceNode;
  data: Uint8Array<ArrayBuffer>;
  speaking: boolean;
  quietFrames: number;
}

export class SpeakingDetector {
  private ctx: AudioContext | null = null;
  private sources = new Map<string, Source>();
  private raf = 0;
  private readonly onChange: (id: string, speaking: boolean) => void;

  constructor(onChange: (id: string, speaking: boolean) => void) {
    this.onChange = onChange;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
      this.loop();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  add(id: string, stream: MediaStream): void {
    if (stream.getAudioTracks().length === 0) return;
    this.remove(id);
    const ctx = this.ensureCtx();
    const node = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    node.connect(analyser);
    this.sources.set(id, {
      analyser,
      node,
      data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      speaking: false,
      quietFrames: 0,
    });
  }

  remove(id: string): void {
    const s = this.sources.get(id);
    if (!s) return;
    try {
      s.node.disconnect();
    } catch {
      /* ignore */
    }
    this.sources.delete(id);
    if (s.speaking) this.onChange(id, false);
  }

  private loop = (): void => {
    for (const [id, s] of this.sources) {
      s.analyser.getByteFrequencyData(s.data);
      let sum = 0;
      for (let i = 0; i < s.data.length; i++) sum += s.data[i];
      const avg = sum / s.data.length;

      if (avg > SPEAKING_THRESHOLD) {
        s.quietFrames = 0;
        if (!s.speaking) {
          s.speaking = true;
          this.onChange(id, true);
        }
      } else if (s.speaking) {
        s.quietFrames += 1;
        if (s.quietFrames > RELEASE_FRAMES) {
          s.speaking = false;
          this.onChange(id, false);
        }
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  close(): void {
    cancelAnimationFrame(this.raf);
    for (const id of Array.from(this.sources.keys())) this.remove(id);
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
