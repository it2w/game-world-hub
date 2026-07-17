import { Crown, Gamepad2, Calendar, Radio, ExternalLink, UserPlus, Shield } from "lucide-react";

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

function StatusDot({ status }: { status: "online" | "offline" | "away" }) {
  const colors = { online: "bg-green-500", offline: "bg-zinc-500", away: "bg-yellow-500" };
  return <span className={`inline-block w-3 h-3 rounded-full border-2 border-zinc-900 ${colors[status]}`} />;
}

export function Overlay() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex items-start justify-center font-mono">
      <div className="w-full max-w-3xl space-y-4">

        {/* Profile Card */}
        <div className="bg-zinc-900 border border-zinc-800 overflow-hidden">

          {/* Banner — tall with overlay gradient */}
          <div className="relative h-56 overflow-hidden">
            <img src={BANNER} alt="" className="w-full h-full object-cover" />
            {/* gradient: transparent top → heavy bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent" />

            {/* Friend button — top right */}
            <div className="absolute top-4 end-4">
              <button className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> Add Friend
              </button>
            </div>

            {/* Identity — bottom left INSIDE banner */}
            <div className="absolute bottom-0 start-0 p-5 flex items-end gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-24 h-24 rounded-full border-4 border-zinc-900 overflow-hidden bg-zinc-800">
                  <img src={AVATAR} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-0.5 -end-0.5 p-1 bg-zinc-900 rounded-full">
                  <StatusDot status="online" />
                </div>
              </div>

              {/* Name + handle */}
              <div className="pb-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl font-bold tracking-tighter uppercase text-white drop-shadow-lg">NAF</h1>
                  <ProBadge />
                </div>
                <p className="text-green-400 text-sm mt-0.5">@naf_gaming</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">

            {/* Bio */}
            <p className="text-zinc-400 border-s-2 border-green-500/40 ps-4 italic text-sm leading-relaxed">
              "Competitive gamer. Free Fire champion. Always grinding."
            </p>

            {/* Tier chips */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 border border-green-500/50 text-green-400 bg-green-500/10 uppercase tracking-wider">
                🛡 Scout
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 border border-green-500/50 text-green-400 bg-green-500/10 uppercase tracking-wider">
                ✦ Div II
              </span>
              <span className="text-xs text-zinc-500 font-mono">XP 600 / 62</span>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs bg-zinc-950 border border-zinc-800 px-3 py-2">
                <Gamepad2 className="w-4 h-4 text-green-500" />
                <span className="text-zinc-500 uppercase tracking-widest">ACTIVE</span>
                <span className="text-green-400 flex items-center gap-1"><Radio className="w-3 h-3 animate-pulse" /> Free Fire</span>
              </div>
              <div className="flex items-center gap-2 text-xs bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-500">
                <Calendar className="w-4 h-4" /> 2026.07.13
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
                  style={{ borderColor: s.color + "66", color: s.color }}>
                  <span>{s.label}</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Label */}
        <p className="text-center text-xs text-zinc-600 uppercase tracking-widest">① Overlay — الاسم داخل البانر</p>
      </div>
    </div>
  );
}
