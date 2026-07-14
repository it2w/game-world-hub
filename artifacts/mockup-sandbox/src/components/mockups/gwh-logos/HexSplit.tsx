import React from 'react';

export function HexSplit() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;500;700&display=swap');
        
        .font-spline {
          font-family: 'Spline Sans Mono', monospace;
        }
        
        .gwhS-clean, .gwhS-pixel {
          color: hsl(135, 100%, 50%);
          --hex-accent: hsl(180, 100%, 50%);
          --hex-bg: hsl(0, 0%, 3%);
        }

        /* ----- Clean Keyframes ----- */
        .gwhS-spin {
          animation: gwhS-spin 10s linear infinite;
          transform-origin: 45px 50px;
        }
        
        .gwhS-spin-reverse {
          animation: gwhS-spin-reverse 15s linear infinite;
          transform-origin: 45px 50px;
        }

        .gwhS-spin-center {
          animation: gwhS-spin 10s linear infinite;
          transform-origin: 0px 0px;
        }
        
        .gwhS-breath {
          animation: gwhS-breath 4s ease-in-out infinite;
        }

        .gwhS-clean-undock {
          animation: gwhS-clean-undock 6s infinite;
        }

        .gwhS-clean-pulse {
          animation: gwhS-clean-pulse 3s ease-in-out infinite;
          transform-origin: 0px 0px;
        }

        .gwhS-clean-tether {
          animation: gwhS-clean-tether 6s infinite;
        }

        @keyframes gwhS-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes gwhS-spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        
        @keyframes gwhS-breath {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.5; }
        }

        @keyframes gwhS-clean-undock {
          0%, 15% { transform: translate(45px, 50px); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
          35%, 80% { transform: translate(115px, 50px); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
          100% { transform: translate(45px, 50px); }
        }

        @keyframes gwhS-clean-pulse {
          0%, 100% { transform: scale(0.95); opacity: 0.9; filter: drop-shadow(0 0 1px var(--hex-accent)); }
          50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 5px var(--hex-accent)); }
        }

        @keyframes gwhS-clean-tether {
          0%, 20% { opacity: 0; }
          40%, 75% { opacity: 0.6; }
          95%, 100% { opacity: 0; }
        }

        /* ----- Pixel Keyframes ----- */
        .gwhS-pixel-undock {
          animation: gwhS-pixel-undock 6s infinite;
        }

        .gwhS-pixel-tether {
          animation: gwhS-pixel-tether 6s infinite;
        }

        .gwhS-pixel-core-pulse {
          animation: gwhS-pixel-core-pulse 3s infinite;
        }

        .gwhS-pixel-hex-pulse {
          animation: gwhS-pixel-hex-pulse 6s infinite;
        }

        .gwhS-pixel-blink {
          animation: gwhS-pixel-blink 3s infinite;
        }

        @keyframes gwhS-pixel-undock {
          0%, 15% { transform: translate(6px, 6px); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
          35%, 80% { transform: translate(22px, 6px); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
          100% { transform: translate(6px, 6px); }
        }

        @keyframes gwhS-pixel-tether {
          0%, 25% { opacity: 0; }
          40%, 75% { opacity: 0.8; }
          90%, 100% { opacity: 0; }
        }

        @keyframes gwhS-pixel-core-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; filter: drop-shadow(0 0 1px var(--hex-accent)); }
        }

        @keyframes gwhS-pixel-hex-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }

        @keyframes gwhS-pixel-blink {
          0%, 90% { fill: var(--hex-accent); }
          95% { fill: #fff; }
          100% { fill: var(--hex-accent); }
        }
      `}</style>

      <div className="min-h-screen bg-[#080808] text-white font-spline selection:bg-[#00ff40]/20 flex flex-col items-center py-20 px-8 relative overflow-hidden pb-32">
        
        {/* Overlays */}
        <div className="fixed inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-40 mix-blend-overlay" />
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(#00ff40_1px,transparent_1px),linear-gradient(90deg,#00ff40_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(8,8,8,1)]" />

        <div className="relative z-10 w-full max-w-5xl flex flex-col gap-32">
          
          {/* Header */}
          <div className="border-b border-[#00ff40]/20 pb-4 flex justify-between items-end">
            <div>
              <p className="text-[#00ff40] text-sm font-bold tracking-widest uppercase">Concept: Hex-Split</p>
              <p className="text-neutral-500 text-xs mt-1 tracking-widest">BRAND IDENTITY / GWH.2024</p>
            </div>
            <div className="text-right">
              <p className="text-neutral-600 text-[10px] tracking-widest">STATUS: <span className="text-white">AWAITING REVIEW</span></p>
            </div>
          </div>

          {/* SECTION 1: CLEAN */}
          <div className="flex flex-col gap-16">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold tracking-widest text-white">SECTION 1 // CLEAN</h2>
              <div className="h-[1px] flex-grow bg-gradient-to-r from-[#00ff40]/30 to-transparent"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Hero */}
              <div className="flex flex-col gap-4">
                <p className="text-neutral-500 text-xs tracking-widest">01. HERO RENDER</p>
                <div className="w-full h-[360px] border border-[#00ff40]/10 bg-black/40 rounded-sm flex items-center justify-center backdrop-blur-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[#00ff40] opacity-0 group-hover:opacity-[0.02] transition-opacity duration-1000" />
                  <CleanLogo className="w-72 drop-shadow-[0_0_15px_rgba(0,255,64,0.15)]" />
                </div>
              </div>

              {/* Lockup */}
              <div className="flex flex-col gap-4">
                <p className="text-neutral-500 text-xs tracking-widest">02. LOGO LOCKUP</p>
                <div className="w-full h-[360px] border border-[#00ff40]/10 bg-black/40 rounded-sm flex flex-col items-center justify-center backdrop-blur-sm gap-12 relative overflow-hidden">
                  <CleanLogo className="h-24 drop-shadow-[0_0_10px_rgba(0,255,64,0.15)]" />
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h1 className="text-3xl font-bold tracking-normal text-white leading-none">
                      GAME WORLD <span className="text-[#00ff40]">HUB</span>
                    </h1>
                    <p className="text-neutral-400 text-[10px] tracking-[0.3em] font-medium mt-1">SOCIAL COMMAND CENTER</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scale Test */}
            <div className="flex flex-col gap-4">
              <p className="text-neutral-500 text-xs tracking-widest">03. SCALE TEST (48px / 32px / 16px)</p>
              <div className="w-full py-16 border border-[#00ff40]/10 bg-black/40 rounded-sm flex flex-wrap items-center justify-center gap-24 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-6">
                  <div className="h-16 flex items-center justify-center border-b border-dashed border-[#00ff40]/20 px-4">
                    <CleanLogo className="h-12 w-auto" />
                  </div>
                  <p className="text-[10px] text-neutral-500 tracking-widest">48PX</p>
                </div>
                <div className="flex flex-col items-center gap-6">
                  <div className="h-16 flex items-center justify-center border-b border-dashed border-[#00ff40]/20 px-4">
                    <CleanLogo className="h-8 w-auto" />
                  </div>
                  <p className="text-[10px] text-neutral-500 tracking-widest">32PX</p>
                </div>
                <div className="flex flex-col items-center gap-6">
                  <div className="h-16 flex items-center justify-center border-b border-dashed border-[#00ff40]/20 px-4">
                    <CleanLogo className="h-4 w-auto" />
                  </div>
                  <p className="text-[10px] text-neutral-500 tracking-widest">16PX</p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: PIXEL */}
          <div className="flex flex-col gap-16 mt-8">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold tracking-widest text-white">SECTION 2 // PIXEL</h2>
              <div className="h-[1px] flex-grow bg-gradient-to-r from-[#00ff40]/30 to-transparent"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Hero */}
              <div className="flex flex-col gap-4">
                <p className="text-neutral-500 text-xs tracking-widest">01. HERO RENDER</p>
                <div className="w-full h-[360px] border border-[#00ff40]/10 bg-black/40 rounded-sm flex items-center justify-center backdrop-blur-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[#00ff40] opacity-0 group-hover:opacity-[0.02] transition-opacity duration-1000" />
                  <PixelLogo className="w-80 drop-shadow-[0_0_15px_rgba(0,255,64,0.15)]" />
                </div>
              </div>

              {/* Lockup */}
              <div className="flex flex-col gap-4">
                <p className="text-neutral-500 text-xs tracking-widest">02. LOGO LOCKUP</p>
                <div className="w-full h-[360px] border border-[#00ff40]/10 bg-black/40 rounded-sm flex flex-col items-center justify-center backdrop-blur-sm gap-12 relative overflow-hidden">
                  <PixelLogo className="h-20 drop-shadow-[0_0_10px_rgba(0,255,64,0.15)]" />
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h1 className="text-3xl font-bold tracking-normal text-white leading-none">
                      GAME WORLD <span className="text-[#00ff40]">HUB</span>
                    </h1>
                    <p className="text-neutral-400 text-[10px] tracking-[0.3em] font-medium mt-1">SOCIAL COMMAND CENTER</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scale Test */}
            <div className="flex flex-col gap-4">
              <p className="text-neutral-500 text-xs tracking-widest">03. SCALE TEST (48px / 32px / 16px)</p>
              <div className="w-full py-16 border border-[#00ff40]/10 bg-black/40 rounded-sm flex flex-wrap items-center justify-center gap-24 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-6">
                  <div className="h-16 flex items-center justify-center border-b border-dashed border-[#00ff40]/20 px-4">
                    <PixelLogo className="h-12 w-auto" />
                  </div>
                  <p className="text-[10px] text-neutral-500 tracking-widest">48PX</p>
                </div>
                <div className="flex flex-col items-center gap-6">
                  <div className="h-16 flex items-center justify-center border-b border-dashed border-[#00ff40]/20 px-4">
                    <PixelLogo className="h-8 w-auto" />
                  </div>
                  <p className="text-[10px] text-neutral-500 tracking-widest">32PX</p>
                </div>
                <div className="flex flex-col items-center gap-6">
                  <div className="h-16 flex items-center justify-center border-b border-dashed border-[#00ff40]/20 px-4">
                    <PixelLogo className="h-4 w-auto" />
                  </div>
                  <p className="text-[10px] text-neutral-500 tracking-widest">16PX</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

const CleanLogo = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 160 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`gwhS-clean ${className}`}
    aria-label="HexSplit Clean Logo"
  >
    {/* Faint Boundary */}
    <polygon
      points="45,10 79.64,30 79.64,70 45,90 10.36,70 10.36,30"
      stroke="currentColor"
      strokeWidth="0.5"
      strokeOpacity="0.2"
      className="gwhS-breath"
    />
    
    {/* Main Segmented Ring */}
    <g className="gwhS-spin">
      <polygon
        points="45,20 70.98,35 70.98,65 45,80 19.02,65 19.02,35"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="300"
        strokeDasharray="60 40"
      />
      <circle cx="70.98" cy="35" r="2.5" fill="var(--hex-accent)" />
      <circle cx="45" cy="80" r="2.5" fill="var(--hex-accent)" />
      <circle cx="19.02" cy="35" r="2.5" fill="var(--hex-accent)" />
    </g>

    {/* Inner Track */}
    <g className="gwhS-spin-reverse">
      <polygon
        points="45,28 64.05,39 64.05,61 45,72 25.95,61 25.95,39"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        pathLength="100"
        strokeDasharray="2 4"
      />
      <polygon
        points="45,28 64.05,39 64.05,61 45,72 25.95,61 25.95,39"
        stroke="var(--hex-accent)"
        strokeWidth="2"
        pathLength="100"
        strokeDasharray="10 90"
        strokeLinecap="round"
      />
    </g>

    {/* Tether */}
    <line x1="75" y1="50" x2="100" y2="50" stroke="var(--hex-accent)" strokeWidth="1.5" strokeDasharray="2 4" className="gwhS-clean-tether" />

    {/* Detached Core */}
    <g className="gwhS-clean-undock">
      <g className="gwhS-clean-pulse">
        <polygon
          points="0,-12 10.39,-6 10.39,6 0,12 -10.39,6 -10.39,-6"
          fill="currentColor"
        />
        <circle cx="0" cy="0" r="4.5" fill="currentColor" stroke="var(--hex-bg)" strokeWidth="2" />
        <circle cx="0" cy="0" r="2.5" fill="var(--hex-bg)" />
        <circle cx="0" cy="0" r="18" stroke="var(--hex-accent)" strokeWidth="0.5" strokeDasharray="2 6" className="gwhS-spin-center" />
      </g>
    </g>
  </svg>
);

const PixelLogo = ({ className = "" }: { className?: string }) => {
  const hexMatrix = [
    ".....XXXXXX.....", // 0
    "...XX......XX...", // 1
    "..X..........X..", // 2
    ".X............X.", // 3
    "X..............X", // 4
    "X....XXXXXX....X", // 5 
    "X...XX....XX...X", // 6 
    "X...X......X...X", // 7
    "X...X......X...X", // 8
    "X...XX....XX...X", // 9
    "X....XXXXXX....X", // 10
    "X..............X", // 11
    ".X............X.", // 12
    "..X..........X..", // 13
    "...XX......XX...", // 14
    ".....XXXXXX.....", // 15
  ];

  const corePixels = [
    ".XX.", // 0
    "XCCX", // 1
    "XCCX", // 2
    ".XX."  // 3
  ];

  return (
    <svg
      viewBox="0 0 32 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`gwhS-pixel ${className}`}
      aria-label="HexSplit Pixel Logo"
    >
      {/* Tether */}
      <g className="gwhS-pixel-tether">
        <rect x="16" y="7" width="1" height="1" fill="var(--hex-accent)" shapeRendering="crispEdges" />
        <rect x="17" y="8" width="1" height="1" fill="var(--hex-accent)" shapeRendering="crispEdges" />
        <rect x="18" y="7" width="1" height="1" fill="var(--hex-accent)" shapeRendering="crispEdges" />
        <rect x="19" y="8" width="1" height="1" fill="var(--hex-accent)" shapeRendering="crispEdges" />
        <rect x="20" y="7" width="1" height="1" fill="var(--hex-accent)" shapeRendering="crispEdges" />
      </g>

      {/* Hexagon */}
      <g className="gwhS-pixel-hex-pulse">
        {hexMatrix.map((rowStr, y) =>
          rowStr.split('').map((char, x) => {
            if (char === '.') return null;
            return (
              <rect
                key={`hex-${x}-${y}`}
                x={x}
                y={y}
                width="1"
                height="1"
                fill="currentColor"
                shapeRendering="crispEdges"
              />
            );
          })
        )}
      </g>

      {/* Core */}
      <g className="gwhS-pixel-undock">
        <g className="gwhS-pixel-core-pulse">
          {corePixels.map((rowStr, y) =>
            rowStr.split('').map((char, x) => {
              if (char === '.') return null;
              return (
                <rect
                  key={`core-${x}-${y}`}
                  x={x}
                  y={y}
                  width="1"
                  height="1"
                  fill={char === 'C' ? "var(--hex-accent)" : "currentColor"}
                  className={char === 'C' ? "gwhS-pixel-blink" : ""}
                  shapeRendering="crispEdges"
                />
              );
            })
          )}
        </g>
      </g>
    </svg>
  );
};
