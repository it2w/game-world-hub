import React from 'react';

function AnimatedLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={`glitch-mark ${className}`} aria-hidden="true">
      <defs>
        <path 
          id="g-shape" 
          d="M 85 20 L 30 20 L 15 35 L 15 65 L 30 80 L 70 80 L 85 65 L 85 50 L 45 50" 
          strokeWidth="12" 
          strokeLinejoin="miter" 
          strokeLinecap="square" 
          fill="none" 
        />
        <linearGradient id="scan-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.8" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      <use href="#g-shape" className="gm-cyan" style={{ stroke: 'hsl(180, 100%, 50%)' }} />
      <use href="#g-shape" className="gm-magenta" style={{ stroke: 'hsl(300, 100%, 50%)' }} />
      <use href="#g-shape" className="gm-glow" stroke="currentColor" />
      <use href="#g-shape" className="gm-main" stroke="currentColor" />

      <rect className="gm-scanline" x="0" y="0" width="100" height="15" fill="url(#scan-grad)" />
    </svg>
  );
}

export function GlitchMark() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center py-20 px-6 sm:px-12 relative overflow-hidden" style={{ backgroundColor: 'hsl(0 0% 3%)', color: 'hsl(135 100% 50%)', fontFamily: '"Spline Sans Mono", monospace' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;600;700&display=swap');
        
        .glitch-mark {
          display: block;
          color: hsl(135, 100%, 50%);
        }

        .gm-cyan {
          animation: gm-glitch-cyan 6s infinite;
          mix-blend-mode: screen;
        }

        .gm-magenta {
          animation: gm-glitch-magenta 6s infinite;
          mix-blend-mode: screen;
        }

        .gm-glow {
          filter: blur(8px);
          animation: gm-pulse 6s ease-in-out infinite;
        }

        .gm-main {
          animation: gm-main-glitch 6s infinite;
        }

        .gm-scanline {
          animation: gm-scan 6s linear infinite;
        }

        @keyframes gm-scan {
          0% { transform: translateY(-100%); opacity: 0; }
          5% { opacity: 1; }
          40% { transform: translateY(800%); opacity: 1; }
          45%, 100% { transform: translateY(800%); opacity: 0; }
        }

        @keyframes gm-glitch-cyan {
          0%, 13.99% { transform: translate(0, 0); opacity: 0; }
          14%, 15.99% { transform: translate(-4%, -1.5%); opacity: 0.8; }
          16%, 47.99% { transform: translate(0, 0); opacity: 0; }
          48%, 48.99% { transform: translate(-5%, -2.5%); opacity: 0.9; }
          49%, 49.99% { transform: translate(4%, 4%); opacity: 0.9; }
          50%, 50.99% { transform: translate(-2.5%, 1.5%); opacity: 0.9; }
          51%, 100% { transform: translate(0, 0); opacity: 0; }
        }

        @keyframes gm-glitch-magenta {
          0%, 13.99% { transform: translate(0, 0); opacity: 0; }
          14%, 15.99% { transform: translate(4%, 1.5%); opacity: 0.8; }
          16%, 47.99% { transform: translate(0, 0); opacity: 0; }
          48%, 48.99% { transform: translate(5%, 2.5%); opacity: 0.9; }
          49%, 49.99% { transform: translate(-4%, -4%); opacity: 0.9; }
          50%, 50.99% { transform: translate(2.5%, -1.5%); opacity: 0.9; }
          51%, 100% { transform: translate(0, 0); opacity: 0; }
        }

        @keyframes gm-main-glitch {
          0%, 13.99% { transform: translate(0, 0); }
          14%, 15.99% { transform: translate(-1.5%, 1.5%); }
          16%, 47.99% { transform: translate(0, 0); }
          48%, 48.99% { transform: translate(-2.5%, 0); }
          49%, 49.99% { transform: translate(1.5%, -1.5%); }
          50%, 50.99% { transform: translate(-1.5%, 1.5%); }
          51%, 100% { transform: translate(0, 0); }
        }

        @keyframes gm-pulse {
          0%, 47.99% { opacity: 0.3; filter: blur(6px); }
          48%, 50.99% { opacity: 1; filter: blur(12px); }
          51%, 100% { opacity: 0.3; filter: blur(6px); }
        }
      `}</style>
      
      {/* Background grain/grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(135_100%_50%/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(135_100%_50%/0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(0_0%_3%)_80%)] pointer-events-none" />

      <div className="max-w-5xl w-full space-y-32 relative z-10">
        
        {/* Header */}
        <header className="text-center space-y-6">
          <div className="inline-flex items-center gap-3 text-[hsl(135_100%_50%/0.7)] text-sm tracking-[0.3em] uppercase border border-[hsl(135_100%_50%/0.2)] px-4 py-1.5 rounded-full bg-[hsl(135_100%_50%/0.05)]">
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            Identity Concept 01
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tighter text-white">The Esports Monogram</h1>
          <p className="text-zinc-400 max-w-xl mx-auto text-base leading-relaxed">
            A heavy-weight, angular monogram forged from a single continuous stroke. Designed for broadcast and competitive arenas. Alive with terminal energy and occasional RGB surges.
          </p>
        </header>

        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center py-24 border border-[hsl(135_100%_50%/0.15)] bg-[hsl(135_100%_50%/0.02)] overflow-hidden rounded-sm shadow-[0_0_40px_hsl(135_100%_50%/0.05)_inset]">
          <div className="absolute top-6 left-6 text-xs text-[hsl(135_100%_50%/0.5)] tracking-widest font-semibold">01 // HERO LOOP</div>
          <div className="relative z-10 w-48 h-48 sm:w-56 sm:h-56">
            <AnimatedLogo className="w-full h-full drop-shadow-[0_0_15px_hsl(135_100%_50%/0.2)]" />
          </div>
        </section>

        {/* Lockup */}
        <section className="flex flex-col space-y-12">
          <div className="w-full text-xs text-[hsl(135_100%_50%/0.5)] tracking-widest border-b border-[hsl(135_100%_50%/0.2)] pb-4 font-semibold">02 // LOCKUP</div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 py-8">
            <div className="w-24 h-24">
              <AnimatedLogo className="w-full h-full" />
            </div>
            <div className="flex flex-col items-center md:items-start select-none">
              <span className="text-4xl md:text-5xl font-bold text-white tracking-[0.15em] leading-tight">GAME WORLD</span>
              <span className="text-4xl md:text-5xl font-bold text-[hsl(135_100%_50%)] tracking-[0.15em] leading-tight flex items-center">
                HUB
                <span className="inline-block w-6 h-1 bg-[hsl(135_100%_50%)] ml-4 animate-pulse" />
              </span>
            </div>
          </div>
        </section>

        {/* Scale Test */}
        <section className="flex flex-col space-y-12 pb-32">
          <div className="w-full text-xs text-[hsl(135_100%_50%/0.5)] tracking-widest border-b border-[hsl(135_100%_50%/0.2)] pb-4 font-semibold">03 // SCALE TEST</div>
          <div className="flex flex-wrap items-end justify-center gap-16 md:gap-32 py-12">
            <div className="flex flex-col items-center gap-6 group">
              <div className="w-12 h-12 border border-[hsl(135_100%_50%/0.3)] flex items-center justify-center bg-black rounded relative transition-colors shadow-[0_0_15px_hsl(135_100%_50%/0.1)]">
                <AnimatedLogo className="w-full h-full" />
              </div>
              <span className="text-xs text-zinc-500 tracking-widest">48px</span>
            </div>
            <div className="flex flex-col items-center gap-6 group">
              <div className="w-8 h-8 border border-[hsl(135_100%_50%/0.3)] flex items-center justify-center bg-black rounded relative transition-colors shadow-[0_0_15px_hsl(135_100%_50%/0.1)]">
                <AnimatedLogo className="w-full h-full" />
              </div>
              <span className="text-xs text-zinc-500 tracking-widest">32px</span>
            </div>
            <div className="flex flex-col items-center gap-6 group">
              <div className="w-4 h-4 border border-[hsl(135_100%_50%/0.3)] flex items-center justify-center bg-black rounded relative transition-colors shadow-[0_0_15px_hsl(135_100%_50%/0.1)]">
                <AnimatedLogo className="w-full h-full" />
              </div>
              <span className="text-xs text-zinc-500 tracking-widest">16px</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
