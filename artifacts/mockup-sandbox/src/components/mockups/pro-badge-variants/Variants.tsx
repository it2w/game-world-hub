import { Crown } from "lucide-react";

function Badge({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Card({ badge, label, letter }: { badge: React.ReactNode; label: string; letter: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="w-[180px] rounded border overflow-hidden"
        style={{ background: "#111", borderColor: "#333" }}
      >
        <div className="h-16 w-full" style={{ background: "linear-gradient(135deg,#1e1b4b,#111)" }} />
        <div className="flex justify-center -mt-8 mb-3">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl text-white ring-4"
            style={{ background: "#1e1b4b", borderColor: "#f59e0b", border: "2px solid #f59e0b", ringColor: "#111" }}
          >
            I
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-black" />
          </div>
        </div>
        <div className="text-center pb-4 px-3">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="text-white font-bold text-base">ibr</span>
            <Badge>{badge}</Badge>
          </div>
          <div className="text-gray-500 text-xs font-mono">@ibr</div>
          <div className="text-green-500 text-[10px] font-mono uppercase tracking-widest mt-1">● online</div>
        </div>
      </div>

      <div className="text-center">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-lg mb-1.5 mx-auto"
          style={{ background: "#1a1a1a", border: "1px solid #333", color: "#f59e0b" }}
        >
          {letter}
        </div>
        <p className="text-gray-400 text-sm">{label}</p>
      </div>
    </div>
  );
}

export function Variants() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-12 p-12"
      style={{ background: "#080808" }}
    >
      <p className="text-gray-500 text-sm font-mono uppercase tracking-widest">اختر شكل بادج Pro</p>

      <div className="grid grid-cols-3 gap-10">

        <Card letter="A" label="كراون ذهبي فقط" badge={
          <Crown className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
        } />

        <Card letter="B" label="نجمة ذهبية ★" badge={
          <span style={{ color: "#f59e0b", fontSize: 14, lineHeight: 1 }}>★</span>
        } />

        <Card letter="C" label="بيل PRO بدون أيقونة" badge={
          <span style={{
            fontSize: 9, fontFamily: "monospace", fontWeight: "bold",
            background: "linear-gradient(90deg,#f59e0b,#fde68a)",
            color: "#000", padding: "1px 5px", letterSpacing: "0.1em",
          }}>PRO</span>
        } />

        <Card letter="D" label="حدود ذهبية فقط" badge={
          <span style={{
            fontSize: 9, fontFamily: "monospace", fontWeight: "bold",
            border: "1px solid #f59e0b", color: "#f59e0b",
            padding: "1px 5px", letterSpacing: "0.1em",
          }}>PRO</span>
        } />

        <Card letter="E" label="كراون + PRO خلفية شفافة" badge={
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 2,
            fontSize: 8, fontFamily: "monospace", fontWeight: "bold",
            background: "rgba(245,158,11,0.12)", color: "#f59e0b",
            border: "1px solid rgba(245,158,11,0.35)",
            padding: "1px 4px", letterSpacing: "0.08em",
          }}>
            <Crown size={9} fill="#f59e0b" color="#f59e0b" />PRO
          </span>
        } />

        <Card letter="F" label="نقطة ذهبية مضيئة" badge={
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "linear-gradient(135deg,#f59e0b,#fde68a)",
            boxShadow: "0 0 5px #f59e0baa",
            display: "inline-block", flexShrink: 0,
          }} />
        } />

      </div>
    </div>
  );
}
