import { useState } from "react";
import { Check, Settings2 } from "lucide-react";
import "./_group.css";

type DesignId = "classic" | "emerald";

interface DesignOption {
  id: DesignId;
  label: string;
  labelEn: string;
  description: string;
}

const DESIGNS: DesignOption[] = [
  {
    id: "classic",
    label: "كلاسيك",
    labelEn: "Classic",
    description: "التصميم الأصلي — كثيف ونيون",
  },
  {
    id: "emerald",
    label: "إيمرالد",
    labelEn: "Emerald",
    description: "تصميم فاخر — أرقام كبيرة وهواء",
  },
];

function ClassicPreview() {
  return (
    <div className="w-full h-full bg-black p-3 flex flex-col gap-2 overflow-hidden font-mono">
      {/* stat bar — tight, small numbers */}
      <div className="flex gap-1.5">
        {[
          { label: "W", value: "142" },
          { label: "L", value: "58" },
          { label: "K/D", value: "2.4" },
        ].map((s) => (
          <div key={s.label} className="flex-1 bg-[#0e0e0e] border border-[#1c1c1c] p-1.5">
            <div className="text-[8px] text-[#555] uppercase tracking-widest">{s.label}</div>
            <div className="text-[13px] font-black text-white leading-none mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
      {/* section title — gray */}
      <div className="text-[7px] font-black tracking-[2px] uppercase text-[#555] mt-1">أصدقاء أونلاين</div>
      {/* friend rows — compact */}
      {[
        { name: "xSniper99", game: "Valorant", online: true },
        { name: "GhostBlade", game: "COD",      online: true },
        { name: "Ryx",        game: "—",         online: false },
      ].map((f) => (
        <div key={f.name} className="flex items-center gap-2 bg-[#0a0a0a] border border-[#161616] px-2 py-1">
          <div className="w-5 h-5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-white truncate">{f.name}</div>
            <div className="text-[7px] text-[#444] truncate">{f.game}</div>
          </div>
          <div className={`w-1.5 h-1.5 rounded-full ${f.online ? "bg-[#22C55E]" : "bg-[#333]"}`} />
        </div>
      ))}
      {/* neon badge */}
      <div className="mt-auto self-start px-2 py-0.5 border border-[#00FF40] text-[7px] font-black text-[#00FF40] tracking-widest">
        ONLINE · 3
      </div>
    </div>
  );
}

function EmeraldPreview() {
  return (
    <div className="w-full h-full bg-black p-3 flex flex-col gap-2.5 overflow-hidden font-mono">
      {/* stat bar — spacious, large numbers */}
      <div className="flex gap-2">
        {[
          { label: "W", value: "142" },
          { label: "L", value: "58" },
          { label: "K/D", value: "2.4" },
        ].map((s) => (
          <div key={s.label} className="flex-1 bg-[#0e0e0e] border border-[#1c1c1c] px-2.5 py-2">
            <div className="text-[8px] text-[#444] uppercase tracking-widest">{s.label}</div>
            <div className="text-[22px] font-black text-white leading-none mt-0.5 tracking-tight">{s.value}</div>
          </div>
        ))}
      </div>
      {/* section title — emerald */}
      <div className="text-[7px] font-black tracking-[2px] uppercase" style={{ color: "#22C55E" }}>
        أصدقاء أونلاين
      </div>
      {/* friend rows — spacious */}
      {[
        { name: "xSniper99", game: "Valorant", online: true },
        { name: "GhostBlade", game: "COD",      online: true },
        { name: "Ryx",        game: "—",         online: false },
      ].map((f) => (
        <div key={f.name} className="flex items-center gap-2.5 bg-[#0a0a0a] border border-[#1a1a1a] px-2.5 py-1.5">
          <div className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-white truncate">{f.name}</div>
            <div className="text-[7px] text-[#444] truncate">{f.game}</div>
          </div>
          <div className={`w-2 h-2 rounded-full ${f.online ? "bg-[#22C55E]" : "bg-[#333]"}`} />
        </div>
      ))}
      {/* emerald pill */}
      <div
        className="mt-auto self-start px-2.5 py-1 text-[7px] font-black text-black tracking-widest"
        style={{ background: "#22C55E" }}
      >
        ONLINE · 3
      </div>
    </div>
  );
}

const PREVIEWS: Record<DesignId, React.ReactNode> = {
  classic: <ClassicPreview />,
  emerald: <EmeraldPreview />,
};

export function DesignThemeSwitcher() {
  const [active, setActive] = useState<DesignId>("classic");

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8 font-mono"
      style={{ background: "#080808", direction: "rtl" }}
    >
      <div className="w-[680px] space-y-6">
        {/* Header */}
        <div className="border-b border-[#1c1c1c] pb-4">
          <h1 className="text-white text-sm uppercase tracking-[3px] font-black flex items-center gap-2">
            <Settings2 className="w-4 h-4" style={{ color: "#22C55E" }} />
            الإعدادات
          </h1>
        </div>

        {/* Card */}
        <div className="bg-[#0c0c0c] border border-[#1c1c1c] p-6">
          <h2
            className="text-[11px] uppercase tracking-[3px] font-black mb-2 flex items-center gap-2"
            style={{ color: "#22C55E" }}
          >
            <span className="opacity-70">◈</span> تصميم الواجهة
          </h2>
          <p className="text-[10px] text-[#555] mb-6 tracking-wide">اختر شكل لوحة التحكم</p>

          <div className="grid grid-cols-2 gap-5">
            {DESIGNS.map((d) => {
              const isActive = active === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActive(d.id)}
                  className="flex flex-col overflow-hidden transition-all duration-150 focus:outline-none cursor-pointer text-start"
                  style={{
                    border: isActive ? "2px solid #22C55E" : "2px solid #3a3a3a",
                    background: isActive ? "rgba(34,197,94,0.06)" : "#161616",
                  }}
                >
                  {/* Preview */}
                  <div
                    className="relative w-full overflow-hidden"
                    style={{
                      height: 150,
                      borderBottom: isActive ? "1px solid rgba(34,197,94,0.4)" : "1px solid #2a2a2a",
                    }}
                  >
                    {PREVIEWS[d.id]}
                    {isActive && (
                      <div
                        className="absolute top-2 end-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "#22C55E" }}
                      >
                        <Check className="w-3 h-3 text-black" />
                      </div>
                    )}
                    {/* Design number badge */}
                    <div
                      className="absolute top-2 start-2 px-1.5 py-0.5 text-[8px] font-black tracking-widest"
                      style={{
                        border: `1px solid ${isActive ? "#22C55E" : "#2a2a2a"}`,
                        color: isActive ? "#22C55E" : "#444",
                        background: "rgba(0,0,0,0.8)",
                      }}
                    >
                      {d.id === "classic" ? "① Classic" : "② Emerald"}
                    </div>
                  </div>

                  {/* Label */}
                  <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                    <span
                      className="text-xs font-black tracking-wide"
                      style={{ color: isActive ? "#22C55E" : "#ccc" }}
                    >
                      {d.label}
                    </span>
                    <span className="text-[9px] tracking-widest uppercase" style={{ color: "#555" }}>{d.labelEn}</span>
                  </div>
                  <div className="px-3 pb-3">
                    <span className="text-[9px]" style={{ color: "#666" }}>{d.description}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active state hint */}
          <div className="mt-5 pt-4 border-t border-[#141414] flex items-center justify-between">
            <span className="text-[9px] text-[#333] uppercase tracking-widest">التصميم الحالي</span>
            <span
              className="text-[9px] font-black tracking-[2px] uppercase"
              style={{ color: "#22C55E" }}
            >
              {active === "classic" ? "كلاسيك — Classic" : "إيمرالد — Emerald"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
