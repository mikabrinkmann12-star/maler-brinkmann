"use client";

import { useEffect } from "react";
import { AKZENT_COOKIE, STANDARD_AKZENT, type Akzent } from "@/lib/darstellung";

/**
 * Gleicht den Farbsatz der Seite mit dem gespeicherten Wert ab (z. B. auf einem neuen Gerät, wo das Cookie noch fehlt):
 * setzt `data-akzent` am <html> und merkt ihn im Cookie, damit er beim nächsten Laden sofort stimmt.
 */
export function AkzentAbgleich({ akzent }: { akzent: Akzent }) {
  useEffect(() => {
    const html = document.documentElement;
    if (akzent === STANDARD_AKZENT) delete html.dataset.akzent;
    else html.dataset.akzent = akzent;
    const gesetzt = document.cookie.split("; ").find((c) => c.startsWith(`${AKZENT_COOKIE}=`))?.split("=")[1];
    if (gesetzt !== akzent) document.cookie = `${AKZENT_COOKIE}=${akzent}; path=/; max-age=31536000; samesite=lax`;
  }, [akzent]);
  return null;
}
