import React from 'react';

export function HexForge() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;500;700&display=swap');
        
        .font-spline {
          font-family: 'Spline Sans Mono', monospace;
        }
        
        .gwhF-logo {
          color: hsl(135, 100%, 50%);
          --hex-accent: hsl(180, 100%, 50%);
          --hex-bg: hsl(0, 0%, 3%);
        }
        
        .gwhF-pixel {
          fill: currentColor;
        }
        
        .gwhF-sat-a, .gwhF-sat-b {
          fill: var(--hex-accent);
        }

        @keyframes gwhF-assemble {
          0% { opacity: 0; transform: scale(0.1); }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes gwhF-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1); }
        }

        @keyframes gwhF-blink {
          0%, 90% { opacity: 0.8; fill: currentColor; }
          93% { opacity: 1; fill: #fff; transform: scale(1.1); }
          96% { opacity: 0.8; fill: currentColor; transform: scale(1); }
          100% { opacity: 0.8; fill: currentColor; }
        }

        @keyframes gwhF-orbit {
          0%, 40% { opacity: 1; transform: scale(1); filter: brightness(1.2); }
          50%, 90% { opacity: 0.15; transform: scale(0.5); filter: brightness(0.5); }
          100% { opacity: 1; transform: scale(1); filter: brightness(1.2); }
        }
      `}</style>
      
      <div className="min-h-screen bg-[#080808] text-white font-spline selection:bg-[#00ff40]/20 flex flex-col items-center py-20 px-8 relative overflow-hidden">
        
        {/* Hardware CRT Overlay */}
        <div className="fixed inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-40 mix-blend-overlay" />
        
        {/* Terminal Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(#00ff40_1px,transparent_1px),linear-gradient(90deg,#00ff40_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        {/* Radial Vignette */}
        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(8,8,8,1)]" />

        <div className="relative z-10 w-full max-w-4xl flex flex-col gap-24">
          
          {/* Header */}
          <div className="border-b border-[#00ff40]/20 pb-4 flex justify-between items-end">
            <div>
              <p className="text-[#00ff40] text-sm font-bold tracking-widest uppercase">Concept: Hex-Forge</p>
              <p className="text-neutral-500 text-xs mt-1 tracking-widest">BRAND IDENTITY / GWH.2024</p>
            </div>
            <div className="text-right">
              <p className="text-neutral-600 text-[10px] tracking-widest">STATUS: <span className="text-[#00ff40]">ACTIVE</span></p>
            </div>
          </div>

          {/* Hero Section */}
          <div className="flex flex-col items-center gap-8">
            <p className="text-neutral-500 text-xs tracking-widest self-start">01. HERO MARK</p>
            <div className="w-full p-20 border border-[#00ff40]/10 bg-black/40 rounded-sm flex items-center justify-center backdrop-blur-sm relative group overflow-hidden">
              <div className="absolute inset-0 bg-[#00ff40] opacity-0 group-hover:opacity-[0.02] transition-opacity duration-1000" />
              <Logo className="w-56 h-56 drop-shadow-[0_0_15px_rgba(0,255,64,0.15)]" />
            </div>
          </div>

          {/* Lockup Section */}
          <div className="flex flex-col items-center gap-8">
            <p className="text-neutral-500 text-xs tracking-widest self-start">02. LOGO LOCKUP</p>
            <div className="w-full p-16 border border-[#00ff40]/10 bg-black/40 rounded-sm flex items-center justify-center backdrop-blur-sm">
              <div className="flex items-center gap-8">
                <Logo className="w-20 h-20 drop-shadow-[0_0_10px_rgba(0,255,64,0.15)]" />
                <div className="flex flex-col justify-center gap-2">
                  <h1 className="text-5xl font-bold tracking-normal text-white leading-none">
                    GAME WORLD <span className="text-[#00ff40]">HUB</span>
                  </h1>
                  <p className="text-neutral-400 text-sm tracking-[0.3em] font-medium">SOCIAL COMMAND CENTER</p>
                </div>
              </div>
            </div>
          </div>

          {/* Scale Test Section */}
          <div className="flex flex-col items-center gap-8">
            <p className="text-neutral-500 text-xs tracking-widest self-start">03. SCALE TEST (48px / 32px / 16px)</p>
            <div className="w-full p-16 border border-[#00ff40]/10 bg-black/40 rounded-sm flex items-center justify-center gap-20 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 flex items-center justify-center border border-dashed border-[#00ff40]/20 rounded-sm bg-black/60 relative">
                  <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-[#00ff40]/40" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-[#00ff40]/40" />
                  <Logo className="w-12 h-12" />
                </div>
                <p className="text-[10px] text-neutral-500 tracking-widest">48PX</p>
              </div>
              
              <div className="flex flex-col items-center gap-6">
                <div className="w-12 h-12 flex items-center justify-center border border-dashed border-[#00ff40]/20 rounded-sm bg-black/60 relative">
                  <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-[#00ff40]/40" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-[#00ff40]/40" />
                  <Logo className="w-8 h-8" />
                </div>
                <p className="text-[10px] text-neutral-500 tracking-widest">32PX</p>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="w-8 h-8 flex items-center justify-center border border-dashed border-[#00ff40]/20 rounded-sm bg-black/60 relative">
                  <div className="absolute -top-1 -left-1 w-1 h-1 border-t border-l border-[#00ff40]/40" />
                  <div className="absolute -bottom-1 -right-1 w-1 h-1 border-b border-r border-[#00ff40]/40" />
                  <Logo className="w-4 h-4" />
                </div>
                <p className="text-[10px] text-neutral-500 tracking-widest">16PX</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-8 pb-16 text-neutral-600 text-[10px] tracking-widest">
            <p>DESIGN HYPOTHESIS: "THE ARCADE CORE" // 8-BIT GRID ASSEMBLY // CSS KEYFRAMES</p>
          </div>
        </div>
      </div>
    </>
  );
}

const Logo = ({ className = "" }: { className?: string }) => {
  const matrix = [
    "................",
    ".......AA.......",
    ".......AA.......",
    ".....RR..RR.....",
    "..BBR......RBB..",
    "..BBR......RBB..",
    "..R...CCCC...R..",
    "..R..CHHHHC..R..",
    "..R..CHHHHC..R..",
    "..R...CCCC...R..",
    "..AAR......RAA..",
    "..AAR......RAA..",
    ".....RR..RR.....",
    ".......BB.......",
    ".......BB.......",
    "................"
  ];

  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`gwhF-logo ${className}`}
      aria-label="HexForge Logo"
    >
      {matrix.map((rowStr, y) =>
        rowStr.split('').map((char, x) => {
          if (char === '.') return null;

          const dx = x - 7.5;
          const dy = y - 7.5;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          const assembleDelay = dist * 0.08;
          let className = 'gwhF-pixel';
          let style: React.CSSProperties = {
            transformOrigin: `${x + 0.5}px ${y + 0.5}px`
          };

          if (char === 'R' || char === 'C') {
            style.animation = `gwhF-assemble 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both, gwhF-pulse 4s ease-in-out infinite`;
            style.animationDelay = `${assembleDelay}s, ${1 + dist * 0.15}s`;
          } else if (char === 'H') {
            style.animation = `gwhF-assemble 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both, gwhF-blink 4s infinite`;
            style.animationDelay = `${assembleDelay}s, ${2 + (x + y) * 0.05}s`;
          } else if (char === 'A') {
            className += ' gwhF-sat-a';
            style.animation = `gwhF-assemble 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both, gwhF-orbit 2s cubic-bezier(0.4, 0, 0.2, 1) infinite`;
            style.animationDelay = `${assembleDelay}s, 2s`;
          } else if (char === 'B') {
            className += ' gwhF-sat-b';
            style.animation = `gwhF-assemble 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both, gwhF-orbit 2s cubic-bezier(0.4, 0, 0.2, 1) infinite`;
            style.animationDelay = `${assembleDelay}s, 3s`;
          }

          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1"
              height="1"
              className={className}
              style={style}
              shapeRendering="crispEdges"
            />
          );
        })
      )}
    </svg>
  );
};
