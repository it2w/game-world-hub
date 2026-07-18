import './_group.css';
import { useState } from "react";
import { Smile, ChevronDown } from "lucide-react";

const EMOJIS = [
  "😀", "😂", "🥰", "😎", "😭", "😡", "🎮", "🔥",
  "👍", "👎", "❤️", "💯", "🚀", "🎯", "🏆", "⚡",
  "🎉", "🎊", "✨", "🌟", "💀", "🤔", "🥳", "😴",
  "😇", "🤯", "😱", "🤗", "😷", "🤡", "🎃", "🎁",
  "🎄", "🌙", "☀️", "⭐", "☕", "🍕", "🍔", "🍟",
  "🍣", "🍜", "🍦", "🍩", "🍪", "🍫", "🍬", "🍭",
  "🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🍒", "🍑",
  "🍍", "🥝", "🥑", "🥕", "🌽", "🥦", "🍄", "🥜",
];

type UserStatus = "online" | "away" | "busy" | "offline";

function StatusBadge({ status, className = "" }: { status: UserStatus; className?: string }) {
  const getStatusColor = (s: UserStatus) => {
    switch (s) {
      case "online": return "bg-green-500 border-green-500/20";
      case "away": return "bg-yellow-500 border-yellow-500/20";
      case "busy": return "bg-red-500 border-red-500/20";
      case "offline": default: return "bg-gray-600 border-gray-600/20";
    }
  };
  return <div className={`w-3 h-3 rounded-full border-2 ${getStatusColor(status)} ${className}`} />;
}

export function Current() {
  const [status, setStatus] = useState<UserStatus>("away");
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const user = {
    displayName: "NAF",
    username: "nnn",
    avatarUrl: "/api/images/8886f8f1-a60b-45bb-bea2-abcdda687355",
    profileFrameColor: "#EF4444",
    isPro: true,
    tier: "SCOUT",
  };

  return (
    <div className="min-h-screen bg-[#111214] p-8 flex items-center justify-center">
      {/* Discord-style status modal card */}
      <div className="bg-[#232428] text-[#dbdee1] rounded-xl w-full max-w-[440px] overflow-hidden font-sans shadow-2xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-0">
          <h2 className="text-[#f2f3f5] text-xl font-semibold">Set your status</h2>
        </div>

        {/* Mini profile preview */}
        <div className="px-5 pt-4">
          <div className="bg-[#111214]/80 rounded-xl p-4 flex items-start gap-3">
            <div className="relative shrink-0">
              <div
                className="w-16 h-16 rounded-full bg-[#232428] overflow-hidden flex items-center justify-center border-2 border-[#232428]"
                style={{ borderColor: user.profileFrameColor ?? "#232428" }}
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-[#b5bac1] select-none font-medium">
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1">
                <StatusBadge status={status} className="w-4 h-4 rounded-full border-2 border-[#111214]" />
              </div>
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="relative inline-block max-w-full">
                <div className="bg-[#232428] rounded-2xl rounded-tl-none px-3 py-2 text-sm text-[#dbdee1] shadow-sm">
                  {text.trim() || "What's on your mind?"}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-semibold text-[#f2f3f5] text-sm">{user.displayName}</span>
                <span className="text-xs text-[#b5bac1]">@{user.username}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {user.isPro && <span className="text-[10px] bg-[#232428] text-[#b5bac1] px-1.5 py-0.5 rounded">PRO</span>}
                {user.tier && <span className="text-[10px] bg-[#232428] text-[#b5bac1] px-1.5 py-0.5 rounded">{user.tier}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Status input */}
        <div className="px-5 pt-5">
          <label className="text-xs font-semibold text-[#b5bac1] uppercase tracking-wide block mb-2">
            Status
          </label>
          <div className="relative">
            <div className="flex items-center gap-2 bg-[#1e1f22] hover:bg-[#26272b] rounded-lg px-3 py-2 transition-colors">
              <button
                type="button"
                onClick={() => setEmojiOpen(!emojiOpen)}
                className="shrink-0 text-[#b5bac1] hover:text-[#f2f3f5] transition-colors"
                title="Emoji"
              >
                <Smile className="w-5 h-5" />
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 100))}
                placeholder="What's on your mind?"
                className="flex-1 bg-transparent text-[#dbdee1] placeholder:text-[#6d6f78] text-sm outline-none min-w-0"
              />
            </div>
            {emojiOpen && (
              <div className="absolute z-10 mt-2 w-64 bg-[#232428] border border-[#111214] rounded-lg p-2 shadow-xl">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setText((prev) => `${prev}${emoji}`.slice(0, 100));
                        setEmojiOpen(false);
                      }}
                      className="text-lg hover:bg-[#404249] rounded p-1 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="text-[10px] text-[#6d6f78] mt-1.5 text-right">{text.length}/100</div>
        </div>

        {/* Compact status selector */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-1 bg-[#1e1f22] rounded-lg p-1">
            {(["online", "away", "busy", "offline"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                  status === s
                    ? "bg-[#404249] text-[#f2f3f5]"
                    : "text-[#b5bac1] hover:bg-[#26272b] hover:text-[#dbdee1]"
                }`}
              >
                <StatusBadge status={s} className="w-2.5 h-2.5 shrink-0" />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="relative">
            <button
              type="button"
              onClick={() => setClearOpen(!clearOpen)}
              className="flex items-center gap-1 text-sm text-[#b5bac1] hover:text-[#f2f3f5] transition-colors"
            >
              Don't clear
              <ChevronDown className="w-4 h-4" />
            </button>
            {clearOpen && (
              <div className="absolute z-10 mt-2 w-48 bg-[#232428] border border-[#111214] rounded-lg p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => { setText(""); setClearOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-[#f2f3f5] hover:bg-[#5865f2] rounded transition-colors"
                >
                  Clear status
                </button>
              </div>
            )}
          </div>
          <button className="bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-md px-6 py-2 text-sm font-medium transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
