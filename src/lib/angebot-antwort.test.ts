import { describe, expect, it } from "vitest";
import { antwortMoeglich, antwortSchema } from "./angebot-antwort";

describe("Angebot online beantworten", () => {
  it("nur versendet, nicht abgelaufen, nur einmal", () => {
    const heute = "2026-11-13";
    expect(antwortMoeglich({ status: "versendet", gueltigBis: "2026-11-13", schonGeantwortet: false }, heute)).toEqual({ ok: true });
    expect(antwortMoeglich({ status: "versendet", gueltigBis: null, schonGeantwortet: false }, heute).ok).toBe(true);
    expect(antwortMoeglich({ status: "versendet", gueltigBis: "2026-11-12", schonGeantwortet: false }, heute).ok).toBe(false);
    expect(antwortMoeglich({ status: "entwurf", gueltigBis: null, schonGeantwortet: false }, heute).ok).toBe(false);
    expect(antwortMoeglich({ status: "versendet", gueltigBis: null, schonGeantwortet: true }, heute).ok).toBe(false);
    expect(antwortMoeglich({ status: "angenommen", gueltigBis: null, schonGeantwortet: false }, heute).ok).toBe(false);
  });

  it("Annahme braucht Namen und Häkchen, Ablehnung nicht", () => {
    expect(antwortSchema.safeParse({ antwort: "angenommen", name: "Anna", bestaetigt: true }).success).toBe(true);
    expect(antwortSchema.safeParse({ antwort: "angenommen", name: "Anna", bestaetigt: false }).success).toBe(false);
    expect(antwortSchema.safeParse({ antwort: "angenommen", name: "", bestaetigt: true }).success).toBe(false);
    expect(antwortSchema.safeParse({ antwort: "abgelehnt" }).success).toBe(true);
    expect(antwortSchema.safeParse({ antwort: "vielleicht" }).success).toBe(false);
  });
});
