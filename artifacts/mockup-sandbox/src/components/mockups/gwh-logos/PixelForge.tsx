import React from 'react';

function PixelForgeLogo({ className = "", size = 24 }: { className?: string, size?: number }) {
  const invader = [
    ".....XXXXXX.....",
    "...XXXXXXXXXX...",
    "..XXXX....XXXX..",
    ".XXX........XXX.",
    ".XXX.EE..EE.XXX.",
    ".XXX.EE..EE.XXX.",
    ".XXXXXXXXXXXXXX.",
    ".XXXXXXXXXXXXXX.",
    "..XXXX....XXXX..",
    "...XX..XX..XX...",
    "....XX....XX....",
    "....XX....XX....",
    "...XXXX..XXXX...",
    "...XX......XX...",
    "...X........X..."
  ];

  const cols = 16;
  const rows = 15;

  return (
    <svg 
      viewBox={`0 0 ${cols} ${rows}`} 
      className={`gwh-pixel-logo ${className}`} 
      width={size} 
      height={size}
      aria-hidden="true"
    >
      {invader.map((rowStr, y) => 
        rowStr.split('').map((char, x) => {
          if (char === '.') return null;
          
          const isEye = char === 'E';
          // Fountain-like delay originating from the top center
          const delay = (Math.abs(x - 7.5) + y) * 0.05;
          
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1.05"
              height="1.05"
              className={isEye ? 'gwh-pixel-eye' : 'gwh-pixel-body'}
              style={{
                animationDelay: `${delay}s`,
                transformOrigin: `${x + 0.5}px ${y + 0.5}px`
              }}
            />
          );
        })
      )}
    </svg>
  );
}

function ScaleCard({ size, label }: { size: number, label: string }) {
  return (
    <div className="flex flex-col items-center gap-6 p-10 border border-[hsl(135,100%,50%,0.1)] rounded-xl bg-[hsl(0,0%,5%)] hover:bg-[hsl(0,0%,7%)] transition-colors group">
      <div className="h-24 flex items-center justify-center relative w-full">
        <div className="absolute inset-0 bg-[hsl(135,100%,50%)] opacity-0 group-hover:opacity-[0.03] transition-opacity rounded-lg"></div>
        <PixelForgeLogo size={size} />
      </div>
      <div className="text-xs uppercase tracking-widest opacity-50 text-center">
        {label}
      </div>
    </div>
  );
}

export function PixelForge() {
  return (
    <div className="min-h-screen bg-[hsl(0,0%,3%)] text-[hsl(135,100%,50%)] font-spline relative overflow-x-hidden selection:bg-[hsl(135,100%,50%)] selection:text-black pb-32">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;600;700&display=swap');
        
        .font-spline {
          font-family: 'Spline Sans Mono', monospace;
        }
        
        /* CRT overlay */
        .gwh-crt::before {
          content: " ";
          display: block;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          background: linear-gradient(
            to bottom,
            rgba(18, 16, 16, 0) 50%,
            rgba(0, 0, 0, 0.25) 50%
          );
          background-size: 100% 4px;
          z-index: 50;
          pointer-events: none;
        }

        .gwh-pixel-body {
          fill: currentColor;
          animation: gwh-pixel-assemble 6s infinite;
          opacity: 0;
        }

        .gwh-pixel-eye {
          fill: #fff;
          animation: gwh-eye-loop 6s infinite;
          opacity: 0;
        }

        @keyframes gwh-pixel-assemble {
          0% { opacity: 0; transform: scale(0.1); }
          5% { opacity: 1; transform: scale(1); fill: currentColor; }
          
          40% { opacity: 1; transform: scale(1); fill: currentColor; }
          45% { opacity: 1; transform: scale(1); fill: #fff; }
          50% { opacity: 1; transform: scale(1); fill: currentColor; }

          75% { opacity: 1; transform: scale(1); fill: currentColor; }
          80%, 100% { opacity: 0; transform: scale(0.1); }
        }

        @keyframes gwh-eye-loop {
          0% { opacity: 0; transform: scale(0.1); }
          5% { opacity: 1; transform: scale(1); }
          
          35% { opacity: 1; transform: scale(1); }
          37% { opacity: 1; transform: scale(1) scaleY(0.1); }
          39% { opacity: 1; transform: scale(1); }
          
          60% { opacity: 1; transform: scale(1); }
          62% { opacity: 1; transform: scale(1) scaleY(0.1); }
          64% { opacity: 1; transform: scale(1); }

          75% { opacity: 1; transform: scale(1); }
          80%, 100% { opacity: 0; transform: scale(0.1); }
        }
      `}</style>
      
      <div className="gwh-crt opacity-40 mix-blend-overlay"></div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 pt-16 md:pt-24 relative z-10 space-y-32">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-[hsl(135,100%,50%,0.2)] pb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-white">Brand Exploration</h1>
            <p className="text-sm opacity-60 mt-2">Hypothesis 01: The Arcade Spirit</p>
          </div>
          <div className="text-left md:text-right text-xs opacity-50 uppercase tracking-widest">
            <p>Target: Game World Hub</p>
            <p className="mt-1">Role: Primary Mark</p>
          </div>
        </header>

        {/* 1. Hero */}
        <section className="space-y-8">
          <div className="flex items-center gap-4 text-xs tracking-[0.2em] opacity-50 uppercase">
            <span>01</span>
            <div className="h-[1px] w-12 bg-current"></div>
            <span>Hero Render</span>
          </div>
          
          <div className="flex justify-center items-center py-32 bg-gradient-to-b from-[hsl(135,100%,5%)] to-transparent rounded-2xl border border-[hsl(135,100%,50%,0.1)] relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[hsl(135,100%,50%)] blur-[150px] opacity-[0.15] rounded-full mix-blend-screen pointer-events-none"></div>
            
            <PixelForgeLogo size={220} className="relative z-10 drop-shadow-[0_0_15px_hsl(135,100%,50%,0.3)]" />
          </div>
        </section>

        {/* 2. Lockup */}
        <section className="space-y-8">
          <div className="flex items-center gap-4 text-xs tracking-[0.2em] opacity-50 uppercase">
            <span>02</span>
            <div className="h-[1px] w-12 bg-current"></div>
            <span>Primary Lockup</span>
          </div>

          <div className="flex flex-col md:flex-row gap-16 justify-center items-center py-24 px-8 bg-[hsl(0,0%,5%)] rounded-2xl border border-[hsl(135,100%,50%,0.1)] relative overflow-hidden">
             <div className="absolute right-0 top-0 w-64 h-64 bg-[hsl(135,100%,50%)] blur-[100px] opacity-[0.05] rounded-full pointer-events-none"></div>

            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12 relative z-10">
              <PixelForgeLogo size={80} className="drop-shadow-[0_0_10px_hsl(135,100%,50%,0.2)]" />
              <div className="flex flex-col justify-center text-center md:text-left">
                <span className="text-4xl md:text-6xl font-bold tracking-tight leading-none text-white">
                  GAME WORLD
                </span>
                <span className="text-4xl md:text-6xl font-bold tracking-[0.3em] leading-none text-[hsl(135,100%,50%)] mt-3">
                  HUB<span className="animate-[pulse_1s_step-end_infinite] opacity-80">_</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Scale Test */}
        <section className="space-y-8">
          <div className="flex items-center gap-4 text-xs tracking-[0.2em] opacity-50 uppercase">
            <span>03</span>
            <div className="h-[1px] w-12 bg-current"></div>
            <span>Scale & Favicon Test</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <ScaleCard size={48} label="App Header / 48px" />
            <ScaleCard size={32} label="List Item / 32px" />
            <ScaleCard size={16} label="Favicon / 16px" />
          </div>
        </section>

        {/* 4. Anatomy */}
        <section className="space-y-8">
          <div className="flex items-center gap-4 text-xs tracking-[0.2em] opacity-50 uppercase">
            <span>04</span>
            <div className="h-[1px] w-12 bg-current"></div>
            <span>Anatomy</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm opacity-80 leading-relaxed">
            <div className="p-10 border border-[hsl(135,100%,50%,0.15)] rounded-xl bg-[hsl(0,0%,5%)]">
              <h3 className="text-white font-bold mb-4 tracking-widest uppercase">The Grid</h3>
              <p className="opacity-80">Constructed on a strict 16x15 pixel matrix. The mark embraces its digital nature, refusing to hide behind anti-aliasing or smoothing. It's a raw representation of arcade DNA, optimized for exact pixel-snapping at the 16px favicon scale.</p>
            </div>
            <div className="p-10 border border-[hsl(135,100%,50%,0.15)] rounded-xl bg-[hsl(0,0%,5%)]">
              <h3 className="text-white font-bold mb-4 tracking-widest uppercase">The Motion</h3>
              <p className="opacity-80">Built with CSS keyframes leveraging staggered animation delays. The assembly wave propagates organically from the top-center, creating a fountain-like reveal. A synchronized high-luminance shimmer reinforces the digital entity metaphor.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
