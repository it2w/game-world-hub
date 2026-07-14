import React from 'react';

export function HexCore() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;500;700&display=swap');
        
        .font-spline {
          font-family: 'Spline Sans Mono', monospace;
        }
        
        .hex-logo {
          color: hsl(135, 100%, 50%);
          --hex-accent: hsl(180, 100%, 50%);
          --hex-bg: hsl(0, 0%, 3%);
        }
        
        .hex-spin {
          animation: hex-spin 10s linear infinite;
          transform-origin: 50px 50px;
        }
        
        .hex-spin-reverse {
          animation: hex-spin-reverse 15s linear infinite;
          transform-origin: 50px 50px;
        }
        
        .hex-pulse {
          animation: hex-pulse 4s ease-in-out infinite;
          transform-origin: 50px 50px;
        }
        
        .hex-breath {
          animation: hex-breath 4s ease-in-out infinite;
          transform-origin: 50px 50px;
        }
        
        @keyframes hex-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes hex-spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        
        @keyframes hex-pulse {
          0%, 100% { transform: scale(0.95); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        
        @keyframes hex-breath {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.5; }
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
              <p className="text-[#00ff40] text-sm font-bold tracking-widest uppercase">Concept: Hex-Core</p>
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
            <p>DESIGN HYPOTHESIS: "THE HUB" // PURE INLINE SVG // CSS KEYFRAMES</p>
          </div>
        </div>
      </div>
    </>
  );
}

const Logo = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`hex-logo ${className}`}
    aria-label="HexCore Logo"
  >
    {/* Outer faint boundary */}
    <polygon
      points="50,2 91.57,26 91.57,74 50,98 8.43,74 8.43,26"
      stroke="currentColor"
      strokeWidth="0.5"
      strokeOpacity="0.2"
      className="hex-breath"
    />
    
    {/* Main segmented rotating ring */}
    <g className="hex-spin">
      <polygon
        points="50,8 86.37,29 86.37,71 50,92 13.63,71 13.63,29"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="300"
        strokeDasharray="60 40"
      />
      {/* Node satellites on the ring */}
      <circle cx="86.37" cy="29" r="2.5" fill="var(--hex-accent)" />
      <circle cx="50" cy="92" r="2.5" fill="var(--hex-accent)" />
      <circle cx="13.63" cy="29" r="2.5" fill="var(--hex-accent)" />
    </g>

    {/* Inner counter-rotating tech track */}
    <g className="hex-spin-reverse">
      <polygon
        points="50,22 74.25,36 74.25,64 50,78 25.75,64 25.75,36"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        pathLength="100"
        strokeDasharray="2 4"
      />
      {/* Highlight segments on the inner track */}
      <polygon
        points="50,22 74.25,36 74.25,64 50,78 25.75,64 25.75,36"
        stroke="var(--hex-accent)"
        strokeWidth="2"
        pathLength="100"
        strokeDasharray="10 90"
        strokeLinecap="round"
      />
    </g>

    {/* Center core */}
    <g className="hex-pulse">
      {/* Core hexagon */}
      <polygon
        points="50,34 63.86,42 63.86,58 50,66 36.14,58 36.14,42"
        fill="currentColor"
      />
      {/* Portal center cut-out */}
      <circle cx="50" cy="50" r="4.5" fill="currentColor" stroke="var(--hex-bg)" strokeWidth="2" />
      <circle cx="50" cy="50" r="2.5" fill="var(--hex-bg)" />
    </g>
  </svg>
);
