export default function ElectricCrystal() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500&display=swap');
        
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        
        @keyframes float-1 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        
        @keyframes float-2 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-18px); }
        }
        
        @keyframes float-3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        .gradient-text {
          background: linear-gradient(135deg, #00D4FF 0%, #7B4FFF 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .btn-gradient {
          background: linear-gradient(135deg, #00D4FF 0%, #7B4FFF 100%);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .btn-gradient:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0, 212, 255, 0.4);
        }
        
        .btn-glass {
          border: 1px solid rgba(0, 212, 255, 0.4);
          backdrop-filter: blur(10px);
          transition: all 0.2s;
        }
        
        .btn-glass:hover {
          border-color: rgba(0, 212, 255, 0.8);
          background: rgba(0, 212, 255, 0.1);
          transform: translateY(-2px);
        }
        
        .particle {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #00D4FF;
          box-shadow: 0 0 12px rgba(0, 212, 255, 0.8);
        }
      `}</style>
      
      <div className="relative w-full h-screen overflow-hidden" style={{ 
        background: '#060B18',
        fontFamily: "'Inter', sans-serif"
      }}>
        {/* Aurora glow background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0, 212, 255, 0.15) 0%, rgba(123, 79, 255, 0.1) 50%, transparent 70%)',
            filter: 'blur(60px)'
          }}
        />
        
        {/* Particle dots */}
        <div className="particle" style={{ top: '15%', left: '12%', animationDelay: '0s' }} />
        <div className="particle" style={{ top: '25%', right: '18%', animationDelay: '1s' }} />
        <div className="particle" style={{ top: '65%', left: '8%', animationDelay: '2s' }} />
        <div className="particle" style={{ top: '75%', right: '15%', animationDelay: '1.5s' }} />
        <div className="particle" style={{ top: '45%', left: '5%', animationDelay: '0.7s' }} />
        
        {/* Frosted glass nav */}
        <nav className="relative z-50 flex items-center justify-between px-12 h-20"
          style={{
            background: 'rgba(6, 11, 24, 0.7)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0, 212, 255, 0.3)'
          }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #00D4FF 0%, #7B4FFF 100%)',
                boxShadow: '0 4px 16px rgba(0, 212, 255, 0.3)'
              }}>
              <span className="text-white text-xl font-bold">⬡</span>
            </div>
            <span style={{ 
              fontFamily: "'Space Grotesk', sans-serif", 
              fontSize: '18px',
              fontWeight: 600,
              color: '#E8F4FF',
              letterSpacing: '0.05em'
            }}>GAME WORLD HUB</span>
          </div>
          
          <div className="flex items-center gap-8" style={{ color: '#6B8FA8', fontSize: '14px', fontWeight: 500 }}>
            <a href="#" className="hover:text-[#00D4FF] transition-colors">FEATURES</a>
            <a href="#" className="hover:text-[#00D4FF] transition-colors">WINDOWS APP</a>
            <a href="#" className="hover:text-[#00D4FF] transition-colors">PLANS</a>
            <a href="#" className="hover:text-[#00D4FF] transition-colors">SUPPORT</a>
            <a href="#" className="hover:text-[#00D4FF] transition-colors">CONTACT</a>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="px-6 py-2.5 rounded-lg text-[#00D4FF] font-medium text-sm transition-all hover:bg-[rgba(0,212,255,0.1)]">
              LOG IN
            </button>
            <button className="btn-gradient px-6 py-2.5 rounded-lg text-white font-semibold text-sm"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              START FREE
            </button>
            <button className="px-3 py-2 rounded-lg text-[#6B8FA8] text-sm hover:text-[#00D4FF] transition-colors"
              style={{ borderLeft: '1px solid rgba(107, 143, 168, 0.2)', paddingLeft: '16px' }}>
              العربية
            </button>
          </div>
        </nav>
        
        {/* Floating decorative chips */}
        <div className="absolute top-32 left-20 px-5 py-2 rounded-full text-xs font-medium"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            color: '#00D4FF',
            animation: 'float-1 4s ease-in-out infinite'
          }}>
          ● Gaming
        </div>
        
        <div className="absolute top-44 right-28 px-5 py-2 rounded-full text-xs font-medium"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(123, 79, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            color: '#9B6FFF',
            animation: 'float-2 5s ease-in-out infinite'
          }}>
          ● Social
        </div>
        
        <div className="absolute bottom-32 left-24 px-5 py-2 rounded-full text-xs font-medium"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            color: '#00D4FF',
            animation: 'float-3 4.5s ease-in-out infinite'
          }}>
          ● Live
        </div>
        
        {/* Main content - centered glass card */}
        <div className="relative z-10 flex items-center justify-center" style={{ height: 'calc(100vh - 80px)' }}>
          <div className="max-w-4xl px-16 py-16 rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(0, 212, 255, 0.15)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.4)'
            }}>
            
            {/* Status badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(0, 212, 255, 0.1)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  color: '#00D4FF'
                }}>
                <span style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}>●</span>
                SYSTEM_ONLINE
              </div>
            </div>
            
            {/* Mascot */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'rgba(0, 212, 255, 0.1)',
                  border: '2px solid rgba(0, 212, 255, 0.4)',
                  boxShadow: '0 8px 32px rgba(0, 212, 255, 0.3)'
                }}>
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <path d="M18 2L32 10V26L18 34L4 26V10L18 2Z" stroke="#00D4FF" strokeWidth="2" fill="rgba(0, 212, 255, 0.1)"/>
                  <circle cx="14" cy="16" r="2" fill="#00D4FF"/>
                  <circle cx="22" cy="16" r="2" fill="#00D4FF"/>
                  <path d="M13 24Q18 27 23 24" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            
            {/* Headline */}
            <h1 className="text-center mb-6"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '58px',
                fontWeight: 600,
                color: '#E8F4FF',
                lineHeight: 1.2,
                letterSpacing: '-0.02em'
              }}>
              Your squad is waiting right now
            </h1>
            
            {/* Brand display */}
            <div className="text-center mb-4">
              <div className="gradient-text inline-block"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '88px',
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  lineHeight: 1
                }}>
                GAME WORLD HUB
              </div>
            </div>
            
            {/* Tagline */}
            <div className="text-center mb-8"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 300,
                color: '#00D4FF',
                letterSpacing: '5px',
                textTransform: 'uppercase'
              }}>
              Gaming alone is over.
            </div>
            
            {/* Body copy */}
            <p className="text-center max-w-2xl mx-auto mb-10"
              style={{
                fontSize: '17px',
                lineHeight: 1.7,
                color: '#6B8FA8',
                fontWeight: 400
              }}>
              One second and you know who's online, who's playing what. Join the party, share your screen, find your squad. Now with global chat, GIFs, emoji reactions, and Pro bubble colours — one place for everything.
            </p>
            
            {/* CTA buttons */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <button className="btn-gradient px-10 rounded-xl text-white font-semibold"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  height: '52px',
                  fontSize: '15px',
                  letterSpacing: '0.02em'
                }}>
                START FOR FREE
              </button>
              <button className="btn-glass px-10 rounded-xl font-semibold"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  height: '52px',
                  fontSize: '15px',
                  letterSpacing: '0.02em',
                  color: '#00D4FF',
                  background: 'rgba(0, 212, 255, 0.05)'
                }}>
                LOG IN
              </button>
            </div>
            
            {/* Social proof */}
            <div className="flex items-center justify-center gap-2 text-sm">
              <span style={{ 
                color: '#00D4FF', 
                animation: 'pulse-dot 2s ease-in-out infinite',
                fontSize: '8px'
              }}>●</span>
              <span style={{ 
                color: '#00D4FF', 
                fontWeight: 600,
                fontFamily: "'Space Grotesk', sans-serif"
              }}>340</span>
              <span style={{ color: '#6B8FA8' }}>players online now</span>
            </div>
          </div>
        </div>
        
        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center"
          style={{
            color: '#6B8FA8',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '2px',
            textTransform: 'uppercase'
          }}>
          SCROLL TO EXPLORE ↓
        </div>
      </div>
    </>
  );
}