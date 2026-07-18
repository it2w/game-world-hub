import { Crown, Star, Gem, Zap, Sparkles } from "lucide-react";

const FRIEND_NAME = "ibr";
const FRIEND_USERNAME = "ibr@";

function MockCard({ badge, label }: { badge: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* card */}
      <div
        className="w-[130px] border rounded-sm bg-[#0f0f0f] overflow-hidden"
        style={{ borderColor: "#2a2a2a" }}
      >
        {/* banner */}
        <div
          className="h-14 w-full"
          style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #0f0f0f 100%)" }}
        />
        {/* avatar centered */}
        <div className="flex justify-center -mt-6 mb-2">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-[#2a2a2a] border-2 border-[#fbbf24] ring-[3px] ring-[#0f0f0f] flex items-center justify-center font-mono font-bold text-lg text-white">
              I
            </div>
            {/* status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-[#0f0f0f]" />
          </div>
        </div>
        {/* name row */}
        <div className="px-2 pb-3 text-center">
          <div className="flex items-center justify-center gap-1 min-w-0">
            <span className="font-bold text-sm text-white truncate leading-tight">{FRIEND_NAME}</span>
            {badge}
          </div>
          <div className="text-[10px] text-gray-500 font-mono">{FRIEND_USERNAME}</div>
          <div className="text-[10px] text-gray-600 font-mono uppercase mt-1 tracking-wider">online</div>
        </div>
        {/* action bar */}
        <div className="flex border-t" style={{ borderColor: "#2a2a2a" }}>
          {["اتصال","دردشة","حظر"].map(a => (
            <div key={a} className="flex-1 flex items-center justify-center py-1.5 text-gray-600 text-[9px] font-mono border-r last:border-r-0" style={{ borderColor: "#2a2a2a" }}>
              {a}
            </div>
          ))}
        </div>
      </div>
      {/* label */}
      <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

export function Variants() {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center p-10 gap-10">
      <p className="text-gray-500 font-mono text-xs uppercase tracking-widest">اختر شكل بادج Pro</p>

      <div className="grid grid-cols-3 gap-8">

        {/* A — Crown icon only, gold, tiny */}
        <MockCard label="A — أيقونة فقط" badge={
          <Crown className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
        } />

        {/* B — ◆ diamond text, no bg */}
        <MockCard label="B — نجمة ذهبية" badge={
          <span className="text-amber-400 text-[10px] leading-none">★</span>
        } />

        {/* C — tiny pill no icon */}
        <MockCard label="C — بيل بدون أيقونة" badge={
          <span
            className="text-[8px] font-mono font-bold uppercase tracking-widest px-1 py-px rounded-sm"
            style={{ background: "linear-gradient(90deg,#f59e0b,#fde68a)", color: "#000" }}
          >
            pro
          </span>
        } />

        {/* D — outline only */}
        <MockCard label="D — حدود فقط" badge={
          <span
            className="text-[8px] font-mono font-bold uppercase tracking-widest px-1 py-px rounded-sm border"
            style={{ borderColor: "#f59e0b", color: "#f59e0b" }}
          >
            pro
          </span>
        } />

        {/* E — crown + pro, ultra small, no rounding */}
        <MockCard label="E — كراون + نص صغير" badge={
          <span
            className="inline-flex items-center gap-0.5 text-[7px] font-mono font-bold uppercase tracking-widest px-1 py-px"
            style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b55" }}
          >
            <Crown className="w-2 h-2 fill-amber-400" />pro
          </span>
        } />

        {/* F — gradient dot */}
        <MockCard label="F — نقطة ذهبية" badge={
          <span
            className="w-2 h-2 rounded-full shrink-0 inline-block"
            style={{ background: "linear-gradient(135deg,#f59e0b,#fde68a)", boxShadow: "0 0 4px #f59e0b88" }}
          />
        } />

      </div>
    </div>
  );
}
