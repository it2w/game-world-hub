import React from 'react';
import {
  Mic, MicOff, Monitor, MonitorOff, PhoneOff, Phone, PhoneOutgoing,
  Volume2, Loader2, Maximize2, Video, VideoOff, Crown, EarOff, Ear,
  ChevronDown, Radio, X
} from 'lucide-react';

const Apex = () => {
  return (
    <div style={{background:"#050509", minHeight:"100vh", display:"flex", flexDirection:"column", gap:"48px", padding:"32px", fontFamily:"monospace"}} className="font-mono text-white">
      
      {/* CSS for animations */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes eq-bar {
          0% { height: 3px; }
          50% { height: 10px; }
          100% { height: 3px; }
        }
        .eq-bar-1 { animation: eq-bar 0.8s ease-in-out infinite; }
        .eq-bar-2 { animation: eq-bar 0.6s ease-in-out infinite 0.2s; }
        .eq-bar-3 { animation: eq-bar 0.9s ease-in-out infinite 0.4s; }
        .glow-shadow { box-shadow: 0 0 10px rgba(0,255,65,0.4); }
        .scanlines {
          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0),
            rgba(255,255,255,0) 50%,
            rgba(0,0,0,0.2) 50%,
            rgba(0,0,0,0.2)
          );
          background-size: 100% 4px;
        }
      `}</style>

      {/* SECTION 1: VOICE PANEL */}
      <div>
        <div style={{color:"#ffffff30", fontSize:"10px", letterSpacing:"0.2em", marginBottom:"12px", textTransform:"uppercase"}}>VOICE PANEL</div>
        
        {/* Voice Panel Container */}
        <div className="w-[300px] flex flex-col bg-[#0a0a12] border border-[#00ff4122] rounded-none shadow-2xl relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-[#00ff4122] bg-[#0a0a12] relative z-10">
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center w-3 h-3">
                <div className="absolute inset-0 rounded-full bg-[#00ff41] opacity-50" style={{ animation: 'pulse-ring 2s infinite' }}></div>
                <div className="w-1.5 h-1.5 rounded-full bg-[#00ff41] relative z-10"></div>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase text-white leading-tight">VALORANT RANKED</span>
                <span className="text-[9px] text-[#00ff41]/60 font-bold uppercase">VOICE CONNECTED</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[#00ff41]">
              <div className="text-[10px] bg-[#00ff411a] px-1.5 py-0.5 border border-[#00ff4133]">4</div>
              <ChevronDown className="w-4 h-4 cursor-pointer hover:text-white" />
            </div>
          </div>
          <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, #00ff41, transparent)' }}></div>

          {/* Error Banner */}
          <div className="bg-[#ef4444]/20 border-l-2 border-[#ef4444] px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] text-[#ef4444]">Voice disconnected — try rejoining</span>
            <button className="text-[9px] bg-[#ef4444] text-black px-2 py-0.5 font-bold uppercase hover:bg-white transition-colors cursor-pointer">Rejoin</button>
          </div>

          {/* Participants */}
          <div className="flex flex-col py-1">
            {/* YOU */}
            <div className="flex items-center px-3 py-2 border-l-[2px] border-[#00ff41] bg-[#00ff410f] relative group">
              <div className="w-8 h-8 flex items-center justify-center bg-[#1a1a24] text-[12px] font-bold text-[#00ff41] border border-[#00ff41] glow-shadow shrink-0">YOU</div>
              <div className="ml-3 flex-1 flex flex-col min-w-0">
                <span className="text-[12px] text-[#00ff41] font-bold truncate">YOU</span>
              </div>
              <div className="flex items-center gap-2 text-[#00ff41] shrink-0">
                <div className="flex items-end gap-[1px] h-3">
                  <div className="w-1 bg-[#00ff41] eq-bar-1"></div>
                  <div className="w-1 bg-[#00ff41] eq-bar-2"></div>
                  <div className="w-1 bg-[#00ff41] eq-bar-3"></div>
                </div>
                <Monitor className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Khalid */}
            <div className="flex items-center px-3 py-2 border-l-[2px] border-transparent hover:bg-[#1a1a24] transition-colors relative group">
              <div className="w-8 h-8 flex items-center justify-center bg-[#1a1a24] text-[12px] font-bold text-gray-400 border border-[#2a2a3a] shrink-0">KH</div>
              <div className="ml-3 flex-1 flex flex-col min-w-0">
                <span className="text-[12px] text-gray-300 truncate">Khalid</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 shrink-0">
                <Video className="w-3.5 h-3.5" />
                <Mic className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Sara */}
            <div className="flex items-center px-3 py-2 border-l-[2px] border-transparent hover:bg-[#1a1a24] transition-colors relative group opacity-60">
              <div className="w-8 h-8 flex items-center justify-center bg-[#1a1a24] text-[12px] font-bold text-gray-400 border border-[#2a2a3a] shrink-0">SA</div>
              <div className="ml-3 flex-1 flex flex-col min-w-0">
                <span className="text-[12px] text-gray-300 truncate">Sara</span>
              </div>
              <div className="flex items-center gap-2 text-[#ef4444] shrink-0">
                <MicOff className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Omar */}
            <div className="flex items-center px-3 py-2 border-l-[2px] border-transparent hover:bg-[#1a1a24] transition-colors relative group">
              <div className="w-8 h-8 flex items-center justify-center bg-[#1a1a24] text-[12px] font-bold text-gray-400 border border-[#2a2a3a] shrink-0">OM</div>
              <div className="ml-3 flex-1 flex flex-col min-w-0">
                <span className="text-[12px] text-gray-300 truncate">Omar</span>
                <span className="text-[9px] text-[#f59e0b]">CONNECTING...</span>
              </div>
              <div className="flex items-center gap-2 text-[#f59e0b] shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            </div>
          </div>

          {/* Screen Share Thumbnails */}
          <div className="p-3 pt-1 grid grid-cols-2 gap-2">
            <div className="aspect-video bg-black border border-[#2a2a3a] relative group overflow-hidden flex flex-col cursor-pointer">
              <div className="flex-1 flex items-center justify-center text-[10px] text-gray-600">STREAM</div>
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4 text-white" />
              </div>
              <div className="bg-[#00ff41] text-black text-[8px] font-bold px-1 py-0.5 text-center">YOU (SCREEN)</div>
            </div>
            <div className="aspect-video bg-[#13131f] border border-[#2a2a3a] border-dashed flex items-center justify-center">
              <MonitorOff className="w-4 h-4 text-gray-600" />
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bg-[#080810] border-t border-[#1e1e2e] p-2 flex flex-col gap-2">
            <div className="flex gap-1">
              <button className="h-10 flex-1 flex items-center justify-center bg-[#13131f] border border-[#2a2a3a] text-[#555566] hover:bg-[#1a1a24] transition-colors cursor-pointer">
                <MicOff className="w-4 h-4" />
              </button>
              <button className="h-10 flex-1 flex items-center justify-center bg-[#13131f] border border-[#2a2a3a] text-[#555566] hover:bg-[#1a1a24] transition-colors cursor-pointer">
                <EarOff className="w-4 h-4" />
              </button>
              <button className="h-10 flex-1 flex items-center justify-center bg-[#13131f] border border-[#2a2a3a] text-[#555566] hover:bg-[#1a1a24] transition-colors cursor-pointer">
                <VideoOff className="w-4 h-4" />
              </button>
              <button className="h-10 flex-1 flex items-center justify-center bg-[#00ff411f] border border-[#00ff4166] text-[#00ff41] hover:bg-[#00ff4133] transition-colors cursor-pointer">
                <Monitor className="w-4 h-4" />
              </button>
              <button className="h-10 flex-[1.5] flex items-center justify-center gap-1.5 bg-[#ef4444] border border-[#ef4444] text-black font-bold text-[10px] hover:bg-[#ef4444]/90 transition-colors cursor-pointer">
                <PhoneOff className="w-4 h-4" /> LEAVE
              </button>
            </div>
            <div className="text-[10px] text-[#00ff41]/50 text-center tracking-widest uppercase">
              SCREEN: 1080p · 60fps
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: INCOMING CALL */}
      <div>
        <div style={{color:"#ffffff30", fontSize:"10px", letterSpacing:"0.2em", marginBottom:"12px", textTransform:"uppercase"}}>INCOMING CALL</div>
        
        <div className="w-[380px] bg-[#08080f] border border-[#00ff4133] relative overflow-hidden flex flex-col items-center justify-center py-8 shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-[#00ff41] to-transparent opacity-80"></div>
          <div className="absolute inset-0 scanlines opacity-10 pointer-events-none"></div>

          <div className="relative flex items-center justify-center mb-6 mt-4">
            <div className="absolute w-[140px] h-[140px] rounded-full border border-[#00ff41]/20" style={{ animation: 'pulse-ring 2s infinite' }}></div>
            <div className="absolute w-[110px] h-[110px] rounded-full border border-[#00ff41]/30" style={{ animation: 'pulse-ring 2s infinite 0.5s' }}></div>
            <div className="absolute w-[80px] h-[80px] rounded-full bg-[#00ff41]/10"></div>
            <div className="w-[80px] h-[80px] bg-[#13131f] border border-[#00ff41] text-[32px] font-bold text-[#00ff41] flex items-center justify-center relative z-10 shadow-[0_0_15px_rgba(0,255,65,0.3)]">M</div>
          </div>

          <div className="flex flex-col items-center z-10 mb-8">
            <span className="text-[18px] font-bold text-white mb-2 tracking-wide">MAJED AL-HARBI</span>
            <span className="text-[10px] text-[#00ff41] font-bold animate-pulse tracking-widest flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#00ff41]"></div> INCOMING CALL</span>
          </div>

          <div className="flex w-full px-8 gap-4 z-10">
            <button className="flex-1 h-10 border border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444] font-bold text-[11px] hover:bg-[#ef4444]/20 transition-colors tracking-widest cursor-pointer">DECLINE</button>
            <button className="flex-1 h-10 border border-[#00ff41] bg-[#00ff41] text-black font-bold text-[11px] hover:bg-[#00ff41]/90 transition-colors tracking-widest shadow-[0_0_10px_rgba(0,255,65,0.4)] cursor-pointer">ACCEPT</button>
          </div>
        </div>
      </div>

      {/* SECTION 3: OUTGOING CALL */}
      <div>
        <div style={{color:"#ffffff30", fontSize:"10px", letterSpacing:"0.2em", marginBottom:"12px", textTransform:"uppercase"}}>OUTGOING CALL</div>
        
        <div className="w-[500px] h-14 bg-[#0a0a12] border border-[#1e1e2e] shadow-2xl flex items-center justify-between px-4 relative overflow-hidden">
          <div className="absolute inset-0 scanlines opacity-[0.03] pointer-events-none"></div>
          
          <div className="flex items-center gap-4 z-10">
            <div className="w-8 h-8 rounded-full bg-[#00ff41]/10 flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border border-[#00ff41] animate-ping opacity-30" style={{ animationDuration: '2s' }}></div>
              <PhoneOutgoing className="w-4 h-4 text-[#00ff41]" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-[#1a1a24] border border-[#2a2a3a] text-[11px] font-bold text-gray-400 flex items-center justify-center">K</div>
              <span className="text-[12px] text-gray-300 tracking-widest uppercase animate-pulse">Calling Khalid...</span>
            </div>
          </div>

          <button className="h-8 px-4 border border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444] font-bold text-[10px] hover:bg-[#ef4444]/20 transition-colors tracking-widest z-10 cursor-pointer">CANCEL</button>
        </div>
      </div>

    </div>
  );
};

export default Apex;
