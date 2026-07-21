import React from 'react';

export default function VoidLuxury() {
  return (
    <div 
      className="relative w-full h-full min-h-[900px] overflow-hidden bg-[#0A0A0B] text-[#F5F0E8] flex flex-col font-sans" 
      style={{ width: 1400, height: 900 }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Inter:wght@300;400;500;600&display=swap');
        
        .font-serif {
          font-family: 'Playfair Display', serif;
        }
        .font-sans {
          font-family: 'Inter', sans-serif;
        }
        .text-gold {
          color: #C9A84C;
        }
        .text-gold-gradient {
          background: linear-gradient(135deg, #C9A84C, #E8C97D, #C9A84C);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .bg-gold-gradient {
          background: linear-gradient(135deg, #C9A84C, #E8C97D, #C9A84C);
        }
        
        .noise-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
          z-index: 10;
        }
        
        .glow-bottom {
          position: absolute;
          bottom: -200px;
          left: 50%;
          transform: translateX(-50%);
          width: 1000px;
          height: 600px;
          background: radial-gradient(circle at center, rgba(201,168,76,0.1) 0%, transparent 70%);
          pointer-events: none;
        }
      `}} />
      
      <div className="noise-overlay"></div>
      <div className="glow-bottom"></div>

      {/* Nav */}
      <nav className="relative z-20 flex items-center justify-between px-10 py-6 border-b border-[#C9A84C]/20">
        <div className="flex items-center gap-3 w-[250px]">
          {/* Mascot / Logo */}
          <div className="w-8 h-8 rounded-full border border-[#C9A84C] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 21h14M2 17l5-1.5L12 11l5 4.5L22 17l-3-9-5 3.5L12 2 10 11.5 5 8l-3 9z" />
            </svg>
          </div>
          <span className="font-serif font-black tracking-[0.2em] uppercase text-[12px] text-[#F5F0E8] mt-0.5">
            Game World Hub
          </span>
        </div>
        
        <div className="flex items-center gap-10 font-sans text-[11px] font-medium tracking-[0.15em] uppercase text-[#8A7D6A]">
          <a href="#" className="hover:text-[#C9A84C] transition-colors">Features</a>
          <a href="#" className="hover:text-[#C9A84C] transition-colors">Windows App</a>
          <a href="#" className="hover:text-[#C9A84C] transition-colors">Plans</a>
          <a href="#" className="hover:text-[#C9A84C] transition-colors">Support</a>
          <a href="#" className="hover:text-[#C9A84C] transition-colors">Contact</a>
        </div>
        
        <div className="flex items-center justify-end gap-8 text-[11px] font-medium tracking-[0.15em] uppercase w-[250px]">
          <a href="#" className="text-[#8A7D6A] hover:text-[#C9A84C] transition-colors">العربية</a>
          <div className="flex items-center gap-4">
            <a href="#" className="text-[#F5F0E8] hover:text-[#C9A84C] transition-colors border border-transparent hover:border-[#C9A84C]/30 px-4 py-2">Log In</a>
            <a href="#" className="bg-gold-gradient text-[#0A0A0B] font-bold px-6 py-2 hover:opacity-90 transition-opacity">Start Free</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-6 mt-[-40px]">
        {/* Status Badge */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-16 h-[1px] bg-[#C9A84C]/30"></div>
          <div className="flex items-center gap-2 border border-[#C9A84C]/50 px-5 py-2 rounded-full bg-[#0A0A0B]/50 backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] shadow-[0_0_8px_rgba(201,168,76,0.8)] animate-pulse"></div>
            <span className="font-sans text-[10px] text-[#C9A84C] tracking-[0.3em] uppercase mt-0.5">System_Online</span>
          </div>
          <div className="w-16 h-[1px] bg-[#C9A84C]/30"></div>
        </div>

        {/* H1 */}
        <h1 className="font-serif italic text-[62px] leading-tight text-[#F5F0E8] mb-4 max-w-4xl drop-shadow-2xl">
          Your squad is waiting right now
        </h1>
        
        {/* Brand Display */}
        <div className="font-serif font-black text-[96px] leading-none text-gold-gradient tracking-[0.25em] uppercase mb-10 ml-[0.25em]">
          Game World Hub
        </div>
        
        {/* Tagline */}
        <div className="font-sans font-light text-[18px] text-[#8A7D6A] tracking-[0.25em] uppercase mb-8">
          Gaming alone is over.
        </div>
        
        {/* Body Copy */}
        <p className="font-sans text-[16px] text-[#8A7D6A] max-w-[540px] leading-[1.8] mb-14">
          One second and you know who's online, who's playing what. Join the party, share your screen, find your squad. Now with global chat, GIFs, emoji reactions, and Pro bubble colours — one place for everything.
        </p>
        
        {/* CTAs */}
        <div className="flex items-center gap-6 mb-14">
          <button className="bg-gold-gradient text-[#0A0A0B] font-bold text-[13px] tracking-[0.15em] uppercase px-12 h-[56px] hover:opacity-90 transition-opacity flex items-center justify-center">
            Start For Free
          </button>
          <button className="border border-[#C9A84C] text-[#C9A84C] font-bold text-[13px] tracking-[0.15em] uppercase px-12 h-[56px] hover:bg-[#C9A84C]/10 transition-colors flex items-center justify-center">
            Log In
          </button>
        </div>
        
        {/* Social Proof */}
        <div className="flex items-center gap-2 text-[13px]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]"></div>
          <span className="font-bold text-[#C9A84C]">340</span>
          <span className="text-[#8A7D6A] uppercase tracking-[0.1em] text-[11px] mt-0.5">players online now</span>
        </div>
      </main>

      {/* Scroll hint */}
      <div className="relative z-20 pb-12 flex justify-center">
        <div className="flex flex-col items-center gap-3 text-[#8A7D6A] text-[10px] font-medium tracking-[0.2em] uppercase">
          <span>Scroll to explore</span>
          <div className="text-[#C9A84C] animate-bounce">↓</div>
        </div>
      </div>
    </div>
  );
}
