import { describe, expect, it } from "vitest";
import { letzteMeldung, restText, sperreBis, type ContainerMeldung } from "./container";

const m = (teil: Partial<ContainerMeldung>): ContainerMeldung => ({ id: "x", art: "papier", zeit: "2026-10-20T08:00:00Z", wer: "Max", erledigt: false, notiz: "", freigegeben: false, ...teil });
const jetzt = new Date("2026-10-22T08:00:00Z");

describe("sperreBis", () => {
  it("ohne Meldung ist frei", () => expect(sperreBis([], "papier", jetzt)).toBeNull());
  it("7 Tage ab der Meldung", () => {
    expect(sperreBis([m({})], "papier", jetzt)?.toISOString()).toBe("2026-10-27T08:00:00.000Z");
  });
  it("nach 7 Tagen wieder frei", () => {
    expect(sperreBis([m({})], "papier", new Date("2026-10-27T08:00:01Z"))).toBeNull();
  });
  it("die andere Art bleibt frei", () => {
    expect(sperreBis([m({})], "restmuell", jetzt)).toBeNull();
  });
  it("vom Büro freigegebene Meldungen sperren nicht", () => {
    expect(sperreBis([m({ freigegeben: true })], "papier", jetzt)).toBeNull();
  });
  it("die jüngste Meldung zählt", () => {
    const bis = sperreBis([m({}), m({ zeit: "2026-10-21T08:00:00Z" })], "papier", jetzt);
    expect(bis?.toISOString()).toBe("2026-10-28T08:00:00.000Z");
  });
});

describe("Texte", () => {
  it("restText", () => {
    expect(restText(new Date("2026-10-27T08:00:00Z"), jetzt)).toBe("noch 5 Tage");
    expect(restText(new Date("2026-10-22T20:00:00Z"), jetzt)).toBe("noch bis morgen");
  });
  it("letzteMeldung nimmt die jüngste nicht freigegebene", () => {
    expect(letzteMeldung([m({ id: "a" }), m({ id: "b", zeit: "2026-10-21T08:00:00Z" }), m({ id: "c", zeit: "2026-10-22T00:00:00Z", freigegeben: true })], "papier")?.id).toBe("b");
    expect(letzteMeldung([], "papier")).toBeNull();
  });
});
