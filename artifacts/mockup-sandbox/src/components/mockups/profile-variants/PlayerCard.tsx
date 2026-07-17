import { Crown, Gamepad2, Calendar, Radio, ExternalLink, UserPlus, Shield, CheckCircle2 } from "lucide-react";

const BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80";
const AVATAR = "https://api.dicebear.com/9.x/avataaars/svg?seed=NAF&backgroundColor=0f172a";

function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono font-bold uppercase tracking-widest text-xs px-2.5 py-1 rounded bg-gradient-to-r from-amber-500 to-yellow-300 text-black border border-yellow-400/60 shadow shadow-yellow-500/30">
      <Crown className="w-3.5 h-3.5 fill-black shrink-0" />
      Pro
    </span>
  );
}

export function PlayerCard() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex items-start justify-center font-mono">
      <div className="w-full max-w-3xl space-y-4">

        <div className="bg-zinc-900 border border-zinc-800 overflow-hidden">

          {/* Banner strip — shorter */}
          <div className="relative h-32 overflow-hidden">
            <img src={BANNER} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-900/40 to-zinc-900" />
            {/* Buttons float top-right */}
            <div className="absolute top-3 end-4 flex gap-2">
              <button className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> Add Friend
              </button>
            </div>
          </div>

          {/* Avatar + Info — horizontal, avatar overlaps banner */}
          <div className="flex gap-6 px-6 -mt-14 pb-6 items-end">

            {/* Square avatar with status */}
            <div className="relative shrink-0">
              <div className="w-28 h-28 border-4 border-zinc-900 overflow-hidden bg-zinc-800">
                <img src={AVATAR} alt="" className="w-full h-full object-cover" />
              </div>
              {/* Status pill */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-zinc-900 border border-zinc-700 px-2 py-0.5 rounded-full text-[10px] text-green-400 font-bold uppercase tracking-wider whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                Online
              </div>
            </div>

            {/* Identity column */}
            <div className="flex-1 pb-1 min-w-0">
              {/* Name */}
              <h1 className="text-3xl font-bold tracking-tighter uppercase text-white leading-none truncate">NAF</h1>

              {/* Handle + Pro badge in one row */}
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                <span className="text-green-400 text-sm">@naf_gaming</span>
                <span className="text-zinc-700">·</span>
                <ProBadge />
              </div>

              {/* Tier chips */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-1 border border-green-500/40 text-green-400 bg-green-500/10 uppercase tracking-widest">🛡 Scout</span>
                <span className="text-[10px] font-bold px-2 py-1 border border-green-500/40 text-green-400 bg-green-500/10 uppercase tracking-widest">✦ Div II</span>
                <span className="text-[10px] text-zinc-500">XP 600 / 62</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800 mx-6" />

          {/* Body */}
          <div className="p-6 space-y-4">

            {/* Bio */}
            <p className="text-zinc-400 border-s-2 border-green-500/40 ps-4 italic text-sm leading-relaxed">
              "Competitive gamer. Free Fire champion. Always grinding."
            </p>

            {/* Stats row */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs bg-zinc-950 border border-zinc-800 px-3 py-2">
                <Gamepad2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-zinc-500 uppercase tracking-widest text-[10px]">ACTIVE</span>
                <span className="text-green-400 flex items-center gap-1"><Radio className="w-3 h-3 animate-pulse" /> Free Fire</span>
              </div>
              <div className="flex items-center gap-2 text-xs bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-500">
                <Calendar className="w-3.5 h-3.5" /> 2026.07.13
              </div>
            </div>

            {/* Social links */}
            <div className="flex flex-wrap gap-2">
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

        <p className="text-center text-xs text-zinc-600 uppercase tracking-widest">② Player Card — بطاقة لاعب منظّمة</p>
      </div>
    </div>
  );
}
