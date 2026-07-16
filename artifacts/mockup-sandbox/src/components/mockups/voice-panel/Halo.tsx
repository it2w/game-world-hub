import { Mic, MicOff, Monitor, PhoneOff, Phone, Video, Headphones, Loader2, ChevronDown, X, Check } from 'lucide-react';

const CSS = `
  @keyframes ring-out {
    0%   { transform: scale(1);    opacity: 1; }
    100% { transform: scale(1.22); opacity: 0; }
  }
  @keyframes eq-bar {
    0%, 100% { transform: scaleY(0.25); }
    50%       { transform: scaleY(1);   }
  }
  @keyframes sweep {
    0%   { left: -40%; }
    100% { left: 140%; }
  }
  @keyframes shrink {
    0%   { width: 100%; }
    100% { width: 0%; }
  }
  @keyframes blink-dot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }
  @keyframes peer-glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,65,0); }
    50%       { box-shadow: 0 0 0 3px rgba(0,255,65,0.18); }
  }
  .ring-1 { animation: ring-out 2.2s cubic-bezier(0.4,0,0.6,1) infinite; }
  .ring-2 { animation: ring-out 2.2s cubic-bezier(0.4,0,0.6,1) 0.55s infinite; }
  .ring-3 { animation: ring-out 2.2s cubic-bezier(0.4,0,0.6,1) 1.1s infinite; }
  .eq1 { animation: eq-bar 0.9s ease-in-out infinite 0.00s; transform-origin: bottom; }
  .eq2 { animation: eq-bar 0.9s ease-in-out infinite 0.15s; transform-origin: bottom; }
  .eq3 { animation: eq-bar 0.9s ease-in-out infinite 0.30s; transform-origin: bottom; }
  .eq4 { animation: eq-bar 0.9s ease-in-out infinite 0.45s; transform-origin: bottom; }
  .eq5 { animation: eq-bar 0.9s ease-in-out infinite 0.60s; transform-origin: bottom; }
  .eq-sm1 { animation: eq-bar 0.8s ease-in-out infinite 0.00s; transform-origin: bottom; }
  .eq-sm2 { animation: eq-bar 0.8s ease-in-out infinite 0.18s; transform-origin: bottom; }
  .eq-sm3 { animation: eq-bar 0.8s ease-in-out infinite 0.36s; transform-origin: bottom; }
  .sweep  { animation: sweep 2.4s linear infinite; }
  .shrink { animation: shrink 45s linear forwards; }
  .dot-blink { animation: blink-dot 1.4s ease-in-out infinite; }
  .peer-speaking { animation: peer-glow 2s ease-in-out infinite; }
`;

function EqBars({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  if (size === 'sm') {
    return (
      <div className="flex items-end gap-[2px] h-3">
        <div className="eq-sm1 w-[2px] h-3 bg-[#00ff41] rounded-full" />
        <div className="eq-sm2 w-[2px] h-3 bg-[#00ff41] rounded-full" />
        <div className="eq-sm3 w-[2px] h-3 bg-[#00ff41] rounded-full" />
      </div>
    );
  }
  return (
    <div className="flex items-end gap-[3px] h-4">
      <div className="eq1 w-[3px] h-4 bg-[#00ff41] rounded-full" />
      <div className="eq2 w-[3px] h-4 bg-[#00ff41] rounded-full" />
      <div className="eq3 w-[3px] h-4 bg-[#00ff41] rounded-full" />
      <div className="eq4 w-[3px] h-4 bg-[#00ff41] rounded-full" />
      <div className="eq5 w-[3px] h-4 bg-[#00ff41] rounded-full" />
    </div>
  );
}

function CtrlBtn({
  children, active, danger, label,
}: {
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  label?: string;
}) {
  const base = 'flex items-center justify-center gap-1.5 h-9 transition-all font-mono text-[10px] uppercase tracking-wider';
  const idle = 'bg-[#111120] border border-[#232338] text-[#55556a] hover:text-white hover:border-white/20';
  const act  = 'bg-[#00ff41]/12 border border-[#00ff41]/60 text-[#00ff41] shadow-[0_0_14px_rgba(0,255,65,0.15)]';
  const red  = 'bg-[#ef4444]/12 border border-[#ef4444]/50 text-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.12)] flex-1 gap-2';

  if (danger) {
    return (
      <button className={`${base} ${red}`}>
        {children}
        <span>Leave</span>
      </button>
    );
  }
  return (
    <button className={`${base} w-10 ${active ? act : idle}`}>
      {children}
    </button>
  );
}

export function Halo() {
  return (
    <div
      className="min-h-screen flex flex-col gap-14 p-10 font-mono text-white"
      style={{ background: '#050509' }}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ─── LABEL ─────────────────────────────────────────────── */}
      <div>
        <div className="text-white/25 text-[9px] tracking-[0.25em] mb-4 uppercase">Voice Panel</div>

        {/* ── Panel ─────────────────────────────────────────────── */}
        <div
          className="w-[300px] flex flex-col overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #0e0e1c 0%, #080812 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Top gradient bar */}
          <div className="h-[2px] w-full shrink-0" style={{ background: 'linear-gradient(90deg,#00ff41 0%,#00bfff 55%,transparent 100%)' }} />

          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex shrink-0">
                <span className="dot-blink absolute w-2 h-2 bg-[#00ff41] rounded-full" />
                <span className="w-2 h-2 bg-[#00ff41]/30 rounded-full" />
              </span>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/35 leading-none mb-[3px]">Voice</div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-white truncate leading-none">Valorant Ranked</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="text-[9px] px-1.5 py-0.5 font-bold"
                style={{ background: 'rgba(0,255,65,0.1)', color: '#00ff41', border: '1px solid rgba(0,255,65,0.25)' }}
              >4</span>
              <ChevronDown size={13} className="text-white/30" />
            </div>
          </div>

          {/* ── Self / HALO section ──────────────────────────────── */}
          <div
            className="flex flex-col items-center pt-7 pb-5 shrink-0 relative overflow-hidden"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            {/* Background radial glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 160px 100px at 50% 55%, rgba(0,255,65,0.07) 0%, transparent 70%)' }}
            />

            {/* Halo rings + avatar container */}
            <div className="relative flex items-center justify-center w-[144px] h-[144px] mb-4">
              {/* Ring 3 — outermost */}
              <div
                className="ring-3 absolute w-[128px] h-[128px] pointer-events-none"
                style={{ border: '1px solid rgba(0,255,65,0.12)' }}
              />
              {/* Ring 2 */}
              <div
                className="ring-2 absolute w-[108px] h-[108px] pointer-events-none"
                style={{ border: '1px solid rgba(0,255,65,0.28)' }}
              />
              {/* Ring 1 — innermost */}
              <div
                className="ring-1 absolute w-[90px] h-[90px] pointer-events-none"
                style={{ border: '1px solid rgba(0,255,65,0.55)' }}
              />
              {/* Avatar */}
              <div
                className="relative w-[72px] h-[72px] flex items-center justify-center z-10"
                style={{
                  background: 'linear-gradient(135deg, #182818, #0f1220)',
                  border: '1px solid rgba(0,255,65,0.4)',
                  boxShadow: '0 0 28px rgba(0,255,65,0.22), inset 0 0 12px rgba(0,255,65,0.08)',
                }}
              >
                <span className="text-[26px] font-bold" style={{ color: '#00ff41' }}>Y</span>
              </div>
            </div>

            {/* Name + EQ */}
            <div className="flex items-center gap-3 mb-2.5 z-10">
              <span className="text-[13px] font-bold tracking-widest uppercase">You</span>
              <EqBars />
            </div>

            {/* Screen share badge */}
            <div
              className="flex items-center gap-1.5 z-10 px-2.5 py-1"
              style={{
                background: 'rgba(0,255,65,0.08)',
                border: '1px solid rgba(0,255,65,0.2)',
              }}
            >
              <span className="w-1.5 h-1.5 bg-[#00ff41] shadow-[0_0_6px_#00ff41] animate-pulse shrink-0" />
              <span className="text-[9px] text-[#00ff41] tracking-[0.18em] uppercase font-semibold">Screen Share Active</span>
            </div>
          </div>

          {/* ── Screen share thumbnail ───────────────────────────── */}
          <div className="p-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div
              className="relative group aspect-video bg-black overflow-hidden cursor-pointer"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {/* dot grid pattern */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
                  backgroundSize: '18px 18px',
                }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 px-2 py-1"
                style={{ background: 'rgba(0,0,0,0.75)' }}
              >
                <Monitor size={9} style={{ color: '#00ff41' }} />
                <span className="text-[9px] text-white/60 flex-1">You (screen)</span>
                <span
                  className="text-[8px] px-1 font-bold"
                  style={{ background: 'rgba(0,255,65,0.15)', color: '#00ff41', border: '1px solid rgba(0,255,65,0.3)' }}
                >60fps</span>
              </div>
            </div>
          </div>

          {/* ── Peer list ────────────────────────────────────────── */}
          <div className="flex flex-col shrink-0">
            {/* Khalid — speaking */}
            <div
              className="peer-speaking flex items-center gap-2.5 px-3 py-2 relative"
              style={{
                background: 'rgba(0,255,65,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                borderLeft: '2px solid #00ff41',
              }}
            >
              <div
                className="w-7 h-7 flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: '#111122', border: '1px solid rgba(0,255,65,0.35)', color: '#00ff41' }}
              >K</div>
              <span className="flex-1 text-[11px] text-white/90 tracking-wide">Khalid</span>
              <EqBars size="sm" />
            </div>

            {/* Sara — muted */}
            <div
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.03] transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: '2px solid transparent' }}
            >
              <div
                className="w-7 h-7 flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: '#111122', border: '1px solid rgba(255,255,255,0.08)', color: '#888899' }}
              >S</div>
              <span className="flex-1 text-[11px] text-white/75 tracking-wide">Sara</span>
              <MicOff size={12} style={{ color: '#ef4444' }} />
            </div>

            {/* Omar — connecting */}
            <div
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.03] transition-colors"
              style={{ borderLeft: '2px solid transparent' }}
            >
              <div
                className="w-7 h-7 flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: '#111122', border: '1px solid rgba(255,255,255,0.08)', color: '#888899' }}
              >O</div>
              <span className="flex-1 text-[11px] text-white/40 tracking-wide">Omar</span>
              <Loader2 size={12} className="animate-spin" style={{ color: '#555566' }} />
            </div>
          </div>

          {/* ── Controls ─────────────────────────────────────────── */}
          <div
            className="flex items-center gap-1.5 px-3 py-3 shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.25)' }}
          >
            <CtrlBtn><Mic size={15} /></CtrlBtn>
            <CtrlBtn><Headphones size={15} /></CtrlBtn>
            <CtrlBtn><Video size={15} /></CtrlBtn>
            <CtrlBtn active><Monitor size={15} /></CtrlBtn>
            <CtrlBtn danger><PhoneOff size={15} /></CtrlBtn>
          </div>

          {/* Quality footer */}
          <div
            className="flex items-center justify-center gap-2 px-3 py-1.5 shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          >
            <span className="text-[8px] text-white/20 uppercase tracking-[0.2em]">Screen</span>
            <span className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: '#00ff41', opacity: 0.6 }}>1080p · 60fps</span>
            <div className="flex gap-0.5 ml-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-[3px] h-[3px]" style={{ background: 'rgba(0,255,65,0.5)' }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── INCOMING CALL ─────────────────────────────────────── */}
      <div>
        <div className="text-white/25 text-[9px] tracking-[0.25em] mb-4 uppercase">Incoming Call</div>

        <div
          className="w-[340px] overflow-hidden relative flex"
          style={{
            background: '#0b0b1a',
            border: '1px solid rgba(0,255,65,0.18)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,255,65,0.06)',
          }}
        >
          {/* Left accent bar */}
          <div
            className="w-[3px] shrink-0"
            style={{ background: 'linear-gradient(180deg, #00ff41, rgba(0,255,65,0.2))' }}
          />

          <div className="flex-1 flex flex-col">
            {/* Scanning light */}
            <div className="h-[1px] w-full relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div
                className="sweep absolute top-0 w-1/4 h-full pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, #00ff41, transparent)' }}
              />
            </div>

            <div className="p-4 flex items-center gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-[60px] h-[60px] flex items-center justify-center text-2xl font-bold relative z-10"
                  style={{
                    background: 'linear-gradient(135deg, #182818, #0f1220)',
                    border: '1px solid rgba(0,255,65,0.45)',
                    boxShadow: '0 0 20px rgba(0,255,65,0.2)',
                    color: '#00ff41',
                  }}
                >M</div>
                {/* Pulse ring */}
                <div
                  className="absolute inset-[-6px] pointer-events-none animate-ping"
                  style={{ border: '1px solid rgba(0,255,65,0.25)', animationDuration: '1.8s' }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-white/35 tracking-[0.2em] uppercase mb-1">Direct Call</div>
                <div className="text-[15px] font-bold tracking-wide text-white mb-0.5">Majed Al-Harbi</div>
                <div
                  className="text-[10px] flex items-center gap-1.5"
                  style={{ color: '#00ff41' }}
                >
                  <span className="dot-blink w-1.5 h-1.5 bg-[#00ff41] inline-block shrink-0" />
                  Incoming call
                </div>
              </div>
            </div>

            {/* Countdown timer bar */}
            <div className="h-[2px] w-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div
                className="shrink h-full shadow-[0_0_6px_#00ff41]"
                style={{ background: '#00ff41' }}
              />
            </div>

            {/* Buttons */}
            <div className="flex">
              <button
                className="flex-1 h-11 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-all"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  borderTop: '1px solid rgba(239,68,68,0.15)',
                  borderRight: '1px solid rgba(239,68,68,0.1)',
                  color: '#ef4444',
                }}
              >
                <X size={14} /> Decline
              </button>
              <button
                className="flex-1 h-11 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-all"
                style={{
                  background: '#00ff41',
                  color: '#000',
                }}
              >
                <Check size={14} /> Accept
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── OUTGOING CALL ─────────────────────────────────────── */}
      <div>
        <div className="text-white/25 text-[9px] tracking-[0.25em] mb-4 uppercase">Outgoing Call</div>

        <div
          className="w-[440px] relative overflow-hidden"
          style={{
            background: '#0b0b1a',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          {/* Scanning light */}
          <div className="h-[1px] w-full relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="sweep absolute top-0 w-1/4 h-full pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(0,255,65,0.8), transparent)' }}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3 gap-4">
            <div className="flex items-center gap-3">
              {/* Callee avatar */}
              <div className="relative w-9 h-9 shrink-0">
                <div
                  className="w-full h-full flex items-center justify-center text-[13px] font-bold"
                  style={{
                    background: '#111122',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#aaaacc',
                  }}
                >K</div>
                <span
                  className="absolute -bottom-[3px] -right-[3px] w-2 h-2 animate-pulse"
                  style={{ background: '#f59e0b', boxShadow: '0 0 6px #f59e0b' }}
                />
              </div>
              <div>
                <div className="text-[12px] font-bold text-white/90">Calling Khalid</div>
                <div className="text-[10px] text-white/35">@khalid_99</div>
              </div>
            </div>

            <button
              className="w-8 h-8 flex items-center justify-center transition-all"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Halo;
