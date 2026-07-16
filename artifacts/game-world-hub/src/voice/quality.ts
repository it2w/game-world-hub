/**
 * Selectable quality presets for voice and screen sharing.
 *
 * Voice presets cap the Opus bitrate on the audio RTP sender. Screen presets
 * drive getDisplayMedia constraints (resolution + frame rate) and cap the
 * video RTP sender bitrate. All can be switched live mid-call.
 */

export type VoiceQuality = "low" | "medium" | "high";
export type ScreenQuality = "480p" | "720p" | "1080p";

export interface VoicePreset {
  label: string;
  maxBitrate: number; // bits per second
}

export interface ScreenPreset {
  label: string;
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number; // bits per second
}

export const VOICE_PRESETS: Record<VoiceQuality, VoicePreset> = {
  low:    { label: "Low · 32 kbps",   maxBitrate:  32_000 },
  medium: { label: "Medium · 64 kbps", maxBitrate:  64_000 },
  high:   { label: "High · 128 kbps", maxBitrate: 128_000 },
};

export const SCREEN_PRESETS: Record<ScreenQuality, ScreenPreset> = {
  // VP9 is used for all tiers — ~50% better compression than VP8.
  // Bitrates are set high so GCC/REMB has room to converge upward,
  // not downward (a too-low ceiling causes permanent quality degradation).
  "480p":  { label: "480p · 30fps",  width:  854, height:  480, frameRate: 30, maxBitrate:  3_000_000 },
  "720p":  { label: "720p · 60fps",  width: 1280, height:  720, frameRate: 60, maxBitrate:  6_000_000 },
  "1080p": { label: "1080p · 60fps", width: 1920, height: 1080, frameRate: 60, maxBitrate: 12_000_000 },
};

export const VOICE_QUALITY_ORDER: VoiceQuality[] = ["low", "medium", "high"];
export const SCREEN_QUALITY_ORDER: ScreenQuality[] = ["480p", "720p", "1080p"];

export const DEFAULT_VOICE_QUALITY: VoiceQuality = "medium";
export const DEFAULT_SCREEN_QUALITY: ScreenQuality = "720p";
