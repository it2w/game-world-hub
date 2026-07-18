import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { StatusBadge } from "@/components/status-badge";
import { Smile, ChevronDown } from "lucide-react";

type UserStatus = "online" | "away" | "busy" | "offline";

interface SetStatusDialogUser {
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  profileFrameColor?: string | null;
  isPro?: boolean;
  tier?: string | null;
}

interface SetStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: SetStatusDialogUser;
  initialStatus: UserStatus;
  initialText: string;
  onSave: (status: UserStatus, text: string) => void;
  isPending?: boolean;
}

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

export function SetStatusDialog({
  open,
  onOpenChange,
  user,
  initialStatus,
  initialText,
  onSave,
  isPending,
}: SetStatusDialogProps) {
  const { t } = useTranslation("profile");
  const [editStatusValue, setEditStatusValue] = useState<UserStatus>(initialStatus);
  const [editStatusText, setEditStatusText] = useState(initialText);

  const handleSave = () => {
    onSave(editStatusValue, editStatusText.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#232428] border-none text-[#dbdee1] rounded-xl p-0 max-w-[440px] overflow-hidden font-sans">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-[#f2f3f5] text-xl font-semibold">
            {t("setStatus.title")}
          </DialogTitle>
        </DialogHeader>

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
                <StatusBadge status={editStatusValue} className="w-4 h-4 rounded-full border-2 border-[#111214]" />
              </div>
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="relative inline-block max-w-full">
                <div className="bg-[#232428] rounded-2xl rounded-tl-none px-3 py-2 text-sm text-[#dbdee1] shadow-sm">
                  {editStatusText.trim() || t("setStatus.placeholder")}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-semibold text-[#f2f3f5] text-sm">{user.displayName}</span>
                <span className="text-xs text-[#b5bac1]">@{user.username}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {user.isPro && (
                  <span className="text-[10px] bg-[#232428] text-[#b5bac1] px-1.5 py-0.5 rounded">PRO</span>
                )}
                {user.tier && (
                  <span className="text-[10px] bg-[#232428] text-[#b5bac1] px-1.5 py-0.5 rounded">{user.tier}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status input */}
        <div className="px-5 pt-5">
          <label className="text-xs font-semibold text-[#b5bac1] uppercase tracking-wide block mb-2">
            {t("setStatus.statusLabel")}
          </label>
          <div className="flex items-center gap-2 bg-[#1e1f22] hover:bg-[#26272b] rounded-lg px-3 py-2 transition-colors">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 text-[#b5bac1] hover:text-[#f2f3f5] transition-colors"
                  title={t("setStatus.emoji")}
                >
                  <Smile className="w-5 h-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 bg-[#232428] border-[#111214] p-2">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setEditStatusText((prev) => `${prev}${emoji}`.slice(0, 100))}
                      className="text-lg hover:bg-[#404249] rounded p-1 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <input
              value={editStatusText}
              onChange={(e) => setEditStatusText(e.target.value.slice(0, 100))}
              placeholder={t("setStatus.placeholder")}
              className="flex-1 bg-transparent text-[#dbdee1] placeholder:text-[#6d6f78] text-sm outline-none min-w-0"
            />
          </div>
          <div className="text-[10px] text-[#6d6f78] mt-1.5 text-right">{editStatusText.length}/100</div>
        </div>

        {/* Compact status selector */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-1 bg-[#1e1f22] rounded-lg p-1">
            {(["online", "away", "busy", "offline"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setEditStatusValue(s)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                  editStatusValue === s
                    ? "bg-[#404249] text-[#f2f3f5]"
                    : "text-[#b5bac1] hover:bg-[#26272b] hover:text-[#dbdee1]"
                }`}
              >
                <StatusBadge status={s} className="w-2.5 h-2.5 shrink-0" />
                {t(`setStatus.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-5 flex items-center justify-between">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-[#b5bac1] hover:text-[#f2f3f5] transition-colors"
              >
                {t("setStatus.dontClear")}
                <ChevronDown className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 bg-[#232428] border-[#111214] p-1">
              <button
                type="button"
                onClick={() => setEditStatusText("")}
                className="w-full text-left px-3 py-2 text-sm text-[#f2f3f5] hover:bg-[#5865f2] rounded transition-colors"
              >
                {t("setStatus.clearStatus")}
              </button>
            </PopoverContent>
          </Popover>
          <Button
            className="bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-md px-6 font-medium"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? t("setStatus.saving") : t("setStatus.saveButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
