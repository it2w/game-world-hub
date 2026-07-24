import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Wraps a settings panel that should only be visible to owners or mods.
 *
 * Usage:
 *   <RoleGuard allowed={community.isOwner}>
 *     <DangerZoneContent />
 *   </RoleGuard>
 *
 *   <RoleGuard allowed={community.isOwner || community.isMod}>
 *     <InsightsContent />
 *   </RoleGuard>
 *
 * When `allowed` is false, renders an access-denied placeholder so that a
 * DevTools state mutation or a crafted URL can never expose restricted UI to
 * a plain member.
 */
export function RoleGuard({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const { t } = useTranslation("communities");

  if (!allowed) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-destructive/40 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("ownerOnly", "Owner-only settings")}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
