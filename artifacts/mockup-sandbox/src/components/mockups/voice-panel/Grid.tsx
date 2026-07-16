import React from 'react';
import {
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Phone,
  PhoneOutgoing,
  Video,
  VideoOff,
  EarOff,
  Ear,
  Loader2,
  ChevronDown,
  X,
  Maximize2
} from 'lucide-react';

const VoicePanel = () => {
  return (
    <div className="w-[320px] bg-[#0c0c18] border border-[#1a1a2e] flex flex-col rounded-none shadow-2xl relative font-mono">
      {/* Header */}
      <div className="border-t-[3px] border-[#00ff41] p-3 flex items-center justify-between bg-[#080810]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#00ff41] rounded-none animate-pulse shadow-[0_0_8px_#00ff41]" />
          <span className="text-white text-[12px] font-bold tracking-wider">VALORANT RANKED</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-[#00ff4115] border border-[#00ff4130] text-[#00ff41] text-[10px] px-1.5 py-0.5 rounded-none font-bold">
            4 MEMBERS
          </div>
          <ChevronDown className="w-4 h-4 text-white/50 cursor-pointer hover:text-white" />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 p-2 bg-[#080810]">
        {/* YOU */}
        <div className="relative aspect-square flex flex-col items-center justify-center bg-[#00ff4108] border-[2px] border-[#00ff41] shadow-[0_0_12px_#00ff4140] rounded-none p-2 group">
          <div className="relative w-[56px] h-[56px] mb-2 flex items-center justify-center">
            <div className="absolute inset-0 rounded-none border border-transparent border-t-[#00ff41] animate-spin" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-1 rounded-none border border-transparent border-b-[#00ff41] animate-spin" style={{ animationDuration: '3s', animationDirection: 'reverse' }} />
            <div className="w-[48px] h-[48px] bg-[#1a1a2e] border border-[#00ff41] rounded-none flex items-center justify-center text-white font-bold text-lg">Y</div>
          </div>
          <span className="text-[#00ff41] text-[10px] font-bold truncate w-full text-center">YOU</span>
          
          <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-[#080810] p-1 border border-[#1e1e2e]">
            <Monitor className="w-3 h-3 text-[#00ff41]" />
            <div className="flex items-end gap-[1px] h-3 w-3 mx-0.5">
              <div className="w-[2px] bg-[#00ff41] rounded-none animate-[bounce_0.8s_infinite]" style={{ height: '60%' }} />
              <div className="w-[2px] bg-[#00ff41] rounded-none animate-[bounce_1.2s_infinite]" style={{ height: '100%' }} />
              <div className="w-[2px] bg-[#00ff41] rounded-none animate-[bounce_0.9s_infinite]" style={{ height: '40%' }} />
            </div>
          </div>
        </div>

        {/* Khalid */}
        <div className="relative aspect-square flex flex-col items-center justify-center bg-[#111120] border border-[#1e1e2e] rounded-none p-2">
          <div className="w-[48px] h-[48px] bg-[#1a1a2e] border border-[#1e1e2e] rounded-none flex items-center justify-center text-white font-bold text-lg mb-2">K</div>
          <span className="text-white/80 text-[10px] truncate w-full text-center">KHALID</span>
          
          <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-[#080810] p-1 border border-[#1e1e2e]">
            <Video className="w-3 h-3 text-[#00ff41]" />
          </div>
        </div>

        {/* Sara */}
        <div className="relative aspect-square flex flex-col items-center justify-center bg-[#111120] border border-[#1e1e2e] rounded-none p-2 opacity-70 hover:opacity-100 transition-opacity">
          <div className="w-[48px] h-[48px] bg-[#1a1a2e] border border-[#1e1e2e] rounded-none flex items-center justify-center text-white font-bold text-lg mb-2">S</div>
          <span className="text-white/80 text-[10px] truncate w-full text-center">SARA</span>
          
          <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-[#080810] p-1 border border-[#1e1e2e]">
            <MicOff className="w-3 h-3 text-[#ef4444]" />
          </div>
        </div>

        {/* Omar */}
        <div className="relative aspect-square flex flex-col items-center justify-center bg-[#111120] border border-[#1e1e2e] rounded-none p-2 opacity-50">
          <div className="w-[48px] h-[48px] bg-[#1a1a2e] border border-[#1e1e2e] rounded-none flex items-center justify-center text-white/50 font-bold text-lg mb-2">O</div>
          <span className="text-white/50 text-[10px] truncate w-full text-center">OMAR</span>
          
          <div className="absolute bottom-1 right-1 flex items-center justify-center bg-[#080810] p-1 border border-[#1e1e2e]">
            <Loader2 className="w-3 h-3 text-white/40 animate-spin" />
          </div>
        </div>
      </div>

      {/* Screen Share Section */}
      <div className="bg-black aspect-video relative group border-t border-b border-[#1e1e2e] overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, #ffffff10 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        <div className="absolute top-2 left-2 bg-[#080810]/80 border border-[#1e1e2e] px-1.5 py-0.5 text-[#00ff41] text-[9px] font-bold tracking-widest backdrop-blur-sm z-10">
          YOUR SCREEN
        </div>
        <div className="absolute top-2 right-2 bg-[#00ff41] text-black px-1.5 py-0.5 text-[9px] font-bold z-10">
          60FPS
        </div>
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer z-20">
          <Maximize2 className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Controls */}
      <div className="p-3 bg-[#0c0c18] flex items-center gap-2">
        <button className="w-[44px] h-[44px] rounded-none bg-[#00ff4118] border border-[#00ff41] shadow-[0_0_8px_#00ff4130] flex items-center justify-center text-[#00ff41] hover:bg-[#00ff4125] transition-colors cursor-pointer">
          <Mic className="w-5 h-5" />
        </button>
        <button className="w-[44px] h-[44px] rounded-none bg-[#16162a] border border-[#2a2a40] flex items-center justify-center text-white hover:bg-[#202038] transition-colors cursor-pointer">
          <EarOff className="w-5 h-5" />
        </button>
        <button className="w-[44px] h-[44px] rounded-none bg-[#16162a] border border-[#2a2a40] flex items-center justify-center text-white hover:bg-[#202038] transition-colors cursor-pointer">
          <Video className="w-5 h-5" />
        </button>
        <button className="w-[44px] h-[44px] rounded-none bg-[#00ff4118] border border-[#00ff41] shadow-[0_0_8px_#00ff4130] flex items-center justify-center text-[#00ff41] hover:bg-[#00ff4125] transition-colors cursor-pointer">
          <Monitor className="w-5 h-5" />
        </button>
        <button className="w-[44px] h-[44px] rounded-none bg-[#ef444418] border border-[#ef4444] text-[#ef4444] hover:bg-[#ef444430] transition-colors ml-auto flex items-center justify-center cursor-pointer shadow-[0_0_8px_#ef444420]">
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

const IncomingCallDialog = () => {
  return (
    <div className="w-[420px] bg-[#0c0c18] border border-[#1e1e2e] shadow-2xl overflow-hidden relative flex flex-col rounded-none font-mono">
      {/* Background with radial gradient and dots */}
      <div className="absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse at top, #0d1a12, #080810)' }} />
      <div className="absolute inset-0 z-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle, #ffffff08 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div className="relative z-10 flex flex-col items-center pt-12 pb-8 px-8">
        {/* Animated Rings + Avatar */}
        <div className="relative w-[160px] h-[160px] flex items-center justify-center mb-6">
          <div className="absolute inset-0 border border-[#00ff4140] rounded-none animate-ping" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-2 border border-[#00ff4130] rounded-none animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
          <div className="absolute inset-4 border border-[#00ff4120] rounded-none animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }} />
          <div className="absolute inset-6 border border-[#00ff4110] rounded-none animate-ping" style={{ animationDuration: '3s', animationDelay: '1.5s' }} />
          
          <div className="w-[96px] h-[96px] bg-[#1a1a2e] border-[2px] border-[#00ff41] shadow-[0_0_24px_#00ff4160] rounded-none flex items-center justify-center text-white font-bold text-4xl relative z-10">
            M
          </div>
        </div>

        <div className="text-[#00ff41] text-[10px] tracking-[0.3em] font-bold mb-2">INCOMING CALL FROM</div>
        <div className="text-white text-[22px] font-bold mb-1">MAJED AL-HARBI</div>
        <div className="text-white/40 text-[12px] mb-8">@majed</div>

        <div className="w-full flex flex-col gap-3">
          <button className="w-full h-[48px] bg-[#ef444415] border border-[#ef4444] text-[#ef4444] rounded-none font-bold text-[14px] flex items-center justify-center gap-2 hover:bg-[#ef444425] transition-colors cursor-pointer group">
            <PhoneOff className="w-4 h-4 group-hover:scale-110 transition-transform" />
            DECLINE
          </button>
          
          <button className="w-full h-[48px] bg-[#00ff41] text-black border border-transparent rounded-none font-bold text-[14px] flex items-center justify-center gap-2 hover:bg-[#00ff41] hover:brightness-110 transition-all cursor-pointer relative overflow-hidden group shadow-[0_0_16px_#00ff4140]">
            <div className="absolute inset-0 w-full h-full transform -skew-x-12 bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            <Phone className="w-4 h-4" />
            ACCEPT
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% { transform: translateX(200%) skewX(-12deg); }
        }
      `}} />
    </div>
  );
};

const OutgoingCallBanner = () => {
  return (
    <div className="w-[480px] h-[64px] bg-[#0c0c18] border-l-[4px] border-l-[#00ff41] border border-[#1e1e2e] shadow-xl flex items-center rounded-none font-mono">
      <div className="flex-1 flex items-center px-4 gap-4 h-full">
        {/* Avatar Area */}
        <div className="relative w-[40px] h-[40px] flex items-center justify-center">
          <div className="absolute inset-0 border border-[#00ff41] rounded-none opacity-50 animate-ping" />
          <div className="w-[32px] h-[32px] bg-[#1a1a2e] border border-[#1e1e2e] flex items-center justify-center text-white font-bold text-sm z-10 rounded-none">
            K
          </div>
        </div>

        {/* Text Area */}
        <div className="flex flex-col justify-center">
          <div className="text-white text-[14px] font-bold flex items-center">
            CALLING KHALID
            <span className="flex w-6 overflow-hidden relative ml-1">
              <span className="animate-[dots_1.5s_infinite_linear]">...</span>
            </span>
          </div>
          <div className="text-white/40 text-[10px] tracking-wider mt-0.5">ESTABLISHING SECURE CONNECTION</div>
        </div>
      </div>
      
      {/* End call button */}
      <button className="h-full px-6 bg-[#080810] border-l border-[#1e1e2e] hover:bg-[#ef444415] hover:text-[#ef4444] text-white/50 transition-colors flex items-center justify-center cursor-pointer">
        <X className="w-5 h-5" />
      </button>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes dots {
          0% { clip-path: inset(0 100% 0 0); }
          25% { clip-path: inset(0 66% 0 0); }
          50% { clip-path: inset(0 33% 0 0); }
          75% { clip-path: inset(0 0 0 0); }
          100% { clip-path: inset(0 0 0 0); }
        }
      `}} />
    </div>
  );
};

export default function Grid() {
  return (
    <div style={{
      background: "#050509", 
      minHeight: "100vh", 
      display: "flex", 
      flexDirection: "column", 
      gap: "48px", 
      padding: "32px", 
      fontFamily: "monospace",
      alignItems: "center"
    }}>
      <div className="w-full max-w-4xl flex flex-col items-center">
        <div className="w-full max-w-md">
          <div style={{color:"#ffffff30", fontSize:"10px", letterSpacing:"0.2em", marginBottom:"12px", textTransform:"uppercase"}}>
            VOICE PANEL (GRID)
          </div>
          <div className="flex justify-center border border-[#1e1e2e] border-dashed p-8 bg-[#0a0a15]">
            <VoicePanel />
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl flex flex-col items-center">
        <div className="w-full max-w-md">
          <div style={{color:"#ffffff30", fontSize:"10px", letterSpacing:"0.2em", marginBottom:"12px", textTransform:"uppercase"}}>
            INCOMING CALL
          </div>
          <div className="flex justify-center border border-[#1e1e2e] border-dashed p-8 bg-[#0a0a15]">
            <IncomingCallDialog />
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl flex flex-col items-center">
        <div className="w-full max-w-xl">
          <div style={{color:"#ffffff30", fontSize:"10px", letterSpacing:"0.2em", marginBottom:"12px", textTransform:"uppercase"}}>
            OUTGOING CALL
          </div>
          <div className="flex justify-center border border-[#1e1e2e] border-dashed p-8 bg-[#0a0a15]">
            <OutgoingCallBanner />
          </div>
        </div>
      </div>
    </div>
  );
}
