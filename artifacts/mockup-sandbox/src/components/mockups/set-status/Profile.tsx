import './_group.css';

export function Profile() {
  const user = {
    displayName: "NAF",
    username: "nnn",
    avatarUrl: "/api/images/8886f8f1-a60b-45bb-bea2-abcdda687355",
    profileFrameColor: "#EF4444",
    status: "online",
    statusText: "يالمرحبا يالرحيب المطر 🦄",
    isPro: true,
    tier: "SCOUT",
    bio: "Bio text goes here...",
  };

  const statusLabel = user.status.toUpperCase();

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans">
      {/* Banner */}
      <div className="h-32 bg-gradient-to-r from-red-900/40 to-gray-900" />

      {/* Avatar + Identity Row */}
      <div className="px-6 -mt-14 relative z-10 flex items-end gap-5">
        {/* Avatar wrapper */}
        <div className="relative shrink-0">
          <div
            className="w-28 h-28 rounded-full border-4 bg-[#1a1a1a] overflow-hidden flex items-center justify-center"
            style={{ borderColor: user.profileFrameColor }}
          >
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          </div>
          {/* Status pill below avatar */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#111] border border-[#333] px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-[#888]">
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Identity — beside the avatar */}
        <div className="flex-1 min-w-0 pb-1">
          {/* Custom Status Text — above name/username, next to avatar */}
          <div className="relative inline-block max-w-full mb-2">
            <div className="bg-[#1a1a1a] border border-[#333] px-3 py-1.5 rounded-xl rounded-tl-none text-sm font-mono text-[#e0e0e0]/90 max-w-sm">
              {user.statusText}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase leading-tight">
              {user.displayName}
            </h1>
            <span className="text-yellow-500 text-xs">✓</span>
          </div>
          <p className="text-green-500 font-mono text-sm mt-1">@{user.username}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#888] border border-[#333] px-2.5 py-1 transition-colors">
              EDIT PROFILE
            </button>
            <button className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#888] border border-[#333] px-2.5 py-1 transition-colors">
              SET STATUS
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 pt-10 pb-6 space-y-4">
        <p className="text-[#888] border-s-2 border-[#333] ps-4 italic font-mono text-sm leading-relaxed">
          "{user.bio}"
        </p>
      </div>
    </div>
  );
}
