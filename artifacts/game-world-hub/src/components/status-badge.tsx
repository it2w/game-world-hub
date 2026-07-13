import React from "react";
import type { User } from "@workspace/api-client-react";

type UserStatus = User["status"];

export function StatusBadge({ status, className = "" }: { status: UserStatus, className?: string }) {
  const getStatusColor = (s: UserStatus) => {
    switch(s) {
      case "online": return "bg-green-500 border-green-500/20";
      case "away": return "bg-yellow-500 border-yellow-500/20";
      case "busy": return "bg-red-500 border-red-500/20";
      case "offline": default: return "bg-gray-600 border-gray-600/20";
    }
  };

  return (
    <div className={`w-3 h-3 rounded-full border-2 ${getStatusColor(status)} ${className}`} />
  );
}
