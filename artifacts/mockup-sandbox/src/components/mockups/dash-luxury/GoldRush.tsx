import React from 'react';
import { 
  Gamepad2, Users, MessageSquare, Trophy, Zap, Bell, Search, Settings, 
  LogOut, Star, Flame, Clock, Activity, Radar, BarChart2, Swords, Mic, 
  Layers, Crown, Award, Calendar, ChevronRight, Gift, Hash, UserPlus
} from "lucide-react";

export default function GoldRush() {
  return (
    <div className="gold-rush-theme flex h-[900px] w-[1440px] overflow-hidden text-sm relative">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Inter:wght@300;400;500;600&display=swap');

        .gold-rush-theme {
          --bg-root: #080707;
          --bg-sidebar: #0C0A08;
          --bg-card: #100E0B;
          --border-gold: rgba(212, 175, 55, 0.2);
          --border-card: rgba(212, 175, 55, 0.12);
          --accent-gold: #D4AF37;
          --accent-light: #E8C97D;
          --accent-dark: #C9A84C;
          --text-primary: #F5F0E0;
          --text-muted: #7A6F5A;
          --text-dimmed: #3D3628;
          
          --font-serif: 'Cormorant Garamond', serif;
          --font-sans: 'Inter', sans-serif;
          
          font-family: var(--font-sans);
          background-color: var(--bg-root);
          color: var(--text-primary);
        }

        .gold-rush-theme::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.03;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        .font-serif { font-family: var(--font-serif); }
        .font-sans { font-family: var(--font-sans); }

        .text-gold { color: var(--accent-gold); }
        .text-muted { color: var(--text-muted); }
        .text-dimmed { color: var(--text-dimmed); }
        
        .bg-card { background-color: var(--bg-card); }
        .border-card { border-color: var(--border-card); }
        .border-gold { border-color: var(--border-gold); }
        
        .gold-gradient-text {
          background: linear-gradient(to right, #E8C97D, #D4AF37, #C9A84C);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .gold-gradient-bg {
          background: linear-gradient(to right, #D4AF37, #C9A84C);
        }

        .gold-glow {
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.15);
        }

        .nav-item {
          transition: all 0.2s ease;
        }
        .nav-item:hover {
          background-color: rgba(212, 175, 55, 0.04);
          color: var(--text-primary);
        }
        .nav-item.active {
          background-color: rgba(212, 175, 55, 0.08);
          border-left: 3px solid var(--accent-gold);
          color: var(--accent-gold);
        }

        .btn-gold {
          background-color: transparent;
          border: 1px solid var(--accent-gold);
          color: var(--accent-gold);
          transition: all 0.2s;
        }
        .btn-gold:hover {
          background-color: rgba(212, 175, 55, 0.1);
        }
        
        .btn-gold-solid {
          background-color: var(--accent-gold);
          color: #080707;
          border: 1px solid var(--accent-light);
          transition: all 0.2s;
          font-weight: 500;
        }
        .btn-gold-solid:hover {
          background-color: var(--accent-light);
        }

        .btn-danger-solid {
          background-color: #DC2626;
          color: white;
          border: 1px solid #ef4444;
          font-weight: 500;
        }

        .ticker-wrap {
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
        }
        .ticker-content {
          display: inline-block;
          animation: ticker 25s linear infinite;
        }
        @keyframes ticker {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }

        .conic-wheel {
          background: conic-gradient(
            #D4AF37 0deg 45deg,
            #100E0B 45deg 90deg,
            #C9A84C 90deg 135deg,
            #0C0A08 135deg 180deg,
            #E8C97D 180deg 225deg,
            #100E0B 225deg 270deg,
            #D4AF37 270deg 315deg,
            #0C0A08 315deg 360deg
          );
        }
        
        .glass-panel {
          background: linear-gradient(135deg, rgba(16, 14, 11, 0.9) 0%, rgba(12, 10, 8, 0.9) 100%);
          backdrop-filter: blur(10px);
        }
        
        /* Custom scrollbar for webkit */
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(212, 175, 55, 0.2);
          border-radius: 0px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(212, 175, 55, 0.4);
        }
      `}} />

      {/* 1. Sidebar */}
      <div className="w-[220px] flex-shrink-0 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-gold)' }}>
        
        {/* Top: Logo */}
        <div className="h-[72px] flex items-center px-6 border-b border-card">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="url(#goldGrad)" strokeWidth="1.5" />
              <path d="M12 7L6 10.5V17L12 20.5L18 17V10.5L12 7Z" fill="url(#goldGrad)" fillOpacity="0.1" stroke="url(#goldGrad)" strokeWidth="1" />
              <defs>
                <linearGradient id="goldGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#E8C97D" />
                  <stop offset="0.5" stopColor="#D4AF37" />
                  <stop offset="1" stopColor="#C9A84C" />
                </linearGradient>
              </defs>
            </svg>
            <span className="font-serif font-bold text-lg tracking-wider gold-gradient-text uppercase">Game World</span>
          </div>
        </div>

        {/* Nav Groups */}
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
          
          {/* COMMS */}
          <div>
            <div className="px-4 mb-2 text-[10px] font-medium tracking-widest text-muted uppercase">Comms</div>
            <div className="space-y-0.5">
              <div className="nav-item active flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent">
                <Gamepad2 size={16} />
                <span>Dashboard</span>
              </div>
              <div className="nav-item flex items-center justify-between px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <div className="flex items-center gap-3">
                  <Users size={16} />
                  <span>Friends</span>
                </div>
              </div>
              <div className="nav-item flex items-center justify-between px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <div className="flex items-center gap-3">
                  <MessageSquare size={16} />
                  <span>Chat</span>
                </div>
                <span className="bg-[#D4AF37] text-[#080707] text-[10px] font-bold px-1.5 py-0.5 rounded-sm">3</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Mic size={16} />
                <span>Parties</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Radar size={16} />
                <span>LFG</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Trophy size={16} />
                <span>Ranks</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <BarChart2 size={16} />
                <span>Stats</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Swords size={16} />
                <span>Challenges</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Hash size={16} />
                <span>Rooms</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Award size={16} />
                <span>Tournaments</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Zap size={16} />
                <span>Bounties</span>
              </div>
            </div>
          </div>

          {/* REWARDS */}
          <div>
            <div className="px-4 mb-2 text-[10px] font-medium tracking-widest text-muted uppercase">Rewards</div>
            <div className="space-y-0.5">
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Star size={16} />
                <span>Battle Pass</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Award size={16} />
                <span>Achievements</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Clock size={16} />
                <span>Quests</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Users size={16} />
                <span>Factions</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Activity size={16} />
                <span>Pro Hunt</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Calendar size={16} />
                <span>Events</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Crown size={16} />
                <span>Prestige</span>
              </div>
            </div>
          </div>

          {/* STORE */}
          <div>
            <div className="px-4 mb-2 text-[10px] font-medium tracking-widest text-muted uppercase">Store</div>
            <div className="space-y-0.5">
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-gold">
                <Crown size={16} />
                <span>Pro</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Layers size={16} />
                <span>Library</span>
              </div>
              <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
                <Gamepad2 size={16} />
                <span>Games</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Nav */}
        <div className="px-2 pb-4">
          <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
            <Settings size={16} />
            <span>Settings</span>
          </div>
          <div className="nav-item flex items-center gap-3 px-4 py-2 cursor-pointer border-l-[3px] border-transparent text-muted">
            <LogOut size={16} />
            <span>Logout</span>
          </div>
        </div>

        {/* User Profile */}
        <div className="h-[76px] flex items-center px-4 border-t border-card bg-black/40">
          <div className="relative">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Wolf&backgroundColor=100E0B" alt="Avatar" className="w-10 h-10 rounded-full border border-gold" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#D4AF37] rounded-full flex items-center justify-center border border-[#080707]">
              <Crown size={10} className="text-[#080707]" />
            </div>
          </div>
          <div className="ml-3 flex-1 overflow-hidden">
            <div className="font-semibold text-[13px] truncate">Wolf_99</div>
            <div className="text-[11px] text-gold tracking-wide mt-0.5 flex items-center gap-1">
              GOLD <span className="text-muted">·</span> LVL 42
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-gold text-gold rounded-sm ml-2">PRO</div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* 2. Top Bar */}
        <div className="h-[48px] flex-shrink-0 flex justify-between items-center px-6 border-b border-card glass-panel relative z-10">
          <div className="font-serif font-medium text-[15px] italic text-gold flex items-center gap-2">
            <span className="text-muted not-italic text-sm">Dashboard</span> 
            <span className="text-dimmed not-italic">/</span> 
            Overview
          </div>
          <div className="flex items-center gap-5 text-muted">
            <Search size={18} className="cursor-pointer hover:text-gold transition-colors" />
            <div className="relative cursor-pointer hover:text-gold transition-colors">
              <Bell size={18} />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#D4AF37] rounded-full border border-[#080707]"></div>
            </div>
            <div className="w-6 h-6 rounded-full border border-card overflow-hidden ml-2">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Wolf&backgroundColor=100E0B" alt="Avatar" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        {/* 3. Live Ticker */}
        <div className="h-[28px] flex-shrink-0 bg-card border-b border-card flex items-center text-[11px] uppercase tracking-wider relative">
          <div className="bg-[#D4AF37] text-[#080707] font-bold px-4 h-full flex items-center z-10 relative">
            <div className="w-1.5 h-1.5 bg-[#080707] rounded-full mr-2 animate-pulse"></div>
            LIVE
          </div>
          <div className="flex-1 ticker-wrap text-muted overflow-hidden">
            <div className="ticker-content space-x-12 px-6">
              <span><span className="text-gold">🏆</span> LOUD wins VCT 2026</span>
              <span><span className="text-gold">◆</span></span>
              <span><span className="text-gold">⚡</span> Valorant EP9 — new map</span>
              <span><span className="text-gold">◆</span></span>
              <span><span className="text-gold">🎯</span> GWH Cup 8PM Prize 5K SAR</span>
              <span><span className="text-gold">◆</span></span>
              <span><span className="text-gold">🔥</span> Apex Hunter Season</span>
              
              {/* Duplicate for seamless loop */}
              <span><span className="text-gold">🏆</span> LOUD wins VCT 2026</span>
              <span><span className="text-gold">◆</span></span>
              <span><span className="text-gold">⚡</span> Valorant EP9 — new map</span>
              <span><span className="text-gold">◆</span></span>
              <span><span className="text-gold">🎯</span> GWH Cup 8PM Prize 5K SAR</span>
              <span><span className="text-gold">◆</span></span>
              <span><span className="text-gold">🔥</span> Apex Hunter Season</span>
            </div>
          </div>
        </div>

        {/* 4. Dashboard Body */}
        <div className="flex-1 flex overflow-hidden p-6 gap-6" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(212, 175, 55, 0.05) 0%, transparent 60%)' }}>
          
          {/* LEFT COLUMN */}
          <div className="w-[260px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1 pb-10">
            
            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border-t border-t-[#D4AF37] border border-card p-3 rounded-[2px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted mb-1">
                  <span className="text-[10px] uppercase tracking-wider">Streak</span>
                  <Flame size={12} className="text-[#F97316]" />
                </div>
                <div className="font-serif font-bold text-3xl text-gold">5<span className="text-lg text-muted">d</span></div>
              </div>
              <div className="bg-card border-t border-t-[#D4AF37] border border-card p-3 rounded-[2px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted mb-1">
                  <span className="text-[10px] uppercase tracking-wider">Matches</span>
                  <Gamepad2 size={12} className="text-gold" />
                </div>
                <div className="font-serif font-bold text-3xl text-gold">8</div>
              </div>
              <div className="bg-card border-t border-t-[#D4AF37] border border-card p-3 rounded-[2px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted mb-1">
                  <span className="text-[10px] uppercase tracking-wider">Rank</span>
                  <Trophy size={12} className="text-gold" />
                </div>
                <div className="font-serif font-bold text-3xl text-gold">#3</div>
              </div>
              <div className="bg-card border-t border-t-[#D4AF37] border border-card p-3 rounded-[2px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted mb-1">
                  <span className="text-[10px] uppercase tracking-wider">Playtime</span>
                  <Clock size={12} className="text-gold" />
                </div>
                <div className="font-serif font-bold text-3xl text-gold">24<span className="text-lg text-muted">h</span></div>
              </div>
            </div>

            {/* Battle Pass box */}
            <div className="bg-card border border-card rounded-[2px] p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37] opacity-[0.03] rounded-full -translate-y-1/2 translate-x-1/3 blur-xl"></div>
              <div className="font-serif italic text-gold text-[13px] mb-3">S12 Battle Pass</div>
              <div className="flex justify-between items-end mb-2">
                <div className="text-[10px] text-muted uppercase tracking-wider">Level 32</div>
                <div className="text-[10px] text-gold">32%</div>
              </div>
              <div className="h-1 bg-[#0C0A08] w-full rounded-sm overflow-hidden mb-4">
                <div className="h-full gold-gradient-bg w-[32%] relative">
                  <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/30 blur-[2px]"></div>
                </div>
              </div>
              <div className="flex justify-between mt-2">
                <div className="w-8 h-8 rounded-sm bg-[#080707] border border-gold flex items-center justify-center opacity-50">
                  <Crown size={14} className="text-gold" />
                </div>
                <div className="w-8 h-8 rounded-sm bg-[#080707] border border-gold flex items-center justify-center opacity-50">
                  <Award size={14} className="text-gold" />
                </div>
                <div className="w-8 h-8 rounded-sm bg-[#0C0A08] border border-gold flex items-center justify-center gold-glow relative">
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#D4AF37] rounded-full animate-pulse"></div>
                  <Gift size={14} className="text-gold" />
                </div>
                <div className="w-8 h-8 rounded-sm bg-[#080707] border border-card flex items-center justify-center opacity-30">
                  <Star size={14} className="text-muted" />
                </div>
              </div>
            </div>

            {/* Daily Quests box */}
            <div className="bg-card border border-card rounded-[2px] p-4">
              <div className="font-serif italic text-gold text-[13px] mb-4 flex items-center gap-1.5">
                <span className="text-[#F97316]">5 <Flame size={12} className="inline relative -top-[1px]"/></span> 
                Missions Today
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span>Headhunter</span>
                    <span className="text-gold">250 XP</span>
                  </div>
                  <div className="h-1 bg-[#080707] rounded-sm overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#F97316] to-[#D4AF37] w-[70%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span>Plant the Spike</span>
                    <span className="text-gold">100 XP</span>
                  </div>
                  <div className="h-1 bg-[#080707] rounded-sm overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#F97316] to-[#D4AF37] w-[40%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span>Win 3 Matches</span>
                    <span className="text-gold">500 XP</span>
                  </div>
                  <div className="h-1 bg-[#080707] rounded-sm overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#F97316] to-[#D4AF37] w-[15%]"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Current Party box */}
            <div className="bg-card border border-card rounded-[2px] p-4 relative">
              <div className="absolute right-0 top-0 w-1 h-full bg-[#D4AF37]"></div>
              <div className="font-serif italic text-gold text-[13px] mb-2">Current Party</div>
              <div className="text-[11px] text-muted mb-4">
                <span className="text-primary">Valorant</span> • Ranked • Diamond
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex -space-x-2">
                  <div className="w-6 h-6 rounded-full border border-card overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=P1&backgroundColor=100E0B" alt="P1" />
                  </div>
                  <div className="w-6 h-6 rounded-full border border-card overflow-hidden">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=P2&backgroundColor=100E0B" alt="P2" />
                  </div>
                  <div className="w-6 h-6 rounded-full border border-card bg-[#080707] flex items-center justify-center text-[10px] text-muted">
                    +1
                  </div>
                </div>
                <div className="text-[10px] text-gold italic animate-pulse">searching...</div>
              </div>
              <button className="w-full py-2 text-[11px] uppercase tracking-wider btn-gold-solid rounded-[2px]">
                Join Party
              </button>
            </div>

            {/* 1v1 Challenge box */}
            <div className="bg-card border border-[#DC2626]/30 rounded-[2px] p-4 relative overflow-hidden mt-auto">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#DC2626] opacity-[0.03] rounded-full -translate-y-1/2 translate-x-1/3 blur-xl"></div>
              <div className="font-serif italic text-[#DC2626] text-[13px] mb-3 flex items-center justify-between">
                <span>1v1 Challenge</span>
                <Swords size={14} />
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-center">
                  <div className="text-[11px] font-semibold">Wolf_99</div>
                </div>
                <div className="text-[10px] text-muted italic">VS</div>
                <div className="text-center">
                  <div className="text-[11px] font-semibold text-gold">أنت</div>
                </div>
              </div>
              <div className="text-[10px] text-center text-muted uppercase tracking-wider mb-4 border-b border-card pb-2">
                Diamond Tier Match
              </div>
              <button className="w-full py-2 text-[11px] uppercase tracking-wider btn-danger-solid rounded-[2px]">
                Send Challenge
              </button>
            </div>

          </div>

          {/* CENTER COLUMN */}
          <div className="flex-[2] min-w-[500px] max-w-[680px] flex flex-col gap-6 overflow-y-auto pr-1 pb-10">
            
            {/* Tabs row */}
            <div className="flex gap-8 border-b border-card pb-px">
              <div className="pb-3 border-b-2 border-gold text-gold text-[12px] uppercase tracking-wider font-medium cursor-pointer">
                LFG
              </div>
              <div className="pb-3 border-b-2 border-transparent text-muted hover:text-primary text-[12px] uppercase tracking-wider font-medium cursor-pointer transition-colors">
                أخبار
              </div>
              <div className="pb-3 border-b-2 border-transparent text-muted hover:text-primary text-[12px] uppercase tracking-wider font-medium cursor-pointer transition-colors">
                حفلات
              </div>
            </div>

            {/* LFG posts */}
            <div className="space-y-3">
              {/* LFG Card 1 */}
              <div className="bg-card border border-card rounded-[2px] p-4 flex items-center justify-between group hover:border-gold/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Khalid&backgroundColor=100E0B" className="w-10 h-10 rounded-full border border-card" alt="Khalid"/>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] rounded-full border-2 border-card"></div>
                  </div>
                  <div>
                    <div className="font-medium text-[13px] text-gold">Khalid_X</div>
                    <div className="text-[11px] text-muted mt-0.5">Valorant <span className="mx-1 text-dimmed">·</span> Diamond 2</div>
                  </div>
                </div>
                <button className="btn-gold px-4 py-1.5 text-[11px] uppercase tracking-wider rounded-[2px]">
                  انضم
                </button>
              </div>

              {/* LFG Card 2 */}
              <div className="bg-card border border-card rounded-[2px] p-4 flex items-center justify-between group hover:border-gold/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=ShadowG&backgroundColor=100E0B" className="w-10 h-10 rounded-full border border-card" alt="ShadowG"/>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#F97316] rounded-full border-2 border-card"></div>
                  </div>
                  <div>
                    <div className="font-medium text-[13px] text-gold">ShadowG</div>
                    <div className="text-[11px] text-muted mt-0.5">Apex Legends <span className="mx-1 text-dimmed">·</span> Platinum</div>
                  </div>
                </div>
                <button className="btn-gold px-4 py-1.5 text-[11px] uppercase tracking-wider rounded-[2px]">
                  [1لاعب]
                </button>
              </div>

              {/* LFG Card 3 */}
              <div className="bg-card border border-card rounded-[2px] p-4 flex items-center justify-between group hover:border-gold/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Night&backgroundColor=100E0B" className="w-10 h-10 rounded-full border border-card" alt="NightRvn"/>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#10B981] rounded-full border-2 border-card"></div>
                  </div>
                  <div>
                    <div className="font-medium text-[13px] text-gold">NightRvn</div>
                    <div className="text-[11px] text-muted mt-0.5">CS2 <span className="mx-1 text-dimmed">·</span> MG2</div>
                  </div>
                </div>
                <button className="btn-gold px-4 py-1.5 text-[11px] uppercase tracking-wider rounded-[2px]">
                  انضم 2
                </button>
              </div>
            </div>

            {/* Online Friends */}
            <div className="mt-4">
              <div className="flex items-end justify-between mb-4">
                <div className="font-serif italic text-gold text-[15px]">الأصدقاء المتصلون</div>
                <div className="text-[11px] text-muted uppercase tracking-wider">5/24 متصل</div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: "NoName_7", game: "Valorant", tag: "In Match", online: true },
                  { name: "Ziad", game: "Apex Legends", tag: "Lobby", online: true },
                  { name: "Reem", game: "CS2", tag: "In Match", online: true },
                  { name: "Faisal", game: "League", tag: "Online", online: true },
                  { name: "Sara", game: "Overwatch", tag: "Lobby", online: true },
                  { name: "Khalid", game: "Offline", tag: "Last seen 2h ago", online: false },
                ].map((friend, i) => (
                  <div key={i} className="bg-card border border-card rounded-[2px] p-3 flex flex-col items-center text-center relative group hover:border-gold/20 transition-colors">
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <MessageSquare size={12} className="text-muted hover:text-gold cursor-pointer" />
                    </div>
                    <div className="relative mb-2">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.name}&backgroundColor=100E0B`} className="w-12 h-12 rounded-full border border-card" alt={friend.name}/>
                      {friend.online && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#D4AF37] rounded-full border-2 border-card"></div>
                      )}
                    </div>
                    <div className={`text-[12px] font-medium ${friend.online ? 'text-primary' : 'text-muted'}`}>{friend.name}</div>
                    <div className="text-[10px] text-muted mt-0.5 mb-3">{friend.game}</div>
                    
                    <div className="w-full flex gap-1 mt-auto">
                      <button className="flex-1 py-1.5 text-[10px] uppercase tracking-wider border border-card text-muted hover:text-gold hover:border-gold transition-colors rounded-[2px]">
                        دعوة
                      </button>
                      <button className="px-2 py-1.5 text-[10px] uppercase tracking-wider border border-card text-muted hover:text-gold hover:border-gold transition-colors rounded-[2px]">
                        DM
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Highlights */}
            <div className="mt-4">
              <div className="font-serif italic text-gold text-[15px] mb-4">Highlights</div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { user: "Wolf_99", title: "1v4 Clutch Vandal", views: "1.2k", time: "2h ago" },
                  { user: "Ziad", title: "Apex Kraber Noscope", views: "856", time: "5h ago" },
                  { user: "Reem", title: "Ace on Dust2", views: "2.4k", time: "1d ago" },
                  { user: "Faisal", title: "Baron Steal", views: "5.1k", time: "2d ago" },
                ].map((clip, i) => (
                  <div key={i} className="flex flex-col gap-2 bg-card border border-card p-2 rounded-[2px] hover:bg-[#15120E] transition-colors cursor-pointer group">
                    <div className="w-full h-24 bg-[#080707] rounded-[2px] border border-card flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors z-10"></div>
                      <Gamepad2 size={24} className="text-muted z-0 opacity-50" />
                      <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-gold/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-[#D4AF37] border-b-[5px] border-b-transparent ml-0.5"></div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 overflow-hidden pr-2">
                        <div className="text-[12px] font-medium group-hover:text-gold transition-colors truncate">{clip.title}</div>
                        <div className="text-[10px] text-muted mt-0.5">{clip.user}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[11px] text-gold">{clip.views}</div>
                        <div className="text-[10px] text-dimmed mt-0.5">{clip.time}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="w-[300px] flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-1 pb-10">
            
            {/* Weekly Activity chart */}
            <div className="bg-card border border-card rounded-[2px] p-5">
              <div className="font-serif italic text-gold text-[15px] mb-1">نشاط الأسبوع</div>
              <div className="text-[11px] text-muted mb-6 uppercase tracking-wider flex items-center gap-2">
                <span className="text-primary font-medium">5d Streak</span> 
                <span className="text-dimmed">|</span>
                <span>7 Matches</span>
                <span className="text-dimmed">|</span>
                <span>42h</span>
              </div>
              
              <div className="flex items-end justify-between h-32 gap-2 border-b border-card pb-2">
                {[40, 70, 45, 90, 60, 30, 80].map((h, i) => (
                  <div key={i} className="w-full relative group">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[10px] text-gold transition-opacity">{h}</div>
                    <div 
                      className={`w-full rounded-t-sm transition-all duration-300 ${i === 3 ? 'gold-gradient-bg' : 'bg-[#2A251D] group-hover:bg-[#3D3628]'}`}
                      style={{ height: `${h}%` }}
                    ></div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[9px] text-muted uppercase">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span className="text-gold">Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>
            </div>

            {/* Spin Wheel / Daily Prize */}
            <div className="bg-card border border-card rounded-[2px] p-5 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37] opacity-[0.02] rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl"></div>
              
              <div className="font-serif italic text-gold text-[15px] mb-1">دوامة اليوم</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-6">Daily Spin</div>
              
              <div className="relative w-40 h-40 mb-6">
                {/* Wheel Outer Ring */}
                <div className="absolute inset-0 rounded-full border-[4px] border-[#0C0A08] shadow-[0_0_15px_rgba(212,175,55,0.1)]"></div>
                {/* Wheel Segments (Conic Gradient) */}
                <div className="absolute inset-2 rounded-full conic-wheel border-2 border-[#100E0B] overflow-hidden">
                  {/* Lines separating segments */}
                  <div className="absolute inset-0" style={{ backgroundImage: 'conic-gradient(from 0deg, transparent 0deg 44deg, #080707 44deg 45deg, transparent 45deg 89deg, #080707 89deg 90deg, transparent 90deg 134deg, #080707 134deg 135deg, transparent 135deg 179deg, #080707 179deg 180deg, transparent 180deg 224deg, #080707 224deg 225deg, transparent 225deg 269deg, #080707 269deg 270deg, transparent 270deg 314deg, #080707 314deg 315deg, transparent 315deg 359deg, #080707 359deg 360deg)'}}></div>
                </div>
                {/* Wheel Inner Hub */}
                <div className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-[#100E0B] border-[3px] border-[#D4AF37] z-10 flex items-center justify-center shadow-lg">
                  <div className="w-6 h-6 rounded-full bg-[#080707] border border-[#2A251D]"></div>
                </div>
                {/* Pointer */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[14px] border-t-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"></div>
              </div>

              <div className="text-[12px] mb-4">
                Win up to <span className="text-gold font-bold">500 XP</span> or <span className="text-gold font-bold">Pro</span>
              </div>
              
              <button className="w-full py-2.5 text-[12px] uppercase tracking-widest btn-gold-solid rounded-[2px] shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                GO
              </button>
            </div>

            {/* Mini Ad / Upsell */}
            <div className="mt-auto border border-gold/30 rounded-[2px] p-4 bg-gradient-to-br from-[#100E0B] to-[#080707] relative overflow-hidden group cursor-pointer">
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Crown size={64} className="text-gold" />
              </div>
              <div className="font-serif italic text-gold text-[15px] mb-1">Upgrade to Pro</div>
              <div className="text-[10px] text-muted mb-3 pr-8 relative z-10">
                Get priority in LFG, exclusive tournaments, and 2x daily spins.
              </div>
              <div className="text-[10px] text-gold uppercase tracking-wider font-medium flex items-center gap-1 group-hover:gap-2 transition-all relative z-10">
                View Plans <ChevronRight size={12} />
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
