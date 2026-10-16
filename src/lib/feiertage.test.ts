import { describe, expect, it } from "vitest";
import { feiertageImJahr, feiertagName, ostersonntag } from "./feiertage";

describe("ostersonntag", () => {
  it("stimmt mit bekannten Terminen überein", () => {
    expect(ostersonntag(2024)).toBe("2024-03-31");
    expect(ostersonntag(2025)).toBe("2025-04-20");
    expect(ostersonntag(2026)).toBe("2026-04-05");
    expect(ostersonntag(2027)).toBe("2027-03-28");
    expect(ostersonntag(2038)).toBe("2038-04-25");
  });
});

describe("Feiertage Niedersachsen", () => {
  it("2026: alle zehn Feiertage", () => {
    const f = feiertageImJahr(2026);
    expect(f.size).toBe(10);
    expect(f.get("2026-01-01")).toBe("Neujahr");
    expect(f.get("2026-04-03")).toBe("Karfreitag");
    expect(f.get("2026-04-06")).toBe("Ostermontag");
    expect(f.get("2026-05-01")).toBe("Tag der Arbeit");
    expect(f.get("2026-05-14")).toBe("Christi Himmelfahrt");
    expect(f.get("2026-05-25")).toBe("Pfingstmontag");
    expect(f.get("2026-10-03")).toBe("Tag der Deutschen Einheit");
    expect(f.get("2026-10-31")).toBe("Reformationstag");
    expect(f.get("2026-12-25")).toBe("1. Weihnachtstag");
    expect(f.get("2026-12-26")).toBe("2. Weihnachtstag");
  });

  it("gibt es in Niedersachsen nicht: Heilige Drei Könige, Fronleichnam, Allerheiligen, Buß- und Bettag", () => {
    expect(feiertagName("2026-01-06")).toBeNull();
    expect(feiertagName("2026-06-04")).toBeNull();
    expect(feiertagName("2026-11-01")).toBeNull();
    expect(feiertagName("2026-11-18")).toBeNull();
  });

  it("feiertagName: Feiertag oder null", () => {
    expect(feiertagName("2027-03-26")).toBe("Karfreitag");
    expect(feiertagName("2026-10-16")).toBeNull();
  });
});
