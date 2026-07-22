/**
 * System soundboard sounds — synthesised entirely via the Web Audio API.
 * No file downloads, no server round-trips. Falls back silently on
 * browsers that block autoplay.
 */

export interface SystemSound {
  key: string;
  title: string;
  emoji: string;
  color: string;
}

export const SYSTEM_SOUNDS: SystemSound[] = [
  { key: "gg",     title: "GG",     emoji: "🎉", color: "#22c55e" },
  { key: "lfg",    title: "LFG",    emoji: "🔥", color: "#f97316" },
  { key: "rip",    title: "RIP",    emoji: "💀", color: "#6366f1" },
  { key: "ez",     title: "EZ",     emoji: "😎", color: "#06b6d4" },
  { key: "clutch", title: "Clutch", emoji: "🎯", color: "#eab308" },
  { key: "hype",   title: "Hype",   emoji: "⚡", color: "#a855f7" },
  { key: "nope",   title: "Nope",   emoji: "🚫", color: "#ef4444" },
  { key: "lit",    title: "Lit",    emoji: "✨", color: "#ec4899" },
];

type Note = [number, number]; // [freq_hz, duration_s]

function playNotes(
  ctx: AudioContext,
  notes: Note[],
  waveform: OscillatorType = "triangle",
  vol = 0.28,
): void {
  let t = ctx.currentTime + 0.01;
  for (const [freq, dur] of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = waveform;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur * 0.72;
  }
}

/** Play a system sound by key using Web Audio API synthesis. */
export function playSoundKey(key: string): void {
  try {
    const ctx = new AudioContext();

    switch (key) {
      case "gg":
        // Triumphant ascending arpeggio  C4 E4 G4 C5
        playNotes(ctx, [[261, 0.28], [329, 0.28], [392, 0.28], [523, 0.48]], "triangle", 0.3);
        break;

      case "lfg":
        // Hype rising staccato
        playNotes(ctx, [[330, 0.1], [440, 0.1], [550, 0.1], [660, 0.14]], "square", 0.22);
        break;

      case "rip":
        // Sad descending minor
        playNotes(ctx, [[392, 0.38], [370, 0.38], [330, 0.38], [293, 0.55]], "sine", 0.22);
        break;

      case "ez":
        // Short triumphant riff
        playNotes(ctx, [[523, 0.11], [659, 0.11], [784, 0.24]], "triangle", 0.3);
        break;

      case "clutch": {
        // Dramatic build + hit
        playNotes(
          ctx,
          [[220, 0.09], [277, 0.09], [330, 0.09], [440, 0.09], [554, 0.28]],
          "sawtooth",
          0.2,
        );
        break;
      }

      case "hype": {
        // Rising sweep — 8 steps
        const steps: Note[] = ([200, 250, 310, 390, 480, 590, 720, 900] as number[]).map(
          (f, i) => [f, 0.075 + i * 0.008] as Note,
        );
        playNotes(ctx, steps, "sine", 0.2);
        break;
      }

      case "nope": {
        // Buzzer descend
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(70, ctx.currentTime + 0.45);
        g.gain.setValueAtTime(0.28, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.55);
        break;
      }

      case "lit":
        // Bright high sparkle
        playNotes(
          ctx,
          [[880, 0.07], [1046, 0.07], [1318, 0.07], [1046, 0.07], [1318, 0.14]],
          "triangle",
          0.18,
        );
        break;

      default:
        break;
    }

    // Auto-close context after all sounds finish to prevent resource leak
    setTimeout(() => void ctx.close(), 3_000);
  } catch {
    // Autoplay policy or no AudioContext — ignore silently
  }
}

/** Fetch a personal sound from the API and play it via HTMLAudioElement. */
export async function playPersonalSound(soundId: number, apiBase: string): Promise<void> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("gwh_token") : null;
  try {
    const res = await fetch(`${apiBase}/api/soundboard/sounds/${soundId}/audio`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url));
    await audio.play();
  } catch {
    // Autoplay policy or fetch error — ignore
  }
}
