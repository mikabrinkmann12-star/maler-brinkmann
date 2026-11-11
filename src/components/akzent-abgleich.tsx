"use client";

import { useEffect } from "react";
import { AKZENT_COOKIE, GLAS_COOKIE, STANDARD_AKZENT, type Akzent } from "@/lib/darstellung";

const keks = (name: string) => document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=")[1];
const merken = (name: string, wert: string) => { document.cookie = `${name}=${wert}; path=/; max-age=31536000; samesite=lax`; };

/**
 * Gleicht Farbsatz und Glas-Look der Seite mit dem gespeicherten Wert ab (z. B. auf einem neuen Gerät, wo die Cookies noch fehlen):
 * setzt `data-akzent` bzw. `data-glas` am <html> und merkt beides im Cookie, damit es beim nächsten Laden sofort stimmt.
 */
export function AkzentAbgleich({ akzent, glas = false }: { akzent: Akzent; glas?: boolean }) {
  useEffect(() => {
    const html = document.documentElement;
    if (akzent === STANDARD_AKZENT) delete html.dataset.akzent;
    else html.dataset.akzent = akzent;
    if (glas) html.dataset.glas = "an";
    else delete html.dataset.glas;
    if (keks(AKZENT_COOKIE) !== akzent) merken(AKZENT_COOKIE, akzent);
    if (keks(GLAS_COOKIE) !== (glas ? "1" : "0")) merken(GLAS_COOKIE, glas ? "1" : "0");
  }, [akzent, glas]);
  return null;
}
