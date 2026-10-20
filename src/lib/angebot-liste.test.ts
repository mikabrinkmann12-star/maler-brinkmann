import { describe, expect, it } from "vitest";
import { angeboteFiltern, annahmeVon, summe, versandVon, type FilterbaresAngebot } from "./angebot-liste";

const a = (teil: Partial<FilterbaresAngebot> & { id: string }) => ({
  status: "entwurf" as const, versendetAm: null, datum: "2026-10-10", projektId: "p1", projektArchiviert: false, ...teil,
});
const liste = [
  a({ id: "entwurf" }),
  a({ id: "gesendet", status: "versendet", versendetAm: "2026-10-11T10:00:00Z", datum: "2026-10-11" }),
  a({ id: "angenommen", status: "angenommen", versendetAm: "2026-09-01T10:00:00Z", datum: "2026-09-01", projektId: "p2" }),
  a({ id: "abgelehnt", status: "abgelehnt", versendetAm: "2026-08-01T10:00:00Z", datum: "2026-08-01", projektArchiviert: true }),
];
const keine = { status: [], projektIds: [], nurAktiveProjekte: false };
const ids = (f: Parameters<typeof angeboteFiltern>[1]) => angeboteFiltern(liste, f).map((x) => x.id);

describe("Angebotsliste: Status aus drei Sichten", () => {
  it("Annahme und Versand werden vom Status abgeleitet", () => {
    expect(annahmeVon("entwurf")).toBe("ausstehend");
    expect(annahmeVon("versendet")).toBe("ausstehend");
    expect(annahmeVon("angenommen")).toBe("angenommen");
    expect(annahmeVon("abgelehnt")).toBe("abgelehnt");
    expect(versandVon(null)).toBe("nicht_gesendet");
    expect(versandVon("2026-10-11T10:00:00Z")).toBe("gesendet");
    expect(versandVon("2026-10-11T10:00:00Z", "2026-10-12T08:00:00Z")).toBe("geoeffnet");
  });

  it("ohne Filter bleibt alles", () => {
    expect(ids(keine)).toEqual(["entwurf", "gesendet", "angenommen", "abgelehnt"]);
  });

  it("Status Entwurf / Fertiggestellt", () => {
    expect(ids({ ...keine, status: ["entwurf"] })).toEqual(["entwurf"]);
    expect(ids({ ...keine, status: ["fertig"] })).toEqual(["gesendet", "angenommen", "abgelehnt"]);
    expect(ids({ ...keine, status: ["entwurf", "fertig"] })).toHaveLength(4);
  });

  it("Gruppen verknüpfen mit „und“, Einträge einer Gruppe mit „oder“", () => {
    expect(ids({ ...keine, status: ["angenommen", "abgelehnt"] })).toEqual(["angenommen", "abgelehnt"]);
    expect(ids({ ...keine, status: ["ausstehend", "gesendet"] })).toEqual(["gesendet"]);
    expect(ids({ ...keine, status: ["nicht_gesendet"] })).toEqual(["entwurf"]);
  });

  it("Zeitraum, Projekt und aktive Projekte", () => {
    expect(ids({ ...keine, von: "2026-09-01", bis: "2026-10-10" })).toEqual(["entwurf", "angenommen"]);
    expect(ids({ ...keine, projektIds: ["p2"] })).toEqual(["angenommen"]);
    expect(ids({ ...keine, nurAktiveProjekte: true })).toEqual(["entwurf", "gesendet", "angenommen"]);
  });

  it("Summe rechnet in Cent", () => {
    expect(summe([0.1, 0.2])).toBe(0.3);
    expect(summe([])).toBe(0);
  });
});
