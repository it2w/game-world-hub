import React from 'react';
import { Mic, MicOff, Monitor, PhoneOff, Phone, Video, VideoOff, Headphones, Loader2, ChevronDown, X, Check, PhoneOutgoing, ShieldAlert, MonitorUp } from 'lucide-react';

export default function Halo() {
  return (
    <div className="min-h-screen bg-[#050509] flex flex-col gap-12 p-8 font-mono text-white selection:bg-[#00ff41]/30">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-ring {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
        }
        @keyframes bar-bounce {
          0%, 100% { height: 4px; }
          50% { height: 12px; }
        }
        @keyframes sweep-right {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes shrink-bar {
          0% { width: 100%; }
          100% { width: 0%; }
        }
        .animate-ring-1 { animation: pulse-ring 2s infinite cubic-bezier(0.4, 0, 0.6, 1); }
        .animate-ring-2 { animation: pulse-ring 2s infinite cubic-bezier(0.4, 0, 0.6, 1) 0.4s; }
        .animate-ring-3 { animation: pulse-ring 2s infinite cubic-bezier(0.4, 0, 0.6, 1) 0.8s; }
        
        .animate-bar-1 { animation: bar-bounce 1s infinite ease-in-out 0.0s; }
        .animate-bar-2 { animation: bar-bounce 1s infinite ease-in-out 0.2s; }
        .animate-bar-3 { animation: bar-bounce 1s infinite ease-in-out 0.4s; }
        .animate-bar-4 { animation: bar-bounce 1s infinite ease-in-out 0.6s; }
        
        .animate-sweep { animation: sweep-right 2s infinite linear; }
        .animate-shrink { animation: shrink-bar 45s linear forwards; }
      `}} />

      {/* SECTION 1: VOICE PANEL */}
      <div>
        <div className="text-white/30 text-[10px] tracking-[0.2em] mb-3 uppercase">Voice Panel</div>
        
        <div 
          className="w-[288px] relative flex flex-col"
          style={{
            background: 'linear-gradient(to bottom, #0d0d1a, #080810)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04), 0 24px 48px rgba(0,0,0,0.8)'
          }}
        >
          {/* Top gradient bar */}
          <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, #00ff41, #00bfff, transparent)' }} />
          
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Valorant Ranked</span>
            <div className="flex items-center gap-2 text-white/50">
              <span className="text-[10px] bg-white/5 px-1.5 py-0.5">4</span>
              <ChevronDown size={14} className="hover:text-white cursor-pointer transition-colors" />
            </div>
          </div>

          {/* Self Section (HALO) */}
          <div className="py-8 flex flex-col items-center justify-center relative border-b border-white/5 overflow-hidden">
            {/* The Halo Rings */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+16px)] w-[88px] h-[88px] border border-[#00ff41]/50 animate-ring-1 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+16px)] w-[104px] h-[104px] border border-[#00ff41]/30 animate-ring-2 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+16px)] w-[120px] h-[120px] border border-[#00ff41]/15 animate-ring-3 pointer-events-none" />
            
            {/* Avatar */}
            <div className="w-[72px] h-[72px] flex items-center justify-center relative z-10 mb-4 shadow-[0_0_20px_rgba(0,255,65,0.2)]" style={{ background: 'linear-gradient(135deg, #1a2a1a, #111120)' }}>
              <span className="text-[28px] font-bold text-[#00ff41]">Y</span>
            </div>

            {/* Name & Waveform */}
            <div className="flex items-center gap-3 mb-2 z-10">
              <span className="text-[13px] font-bold tracking-wide">YOU</span>
              <div className="flex items-end gap-1 h-3">
                <div className="w-1 bg-[#00ff41] animate-bar-1" />
                <div className="w-1 bg-[#00ff41] animate-bar-2" />
                <div className="w-1 bg-[#00ff41] animate-bar-3" />
                <div className="w-1 bg-[#00ff41] animate-bar-4" />
              </div>
            </div>

            {/* Screen Share Status */}
            <div className="flex items-center gap-1.5 z-10 bg-[#00ff41]/10 px-2 py-1 border border-[#00ff41]/20">
              <div className="w-1.5 h-1.5 bg-[#00ff41] shadow-[0_0_8px_#00ff41] animate-pulse" />
              <span className="text-[9px] text-[#00ff41] tracking-wider uppercase font-bold">Screen Share Active</span>
            </div>
          </div>

          {/* Peer List */}
          <div className="flex flex-col">
            {/* Khalid */}
            <div className="flex items-center px-3 py-2 gap-2.5 border-b border-[#1a1a2a] hover:bg-white/5 transition-colors cursor-pointer group">
              <div className="w-7 h-7 bg-[#15151f] flex items-center justify-center text-[10px] text-white/70 group-hover:text-white transition-colors">K</div>
              <span className="text-[11px] flex-1 text-white/90">Khalid</span>
              <div className="flex gap-1.5 text-white/40">
                <Video size={12} className="text-[#00ff41]" />
              </div>
            </div>

            {/* Sara */}
            <div className="flex items-center px-3 py-2 gap-2.5 border-b border-[#1a1a2a] hover:bg-white/5 transition-colors cursor-pointer group">
              <div className="w-7 h-7 bg-[#15151f] flex items-center justify-center text-[10px] text-white/70 group-hover:text-white transition-colors">S</div>
              <span className="text-[11px] flex-1 text-white/90">Sara</span>
              <div className="flex gap-1.5 text-white/40">
                <MicOff size={12} className="text-[#ef4444]" />
              </div>
            </div>

            {/* Omar */}
            <div className="flex items-center px-3 py-2 gap-2.5 border-b border-[#1a1a2a] hover:bg-white/5 transition-colors cursor-pointer group">
              <div className="w-7 h-7 bg-[#15151f] flex items-center justify-center text-[10px] text-white/70 group-hover:text-white transition-colors">O</div>
              <span className="text-[11px] flex-1 text-white/50">Omar</span>
              <div className="flex gap-1.5 text-white/40">
                <Loader2 size={12} className="animate-spin text-white/30" />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="py-4 px-4 bg-[#080810]/50 border-t border-white/5 flex flex-col gap-3">
            <div className="flex justify-center gap-2">
              <button className="w-10 h-10 flex items-center justify-center bg-[#12121e] border border-[#222232] text-[#666680] hover:text-white hover:border-white/30 transition-colors">
                <Mic size={16} />
              </button>
              <button className="w-10 h-10 flex items-center justify-center bg-[#12121e] border border-[#222232] text-[#666680] hover:text-white hover:border-white/30 transition-colors">
                <Headphones size={16} />
              </button>
              <button className="w-10 h-10 flex items-center justify-center bg-[#00ff41]/15 border border-[#00ff41] text-[#00ff41] shadow-[0_0_15px_rgba(0,255,65,0.2)]">
                <MonitorUp size={16} />
              </button>
              <button className="w-10 h-10 flex items-center justify-center bg-[#12121e] border border-[#222232] text-[#666680] hover:text-white hover:border-white/30 transition-colors">
                <Video size={16} />
              </button>
              <button className="w-10 h-10 flex items-center justify-center bg-[#ef4444]/15 border border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                <PhoneOff size={16} />
              </button>
            </div>
            <div className="flex justify-center items-center gap-2 text-[9px] text-white/30 uppercase tracking-widest">
              <span>1080p · 60fps</span>
              <div className="flex gap-0.5">
                <div className="w-1 h-1 bg-[#00ff41]" />
                <div className="w-1 h-1 bg-[#00ff41]" />
                <div className="w-1 h-1 bg-[#00ff41]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: INCOMING CALL */}
      <div>
        <div className="text-white/30 text-[10px] tracking-[0.2em] mb-3 uppercase">Incoming Call</div>
        
        <div className="w-[320px] bg-[#0d0d1c] border border-[#00ff41]/20 relative flex overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          {/* Left edge green bar */}
          <div className="w-1 h-full bg-[#00ff41] absolute left-0 top-0 shadow-[0_0_10px_#00ff41]" />
          
          <div className="flex-1 flex flex-col">
            <div className="p-4 pl-5">
              <div className="text-[9px] text-[#00ff41]/70 tracking-[0.2em] mb-3 font-bold">DIRECT CALL</div>
              
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 border border-[#00ff41]/50 bg-[#1a2a1a] flex items-center justify-center relative">
                  <span className="text-lg font-bold text-[#00ff41]">M</span>
                  <div className="absolute top-0 left-0 w-full h-full border border-[#00ff41] animate-pulse pointer-events-none" />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-white mb-0.5">Majed Al-Harbi</div>
                  <div className="text-[11px] text-white/50 flex items-center">
                    is calling you
                    <span className="inline-flex w-3 overflow-hidden ml-0.5">
                      <span className="animate-[pulse_1.5s_infinite]">.</span>
                      <span className="animate-[pulse_1.5s_infinite_0.5s]">.</span>
                      <span className="animate-[pulse_1.5s_infinite_1s]">.</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timer Bar */}
            <div className="h-[2px] bg-white/5 w-full">
              <div className="h-full bg-[#00ff41] animate-shrink shadow-[0_0_8px_#00ff41]" />
            </div>

            <div className="flex">
              <button className="flex-1 h-10 flex items-center justify-center gap-2 bg-[#0d0d1c] border-t border-r border-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors text-[11px] font-bold tracking-widest uppercase">
                <X size={14} /> Decline
              </button>
              <button className="flex-1 h-10 flex items-center justify-center gap-2 bg-[#00ff41] text-black hover:bg-[#00ff41]/90 transition-colors text-[11px] font-bold tracking-widest uppercase">
                <Check size={14} /> Accept
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: OUTGOING CALL */}
      <div>
        <div className="text-white/30 text-[10px] tracking-[0.2em] mb-3 uppercase">Outgoing Call</div>
        
        <div className="w-[440px] bg-[#0d0d1c] border border-[#1e1e2e] relative overflow-hidden shadow-2xl">
          {/* Top scanning bar */}
          <div className="h-[1px] w-full bg-transparent absolute top-0 left-0 overflow-hidden">
            <div className="h-full w-1/3 bg-[#00ff41] shadow-[0_0_10px_#00ff41] animate-sweep" />
          </div>

          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#15151f] border border-[#222232] flex items-center justify-center relative">
                <span className="text-[12px] font-bold text-white/70">K</span>
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#f59e0b] shadow-[0_0_5px_#f59e0b] animate-pulse" />
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] text-white/90">Calling Khalid...</span>
                <span className="text-[10px] text-white/40">@khalid_99</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[9px] text-white/30 uppercase tracking-widest">Tap to cancel</span>
              <button className="w-8 h-8 bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] flex items-center justify-center hover:bg-[#ef4444]/20 hover:border-[#ef4444] transition-all">
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
