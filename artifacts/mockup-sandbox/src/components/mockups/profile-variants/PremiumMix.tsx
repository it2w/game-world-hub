import { Crown, Gamepad2, Calendar, Radio, ExternalLink, UserPlus, Shield, Zap } from "lucide-react";

const BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80";
const AVATAR = "https://api.dicebear.com/9.x/avataaars/svg?seed=NAF&backgroundColor=0f172a";

export function PremiumMix() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex items-start justify-center" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      <div className="w-full max-w-3xl">

        <div className="bg-zinc-900 border border-zinc-800 overflow-hidden">

          {/* ── BANNER ─────────────────────────────────────── */}
          <div className="relative h-52 overflow-hidden">
            <img src={BANNER} alt="" className="w-full h-full object-cover scale-105" />
            {/* Multi-layer gradient: bottom heavy + left vignette */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/70 via-transparent to-transparent" />

            {/* Action button — top right */}
            <div className="absolute top-4 end-4">
              <button className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors shadow-lg shadow-green-500/20">
                <UserPlus className="w-3.5 h-3.5" /> Add Friend
              </button>
            </div>

            {/* Identity anchored to banner bottom — left side */}
            <div className="absolute bottom-0 start-0 end-0 px-6 pb-4 flex items-end gap-5">
              {/* Circular avatar — glowing ring, overlaps banner */}
              <div className="relative shrink-0 mb-[-40px]">
                <div className="w-28 h-28 rounded-full overflow-hidden bg-zinc-800"
                  style={{ boxShadow: "0 0 0 4px #18181b, 0 0 0 6px rgba(34,197,94,0.35), 0 8px 32px rgba(0,0,0,0.5)" }}>
                  <img src={AVATAR} alt="" className="w-full h-full object-cover" />
                </div>
                {/* Status dot */}
                <div className="absolute bottom-1 end-1 w-4 h-4 rounded-full bg-green-500 border-2 border-zinc-900 shadow shadow-green-500/50" />
              </div>

              {/* Name + Pro inside banner — visible over gradient */}
              <div className="pb-2 flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-4xl font-bold tracking-tighter uppercase text-white leading-none" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
                    NAF
                  </h1>
                  {/* Pro badge — glowing amber */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2.5 py-1 bg-gradient-to-r from-amber-500 to-yellow-300 text-black border border-yellow-400/60"
                    style={{ boxShadow: "0 0 12px rgba(245,158,11,0.4)" }}>
                    <Crown className="w-3.5 h-3.5 fill-black shrink-0" />
                    Pro
                  </span>
                </div>
                <p className="text-green-400 text-sm mt-1 font-mono">@naf_gaming</p>
              </div>
            </div>
          </div>

          {/* ── BODY ──────────────────────────────────────── */}
          <div className="pt-14 pb-6 px-6 space-y-5">

            {/* Bio */}
            <p className="text-zinc-400 border-s-2 border-green-500/40 ps-4 italic text-sm leading-relaxed font-mono">
              "Competitive gamer. Free Fire champion. Always grinding."
            </p>

            {/* ── RANK + XP BLOCK ─────── */}
            <div className="bg-zinc-950 border border-zinc-800 p-4 flex items-center gap-5">
              {/* Shield icon + tier */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 flex items-center justify-center text-2xl">🛡</div>
                <div>
                  <div className="text-green-400 text-xs font-bold uppercase tracking-widest">Scout</div>
                  <div className="text-zinc-600 text-[10px] uppercase tracking-wider">Div II</div>
                </div>
              </div>

              {/* Vertical divider */}
              <div className="w-px self-stretch bg-zinc-800 shrink-0" />

              {/* XP bar — takes remaining width */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5 font-mono">
                  <span className="flex items-center gap-1"><Zap className="w-2.5 h-2.5 text-green-500" /> XP Progress</span>
                  <span>600 / 662 <span className="text-green-400">▸ 74%</span></span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400"
                    style={{ width: "74%", boxShadow: "0 0 6px rgba(34,197,94,0.5)" }} />
                </div>
              </div>
            </div>

            {/* ── STATS ROW ─────── */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono">
                <Gamepad2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span className="text-zinc-600 uppercase tracking-widest text-[10px]">Now Playing</span>
                <span className="text-green-400 flex items-center gap-1">
                  <Radio className="w-3 h-3 animate-pulse" /> Free Fire
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-500 font-mono">
                <Calendar className="w-3.5 h-3.5 shrink-0" /> Member since 2026.07.13
              </div>
            </div>

            {/* ── SOCIAL LINKS ─────── */}
            <div>
              <p className="text-[9px] text-zinc-700 uppercase tracking-widest mb-2 font-mono">Channels</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "لاذرنيزي", color: "#9146FF" },
                  { label: "ريدمور",   color: "#FF4500" },
                  { label: "يوتيوب",  color: "#FF0000" },
                  { label: "تيلا",    color: "#1DA1F2" },
                ].map(s => (
                  <a key={s.label} href="#"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 border bg-zinc-950 hover:bg-zinc-800 transition-colors font-mono"
                    style={{ borderColor: s.color + "55", color: s.color }}>
                    {s.label}
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── BOTTOM ACCENT LINE ─── */}
          <div className="h-0.5 bg-gradient-to-r from-green-500/60 via-green-400/30 to-transparent" />
        </div>

        <p className="text-center text-[10px] text-zinc-700 uppercase tracking-widest mt-3 font-mono">
          ④ Premium Mix — مزيج Overlay + Player Card + Split Panel
        </p>
      </div>
    </div>
  );
}
