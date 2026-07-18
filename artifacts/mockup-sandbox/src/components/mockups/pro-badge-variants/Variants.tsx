import { Crown, Zap, Shield, Gem, Flame, BadgeCheck } from "lucide-react";

function Card({ badge, label, letter }: { badge: React.ReactNode; label: string; letter: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-[160px] rounded-sm border overflow-hidden" style={{ background: "#111", borderColor: "#2a2a2a" }}>
        <div className="h-14 w-full" style={{ background: "linear-gradient(135deg,#1e1b4b 0%,#0f0f1a 100%)" }} />
        <div className="flex justify-center -mt-7 mb-2.5">
          <div className="relative">
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl text-white border-2" style={{ background: "#1e1b4b", borderColor: "#f59e0b" }}>
              I
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-black" />
          </div>
        </div>
        <div className="text-center pb-3 px-2">
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <span className="text-white font-bold text-sm">ibr</span>
            {badge}
          </div>
          <div className="text-gray-500 text-[10px] font-mono">@ibr</div>
          <div className="text-green-500 text-[9px] font-mono uppercase tracking-widest mt-1">● online</div>
        </div>
        <div className="flex border-t" style={{ borderColor: "#1f1f1f" }}>
          {["اتصال","دردشة"].map(a => (
            <div key={a} className="flex-1 text-center py-1.5 text-gray-600 text-[9px] font-mono border-r last:border-r-0" style={{ borderColor: "#1f1f1f" }}>{a}</div>
          ))}
        </div>
      </div>
      <div className="text-center">
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mx-auto mb-1" style={{ background: "#1a1a1a", border: "1px solid #333", color: "#f59e0b" }}>
          {letter}
        </div>
        <p className="text-gray-400 text-xs font-mono leading-tight">{label}</p>
      </div>
    </div>
  );
}

export function Variants() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 py-12 px-8" style={{ background: "#080808" }}>
      <p className="text-gray-500 text-xs font-mono uppercase tracking-[0.2em]">اختر شكل بادج Pro</p>

      {/* Row 1 — original */}
      <div className="grid grid-cols-6 gap-6">
        <Card letter="A" label={"كراون\nأيقونة فقط"} badge={
          <Crown className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
        } />

        <Card letter="B" label={"نجمة\nذهبية"} badge={
          <span style={{ color: "#f59e0b", fontSize: 13, lineHeight: 1 }}>★</span>
        } />

        <Card letter="C" label={"بيل PRO\nذهبي"} badge={
          <span style={{ fontSize: 8, fontFamily: "monospace", fontWeight: 800, background: "linear-gradient(90deg,#f59e0b,#fde68a)", color: "#000", padding: "1px 5px", letterSpacing: "0.1em" }}>PRO</span>
        } />

        <Card letter="D" label={"حدود\nذهبية PRO"} badge={
          <span style={{ fontSize: 8, fontFamily: "monospace", fontWeight: 700, border: "1px solid #f59e0b", color: "#f59e0b", padding: "1px 5px", letterSpacing: "0.1em" }}>PRO</span>
        } />

        <Card letter="E" label={"كراون+PRO\nشفاف"} badge={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 7, fontFamily: "monospace", fontWeight: 800, background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.4)", padding: "1px 4px" }}>
            <Crown size={8} fill="#f59e0b" color="#f59e0b" />PRO
          </span>
        } />

        <Card letter="F" label={"نقطة\nذهبية"} badge={
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "linear-gradient(135deg,#f59e0b,#fde68a)", boxShadow: "0 0 5px #f59e0baa", display: "inline-block" }} />
        } />
      </div>

      <div className="w-full max-w-4xl h-px" style={{ background: "#1f1f1f" }} />

      {/* Row 2 — new professional */}
      <div className="grid grid-cols-6 gap-6">

        {/* G — lightning bolt */}
        <Card letter="G" label={"صاعقة\nذهبية"} badge={
          <Zap className="w-3 h-3 fill-amber-400 text-amber-400" />
        } />

        {/* H — gradient text PRO no bg */}
        <Card letter="H" label={"نص PRO\nتدرج ذهبي"} badge={
          <span style={{ fontSize: 9, fontWeight: 900, fontFamily: "monospace", background: "linear-gradient(90deg,#f59e0b,#fef08a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.08em" }}>PRO</span>
        } />

        {/* I — gem diamond */}
        <Card letter="I" label={"ماسة\nذهبية"} badge={
          <Gem className="w-3.5 h-3.5 text-amber-400" style={{ fill: "rgba(245,158,11,0.15)" }} />
        } />

        {/* J — verified checkmark gold */}
        <Card letter="J" label={"علامة\nموثّق ذهبي"} badge={
          <BadgeCheck className="w-3.5 h-3.5 fill-amber-400 text-black" />
        } />

        {/* K — fire flame */}
        <Card letter="K" label={"شعلة\nنارية"} badge={
          <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
        } />

        {/* L — ✦ PRO ✦ decorative */}
        <Card letter="L" label={"PRO\nمزخرف"} badge={
          <span style={{ fontSize: 7, fontWeight: 800, fontFamily: "monospace", color: "#f59e0b", letterSpacing: "0.05em", textShadow: "0 0 6px #f59e0b88" }}>✦PRO✦</span>
        } />

      </div>
    </div>
  );
}
