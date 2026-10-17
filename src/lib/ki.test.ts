import { describe, expect, it } from "vitest";
import { KI_NICHT_AKTIV_TEXT, kiAnbieter } from "./ki";

describe("KI-Platzhalter", () => {
  it("ist nicht aktiv und liefert nur die Erklärung, keinen Vorschlag", async () => {
    const anbieter = kiAnbieter();
    expect(anbieter.aktiv).toBe(false);
    expect(await anbieter.angebotVorschlagen("Wohnzimmer 25 m² streichen")).toEqual({ aktiv: false, meldung: KI_NICHT_AKTIV_TEXT });
  });
});
