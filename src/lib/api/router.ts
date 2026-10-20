// Kleiner Router für /api/v1: Pfad-Muster mit :parametern. Reine Logik, ohne Datenbank (gut testbar).

import type { ApiRoute } from "./typen";

export type Treffer = { route: ApiRoute; params: Record<string, string> } | { fehler: "nicht-gefunden" } | { fehler: "methode"; erlaubt: string[] };

function segmente(pfad: string): string[] {
  return pfad.split("/").map((s) => s.trim()).filter(Boolean);
}

export function routeSuchen(routen: readonly ApiRoute[], methode: string, pfad: string): Treffer {
  const teile = segmente(pfad);
  const erlaubt = new Set<string>();
  for (const route of routen) {
    const muster = segmente(route.pfad);
    if (muster.length !== teile.length) continue;
    const params: Record<string, string> = {};
    let passt = true;
    for (let i = 0; i < muster.length; i++) {
      if (muster[i].startsWith(":")) {
        try {
          params[muster[i].slice(1)] = decodeURIComponent(teile[i]);
        } catch {
          passt = false;
          break;
        }
      } else if (muster[i] !== teile[i]) {
        passt = false;
        break;
      }
    }
    if (!passt) continue;
    if (route.methode === methode) return { route, params };
    erlaubt.add(route.methode);
  }
  return erlaubt.size ? { fehler: "methode", erlaubt: [...erlaubt] } : { fehler: "nicht-gefunden" };
}

/** Beschreibung aller Routen (für GET /api/v1, damit Jarvis seine „Werkzeuge“ kennt). */
export function routenKatalog(routen: readonly ApiRoute[]) {
  return routen.map((r) => ({
    methode: r.methode,
    pfad: `/api/v1/${r.pfad}`,
    recht: r.scope,
    beschreibung: r.titel,
    ...(r.parameter ? { parameter: r.parameter } : {}),
    ...(r.koerper ? { koerper: r.koerper } : {}),
  }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const istUuid = (wert: unknown): wert is string => typeof wert === "string" && UUID.test(wert);
