import React from "react";

export default function PhantomBlade() {
  return (
    <div className="relative w-full min-w-[1400px] h-[900px] bg-[#0D0D0F] text-[#F0F0F5] overflow-hidden flex flex-col selection:bg-[#DC2626] selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&display=swap');

        .font-bebas { font-family: 'Bebas Neue', sans-serif; }
        .font-inter { font-family: 'Inter', sans-serif; }

        .bg-carbon-pattern {
          background-image: repeating-linear-gradient(
            45deg,
            rgba(168, 168, 179, 0.03) 0px,
            rgba(168, 168, 179, 0.03) 1px,
            transparent 1px,
            transparent 8px
          );
        }

        .text-chrome {
          background: linear-gradient(135deg, #F0F0F5 0%, #A8A8B3 40%, #ffffff 60%, #6A6A7A 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          color: transparent;
        }

        .blade-accent {
          position: absolute;
          top: -20%;
          right: -10%;
          width: 900px;
          height: 1400px;
          background: linear-gradient(90deg, rgba(220, 38, 38, 0.06) 0%, rgba(220, 38, 38, 0) 100%);
          transform: rotate(-15deg);
          pointer-events: none;
          border-left: 1px solid rgba(220, 38, 38, 0.15);
        }

        .clip-button {
          clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
        }
      `}} />

      {/* Decorative Background Elements */}
      <div className="absolute inset-0 bg-carbon-pattern pointer-events-none" />
      <div className="blade-accent" />

      {/* Top crimson line */}
      <div className="h-[2px] w-full bg-[#DC2626] relative z-20" />

      {/* Navigation */}
      <nav className="relative z-20 w-full px-12 h-[88px] flex items-center justify-between border-b border-[rgba(168,168,179,0.12)]">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 relative flex items-center justify-center text-[#DC2626]">
            {/* Mascot / Logo icon: Angular Monogram / Shield */}
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full drop-shadow-[0_0_8px_rgba(220,38,38,0.5)]">
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2ZM12 4.5L19.5 8V15.5L12 19.5L4.5 15.5V8L12 4.5Z" fill="currentColor"/>
              <path d="M12 10.5L9 12V15L12 13.5L15 15V12L12 10.5Z" fill="currentColor"/>
            </svg>
          </div>
          <span className="font-bebas text-2xl tracking-[4px] text-chrome pt-1">GAME WORLD HUB</span>
        </div>

        <div className="hidden lg:flex items-center gap-10">
          {['FEATURES', 'WINDOWS APP', 'PLANS', 'SUPPORT', 'CONTACT'].map(link => (
            <a key={link} href="#" className="font-inter font-medium text-[11px] tracking-[2px] text-[#A8A8B3] hover:text-[#F0F0F5] transition-colors uppercase">
              {link}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-6">
          <a href="#" className="font-inter font-medium text-[11px] tracking-[2px] text-[#A8A8B3] hover:text-[#F0F0F5] uppercase">
            LOG IN
          </a>
          <button className="bg-[#DC2626] text-white font-inter font-bold text-[11px] tracking-[2px] uppercase px-7 py-3 hover:bg-[#FF3333] transition-colors clip-button">
            START FREE
          </button>
          <div className="w-[1px] h-4 bg-[#A8A8B3]/30 mx-2" />
          <button className="font-inter text-[12px] font-medium text-[#A8A8B3] hover:text-[#F0F0F5]">
            العربية
          </button>
        </div>
      </nav>

      {/* Main Hero Content */}
      <main className="relative z-10 flex-1 w-full px-12 flex items-center h-full">
        <div className="w-[65%] max-w-[850px] flex flex-col items-start pt-8 pb-16">
          
          <div className="flex items-center gap-3 border border-[#DC2626] bg-[#DC2626]/5 px-3 py-1.5 mb-10">
            <div className="w-2 h-2 bg-[#DC2626] shadow-[0_0_8px_#DC2626]" />
            <span className="font-inter text-[10px] font-bold tracking-[3px] text-[#DC2626] uppercase">SYSTEM_ONLINE</span>
          </div>

          <h1 className="font-inter font-bold text-[64px] leading-[1.1] tracking-tight text-[#F0F0F5] mb-6">
            Your squad is waiting right now
          </h1>

          <div className="mb-6 relative">
            <h2 className="font-bebas text-[120px] leading-[0.85] tracking-[8px] text-chrome mb-2">
              GAME WORLD HUB
            </h2>
            <div className="h-[4px] w-[45%] bg-[#DC2626]" />
          </div>

          <p className="font-bebas text-2xl tracking-[8px] text-[#DC2626] mb-8">
            GAMING ALONE IS OVER.
          </p>

          <p className="font-inter text-lg text-[#A8A8B3] leading-relaxed max-w-2xl mb-12 font-light">
            One second and you know who's online, who's playing what. Join the party, share your screen, find your squad. Now with global chat, GIFs, emoji reactions, and Pro bubble colours — one place for everything.
          </p>

          <div className="flex items-center gap-6 mb-16">
            <button className="bg-[#DC2626] text-white font-inter font-bold text-sm tracking-[3px] uppercase px-12 h-[52px] hover:bg-[#FF3333] transition-colors clip-button flex items-center justify-center">
              START FOR FREE
            </button>
            <button className="bg-transparent border border-[rgba(168,168,179,0.4)] text-[#A8A8B3] hover:text-[#F0F0F5] hover:border-[#F0F0F5] font-inter font-bold text-sm tracking-[3px] uppercase px-12 h-[52px] transition-colors flex items-center justify-center rounded-none">
              LOG IN
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center relative w-2.5 h-2.5">
              <div className="absolute inset-0 rounded-full bg-[#DC2626] animate-ping opacity-75" />
              <div className="absolute inset-0 rounded-full bg-[#DC2626]" />
            </div>
            <span className="font-inter text-[13px]">
              <strong className="text-[#DC2626] font-bold">340 players</strong> <span className="text-[#6A6A7A]">online now</span>
            </span>
          </div>
        </div>

        {/* Right side decorative */}
        <div className="absolute right-0 top-0 bottom-0 w-[45%] pointer-events-none flex items-center justify-end overflow-hidden opacity-[0.15]">
          <svg viewBox="0 0 600 900" fill="none" className="w-full h-full text-[#DC2626] translate-x-[20%]">
            <path d="M600 0L200 450L600 900V750L350 450L600 150V0Z" fill="currentColor"/>
            <path d="M400 0L0 450L400 900V800L100 450L400 100V0Z" fill="currentColor" opacity="0.3"/>
            <path d="M500 0L300 450L500 900V850L350 450L500 50V0Z" fill="currentColor" opacity="0.1"/>
          </svg>
        </div>
      </main>

      {/* Scroll Hint */}
      <div className="absolute bottom-8 left-12 z-20 flex items-center opacity-60 hover:opacity-100 transition-opacity">
        <span className="font-inter text-[11px] font-medium tracking-[4px] text-[#A8A8B3] uppercase">
          SCROLL TO EXPLORE <span className="text-[#DC2626] inline-block font-bold ml-1">↓</span>
        </span>
      </div>
    </div>
  );
}
