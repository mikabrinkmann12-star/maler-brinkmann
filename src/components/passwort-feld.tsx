"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";

/** Passwort-Eingabe mit Auge zum Ein-/Ausblenden (hilfreich auf dem Handy). */
export function PasswortFeld({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [sichtbar, setSichtbar] = useState(false);

  return (
    <div className="relative">
      <Input
        type={sichtbar ? "text" : "password"}
        className={cn("h-12 pr-12 text-base", className)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        onClick={() => setSichtbar((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={sichtbar ? "Passwort verbergen" : "Passwort anzeigen"}
      >
        {sichtbar ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
      </button>
    </div>
  );
}
