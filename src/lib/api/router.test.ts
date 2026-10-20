import { describe, expect, it } from "vitest";
import { istUuid, routeSuchen, routenKatalog } from "./router";
import type { ApiRoute } from "./typen";

const r = (methode: "GET" | "POST", pfad: string): ApiRoute => ({ methode, pfad, scope: "lesen", titel: pfad, handler: async () => null });
const routen = [r("GET", "projekte"), r("GET", "projekte/:id"), r("POST", "projekte"), r("POST", "container/:id/erledigt")];

describe("routeSuchen", () => {
  it("findet feste Pfade und Parameter", () => {
    const a = routeSuchen(routen, "GET", "projekte");
    expect("route" in a && a.route.pfad).toBe("projekte");
    const b = routeSuchen(routen, "GET", "/projekte/abc/");
    expect("route" in b && b.params).toEqual({ id: "abc" });
    const c = routeSuchen(routen, "POST", "container/42/erledigt");
    expect("route" in c && c.params).toEqual({ id: "42" });
  });
  it("trennt die Methoden", () => {
    const a = routeSuchen(routen, "POST", "projekte");
    expect("route" in a && a.route.methode).toBe("POST");
    const b = routeSuchen(routen, "POST", "projekte/abc");
    expect(b).toEqual({ fehler: "methode", erlaubt: ["GET"] });
  });
  it("unbekannt", () => {
    expect(routeSuchen(routen, "GET", "gibtsnicht")).toEqual({ fehler: "nicht-gefunden" });
    expect(routeSuchen(routen, "GET", "projekte/a/b")).toEqual({ fehler: "nicht-gefunden" });
  });
});

describe("Katalog und UUID", () => {
  it("Katalog nennt Pfad und Recht", () => {
    expect(routenKatalog([r("GET", "projekte")])[0]).toMatchObject({ methode: "GET", pfad: "/api/v1/projekte", recht: "lesen" });
  });
  it("istUuid", () => {
    expect(istUuid("0f14981a-c8c4-4f2e-9d7d-33f4b7bac080")).toBe(true);
    expect(istUuid("abc")).toBe(false);
    expect(istUuid(undefined)).toBe(false);
  });
});
