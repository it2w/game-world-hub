import { Crown, Gamepad2, Calendar, Radio, ExternalLink, UserPlus, Shield } from "lucide-react";

const BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80";
const AVATAR = "https://api.dicebear.com/9.x/avataaars/svg?seed=NAF&backgroundColor=0f172a";

function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono font-bold uppercase tracking-widest text-xs px-2.5 py-1 bg-gradient-to-r from-amber-500 to-yellow-300 text-black border border-yellow-400/60 shadow shadow-yellow-500/30">
      <Crown className="w-3.5 h-3.5 fill-black shrink-0" />
      Pro Member
    </span>
  );
}

export function SplitPanel() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex items-start justify-center font-mono">
      <div className="w-full max-w-3xl space-y-4">

        {/* Banner */}
        <div className="relative h-36 overflow-hidden border border-zinc-800">
          <img src={BANNER} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/95 via-zinc-900/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent" />
        </div>

        {/* Two-column body */}
        <div className="bg-zinc-900 border border-zinc-800 flex overflow-hidden -mt-8">

          {/* LEFT PANEL — Avatar + Tier + Status */}
          <div className="w-52 shrink-0 border-e border-zinc-800 p-5 flex flex-col items-center gap-4 bg-zinc-900/80">
            {/* Avatar — circular, overlaps banner */}
            <div className="relative -mt-16">
              <div className="w-28 h-28 rounded-full border-4 border-zinc-900 overflow-hidden bg-zinc-800 ring-2 ring-green-500/30">
                <img src={AVATAR} alt="" className="w-full h-full object-cover" />
              </div>
              {/* Status */}
              <div className="absolute bottom-1 end-1 flex items-center gap-1 bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[9px] text-green-400 uppercase tracking-wider">Online</span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full border-t border-zinc-800" />

            {/* Tier section */}
            <div className="text-center space-y-2 w-full">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest">Rank</p>
              <div className="bg-zinc-950 border border-green-500/20 p-3 flex flex-col items-center gap-1">
                <span className="text-2xl">🛡</span>
                <span className="text-green-400 text-xs font-bold uppercase tracking-wider">Scout</span>
                <span className="text-zinc-600 text-[10px]">Div II</span>
              </div>
              {/* XP bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-zinc-600">
                  <span>XP</span><span>600 / 62</span>
                </div>
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: "74%" }} />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full border-t border-zinc-800" />

            {/* Join date */}
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <Calendar className="w-3 h-3" />
              <span>2026.07.13</span>
            </div>
          </div>

          {/* RIGHT PANEL — Main content */}
          <div className="flex-1 p-6 space-y-4 min-w-0">

            {/* Name + action */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold tracking-tighter uppercase text-white leading-none">NAF</h1>
                <p className="text-green-400 text-sm mt-1">@naf_gaming</p>
              </div>
              <button className="shrink-0 flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors mt-1">
                <UserPlus className="w-3.5 h-3.5" /> Add Friend
              </button>
            </div>

            {/* Pro ribbon — full-width strip */}
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 px-4 py-2.5">
              <Crown className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
              <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Pro Member</span>
              <div className="flex-1 h-px bg-amber-500/20" />
              <span className="text-amber-500/50 text-[10px] uppercase tracking-widest">Active</span>
            </div>

            {/* Bio */}
            <p className="text-zinc-400 border-s-2 border-green-500/40 ps-4 italic text-sm leading-relaxed">
              "Competitive gamer. Free Fire champion. Always grinding."
            </p>

            {/* Active game */}
            <div className="flex items-center gap-2 text-xs bg-zinc-950 border border-zinc-800 px-3 py-2 w-fit">
              <Gamepad2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-zinc-500 uppercase tracking-widest text-[10px]">NOW PLAYING</span>
              <span className="text-green-400 flex items-center gap-1"><Radio className="w-3 h-3 animate-pulse" /> Free Fire</span>
            </div>

            {/* Social links */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { label: "لاذرنيزي", color: "#9146FF" },
                { label: "ريدمور", color: "#FF4500" },
                { label: "يوتيوب", color: "#FF0000" },
                { label: "تيلا", color: "#1DA1F2" },
              ].map(s => (
                <a key={s.label} href="#" className="flex items-center gap-1.5 text-xs px-3 py-1.5 border bg-zinc-950 hover:bg-zinc-800 transition-colors"
                  style={{ borderColor: s.color + "55", color: s.color }}>
                  {s.label}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 uppercase tracking-widest">③ Split Panel — عمودان + شريط Pro مميّز</p>
      </div>
    </div>
  );
}
