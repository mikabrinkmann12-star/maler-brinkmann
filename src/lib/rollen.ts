// Rollen und ihre Startseiten. Darf auch im Browser-Code benutzt werden.
// Die eigentliche Rechteprüfung passiert immer serverseitig (requireRole + RLS).

export type Rolle = "admin" | "buero" | "mitarbeiter";

export const ROLLEN_NAMEN: Record<Rolle, string> = {
  admin: "Admin",
  buero: "Büro",
  mitarbeiter: "Mitarbeiter",
};

export const BUERO_ROLLEN = ["admin", "buero"] as const satisfies readonly Rolle[];

export function istBueroRolle(rolle: Rolle): boolean {
  return rolle === "admin" || rolle === "buero";
}

export function startseiteFuer(rolle: Rolle): "/heute" | "/buero" {
  return istBueroRolle(rolle) ? "/buero" : "/heute";
}
