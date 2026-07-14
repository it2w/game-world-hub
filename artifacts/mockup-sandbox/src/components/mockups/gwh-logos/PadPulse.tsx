import React from 'react';

export function PadPulseLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="currentColor" className={`gwh-padpulse-logo ${className}`} aria-hidden="true">
      <g className="corner-dots">
        <rect x="3" y="3" width="3" height="3" />
        <rect x="42" y="3" width="3" height="3" />
        <rect x="3" y="42" width="3" height="3" />
        <rect x="42" y="42" width="3" height="3" />
      </g>
      <path className="arm-up" d="M 18 15 L 18 9 L 24 3 L 30 9 L 30 15 Z" />
      <path className="arm-right" d="M 33 18 L 39 18 L 45 24 L 39 30 L 33 30 Z" />
      <path className="arm-down" d="M 18 33 L 30 33 L 30 39 L 24 45 L 18 39 Z" />
      <path className="arm-left" d="M 15 18 L 15 30 L 9 30 L 3 24 L 9 18 Z" />
      <rect className="center-btn" x="18" y="18" width="12" height="12" />
    </svg>
  );
}

export function PadPulse() {
  return (
    <div className="min-h-screen bg-[hsl(0,0%,3%)] text-[#00ff40] font-mono relative overflow-hidden flex flex-col selection:bg-[#00ff40] selection:text-black">
      {/* CRT Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-10" style={{
        backgroundImage: 'linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 1) 50%)',
        backgroundSize: '100% 4px'
      }}></div>

      {/* Vignette */}
      <div className="pointer-events-none fixed inset-0 z-40" style={{
        background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.8) 100%)'
      }}></div>

      <style>{`
        /* Logo Keyframes */
        @keyframes gwh-padpulse-up {
          0%, 23%, 28%, 100% { opacity: 0.35; transform: translateY(0); }
          25% { opacity: 1; transform: translateY(1px); }
        }
        @keyframes gwh-padpulse-right {
          0%, 28%, 33%, 100% { opacity: 0.35; transform: translateX(0); }
          30% { opacity: 1; transform: translateX(-1px); }
        }
        @keyframes gwh-padpulse-down {
          0%, 33%, 38%, 100% { opacity: 0.35; transform: translateY(0); }
          35% { opacity: 1; transform: translateY(-1px); }
        }
        @keyframes gwh-padpulse-left {
          0%, 38%, 43%, 100% { opacity: 0.35; transform: translateX(0); }
          40% { opacity: 1; transform: translateX(1px); }
        }
        @keyframes gwh-padpulse-center {
          0%, 10%, 14%, 43%, 47%, 49%, 53%, 100% { transform: scale(1); opacity: 0.85; }
          12% { transform: scale(0.9); opacity: 1; }
          44%, 46% { transform: scale(0.75); opacity: 1; }
          50%, 52% { transform: scale(0.75); opacity: 1; }
        }
        @keyframes gwh-padpulse-dots {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }

        .gwh-padpulse-logo .arm-up { animation: gwh-padpulse-up 4s infinite; }
        .gwh-padpulse-logo .arm-right { animation: gwh-padpulse-right 4s infinite; }
        .gwh-padpulse-logo .arm-down { animation: gwh-padpulse-down 4s infinite; }
        .gwh-padpulse-logo .arm-left { animation: gwh-padpulse-left 4s infinite; }
        .gwh-padpulse-logo .center-btn { 
          animation: gwh-padpulse-center 4s infinite; 
          transform-origin: center;
          transform-box: fill-box;
        }
        .gwh-padpulse-logo .corner-dots { animation: gwh-padpulse-dots 4s infinite; }
      `}</style>

      {/* Page Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-8 md:p-16 z-10 flex flex-col pt-12 pb-24">
        
        <header className="flex flex-col md:flex-row md:justify-between md:items-end border-b border-[#00ff40]/20 pb-6 mb-16 gap-6">
          <div>
            <h1 className="text-sm tracking-[0.3em] opacity-60 mb-2">GWH_IDENTITY_SYS</h1>
            <h2 className="text-3xl font-bold tracking-tight">CONCEPT_01: PAD_PULSE</h2>
          </div>
          <div className="text-xs md:text-right opacity-50 space-y-1 font-mono">
            <div>GRID: 48x48</div>
            <div>BASE: 16x16 READY</div>
            <div>ANIM: KEYFRAME_SEQ_01</div>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-12 mb-16 border border-[#00ff40]/20 bg-[#00ff40]/5 p-8 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 opacity-5 pointer-events-none">
            <PadPulseLogo className="w-64 h-64" />
          </div>
          <div className="md:col-span-1 relative z-10">
            <div className="text-xs opacity-50 mb-2 tracking-widest">// HYPOTHESIS</div>
            <div className="text-lg font-bold">THE CONTROLLER</div>
          </div>
          <div className="md:col-span-2 text-sm opacity-80 leading-relaxed max-w-xl space-y-4 relative z-10">
            <p>
              The mark reimagines the D-pad cross as a sharp geometric emblem. Directional arms fire in a combo sequence, the center pulses like a pressed button. 
            </p>
            <p>
              Iconic gamepad heritage: chunky, confident, arcade-strong — instantly readable as gaming. Engineered on a strict 48px grid to ensure perfect pixel-snapping down to a 16px favicon.
            </p>
          </div>
        </div>

        <section className="mb-24">
          <div className="text-xs opacity-50 mb-4 tracking-widest flex items-center justify-between">
            <span>// 01. HERO_INSPECT</span>
            <span className="animate-pulse">RUNNING_</span>
          </div>
          <div className="relative aspect-video w-full border border-[#00ff40]/20 bg-black/60 flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: 'linear-gradient(#00ff40 1px, transparent 1px), linear-gradient(90deg, #00ff40 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              backgroundPosition: 'center center'
            }}></div>
            
            <div className="relative z-10 p-12 rounded-full bg-[#00ff40]/5 border border-[#00ff40]/10 shadow-[0_0_80px_rgba(0,255,64,0.1)]">
              <PadPulseLogo className="w-48 h-48 md:w-64 md:h-64 text-[#00ff40] drop-shadow-[0_0_20px_rgba(0,255,64,0.4)]" />
            </div>
          </div>
        </section>

        <section className="mb-24 grid md:grid-cols-2 gap-8">
          <div className="border border-[#00ff40]/20 p-12 bg-black/40 flex flex-col justify-center items-center gap-10 min-h-[320px] relative">
            <div className="text-xs opacity-50 absolute top-6 left-6 tracking-widest">// 02. STACKED_LOCKUP</div>
            <PadPulseLogo className="w-24 h-24 text-[#00ff40] drop-shadow-[0_0_10px_rgba(0,255,64,0.2)]" />
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold tracking-[0.2em] text-white">GAME WORLD</div>
              <div className="text-2xl md:text-3xl font-bold tracking-[0.4em] text-[#00ff40] mt-2">HUB</div>
            </div>
          </div>

          <div className="border border-[#00ff40]/20 p-12 bg-[#00ff40] text-black flex flex-col justify-center items-center gap-6 relative overflow-hidden min-h-[320px]">
            <div className="text-xs opacity-60 absolute top-6 left-6 tracking-widest font-bold">// 03. INVERTED_LOCKUP</div>
            <div className="flex flex-col xl:flex-row items-center gap-8">
              <PadPulseLogo className="w-20 h-20 text-black" />
              <div className="flex flex-col text-center xl:text-left">
                 <span className="text-xl md:text-2xl font-bold tracking-[0.2em]">GAME WORLD</span>
                 <span className="text-xl md:text-2xl font-bold tracking-[0.4em] opacity-80 mt-1">HUB</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <div className="text-xs opacity-50 mb-4 tracking-widest">// 04. OPTICAL_SCALING</div>
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-[#00ff40]/20 bg-black/40 p-8 flex flex-col items-center justify-center gap-6 min-h-[200px]">
              <PadPulseLogo className="w-12 h-12 text-[#00ff40]" />
              <div className="text-[10px] opacity-40 tracking-widest">48px / DISPLAY</div>
            </div>
            <div className="border border-[#00ff40]/20 bg-black/40 p-8 flex flex-col items-center justify-center gap-6 min-h-[200px]">
              <PadPulseLogo className="w-8 h-8 text-[#00ff40]" />
              <div className="text-[10px] opacity-40 tracking-widest">32px / UI_ICON</div>
            </div>
            <div className="border border-[#00ff40]/20 bg-black/40 p-8 flex flex-col items-center justify-center gap-6 min-h-[200px]">
              <PadPulseLogo className="w-4 h-4 text-[#00ff40]" />
              <div className="text-[10px] opacity-40 tracking-widest">16px / FAVICON</div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
