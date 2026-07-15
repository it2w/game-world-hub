import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

interface ProBadgeProps {
  size?: "sm" | "md";
  className?: string;
  text?: string;
}

export function ProBadge({ size = "sm", className, text }: ProBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono font-bold uppercase tracking-wider",
        "bg-gradient-to-r from-amber-500 to-yellow-300 text-black",
        "border border-yellow-400/60 shadow-sm shadow-yellow-500/20",
        size === "sm" && "text-[9px] px-1.5 py-0.5 rounded-sm",
        size === "md" && "text-[10px] px-2 py-0.5 rounded",
        className,
      )}
    >
      <Crown className={cn("shrink-0 fill-black", size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3")} />
      {text ?? "Pro"}
    </span>
  );
}
