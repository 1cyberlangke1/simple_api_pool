import { ProviderIcon } from "@lobehub/icons";
import { Server } from "lucide-react";

import { resolveProviderIconName } from "@/lib/provider_icons";

export function ProviderBadgeIcon(props: {
  providerHints: Array<string | null | undefined>;
  size?: number;
}) {
  const providerName = resolveProviderIconName(props.providerHints);

  if (!providerName) {
    return (
      <div className="flex items-center justify-center rounded-full bg-muted p-2 text-muted-foreground">
        <Server className="h-4 w-4" />
      </div>
    );
  }

  return <ProviderIcon provider={providerName} size={props.size || 32} type="avatar" />;
}
