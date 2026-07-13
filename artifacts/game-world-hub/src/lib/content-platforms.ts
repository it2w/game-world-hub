import { Twitch, Youtube, Music2, Radio, type LucideIcon } from "lucide-react";

export type ContentPlatformKey = "twitch" | "youtube" | "tiktok" | "kick";

export interface ContentPlatformMeta {
  key: ContentPlatformKey;
  label: string;
  icon: LucideIcon;
  /** Brand accent color, used for borders/glyphs on the dark UI. */
  color: string;
  placeholder: string;
}

export const CONTENT_PLATFORMS: Record<ContentPlatformKey, ContentPlatformMeta> = {
  twitch: { key: "twitch", label: "Twitch", icon: Twitch, color: "#9146FF", placeholder: "channel name" },
  youtube: { key: "youtube", label: "YouTube", icon: Youtube, color: "#FF0000", placeholder: "handle (without @)" },
  tiktok: { key: "tiktok", label: "TikTok", icon: Music2, color: "#25F4EE", placeholder: "handle (without @)" },
  kick: { key: "kick", label: "Kick", icon: Radio, color: "#53FC18", placeholder: "channel name" },
};

export const CONTENT_PLATFORM_KEYS = Object.keys(CONTENT_PLATFORMS) as ContentPlatformKey[];

export function contentMeta(platform: string): ContentPlatformMeta | undefined {
  return CONTENT_PLATFORMS[platform as ContentPlatformKey];
}
