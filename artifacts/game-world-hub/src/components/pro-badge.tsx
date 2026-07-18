import { cn } from "@/lib/utils";
import { Crown, BadgeCheck } from "lucide-react";

interface ProBadgeProps {
  size?: "icon" | "sm" | "md" | "lg";
  className?: string;
  text?: string;
}

export function ProBadge({ size = "sm", className, text }: ProBadgeProps) {
  if (size === "icon") {
    return (
      <BadgeCheck
        className={cn("w-3.5 h-3.5 shrink-0 fill-amber-400 text-black", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono font-bold uppercase tracking-widest",
        "bg-gradient-to-r from-amber-500 to-yellow-300 text-black",
        "border border-yellow-400/60 shadow-sm shadow-yellow-500/20",
        size === "sm" && "text-[9px] px-1.5 py-0.5 rounded-sm",
        size === "md" && "text-[10px] px-2 py-0.5 rounded",
        size === "lg" && "text-xs px-2.5 py-1 rounded",
        className,
      )}
    >
      <Crown
        className={cn(
          "shrink-0 fill-black",
          size === "sm" && "w-2.5 h-2.5",
          size === "md" && "w-3 h-3",
          size === "lg" && "w-3.5 h-3.5",
        )}
      />
      {text ?? "Pro"}
    </span>
  );
}
