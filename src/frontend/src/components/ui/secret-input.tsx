import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface SecretInputProps extends Omit<InputProps, "type"> {
  hiddenLabel?: string;
  visibleLabel?: string;
  leadingAdornment?: React.ReactNode;
}

export function SecretInput(props: SecretInputProps) {
  const {
    className,
    hiddenLabel = "Show secret",
    leadingAdornment,
    visibleLabel = "Hide secret",
    ...inputProps
  } = props;
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="relative">
      {leadingAdornment ? (
        <div className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground">
          {leadingAdornment}
        </div>
      ) : null}
      <Input
        {...inputProps}
        className={cn(leadingAdornment ? "pl-9" : "", "pr-11", className)}
        type={revealed ? "text" : "password"}
      />
      <Button
        aria-label={revealed ? visibleLabel : hiddenLabel}
        className="absolute right-1 top-1 h-8 w-8 rounded-md px-0"
        onClick={function handleToggleClick() {
          setRevealed(function invertReveal(previousValue) {
            return !previousValue;
          });
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
