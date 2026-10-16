import { describe, expect, it } from "vitest";
import { terminSchema } from "./termin-schema";

const ID = "11111111-1111-4111-8111-111111111111";

describe("terminSchema", () => {
  it("nimmt einen einfachen Termin an, leere Felder bekommen Standardwerte", () => {
    const t = terminSchema.parse({ id: ID, datum: "2026-10-20", titel: "  Zu von Garrel " });
    expect(t).toMatchObject({ titel: "Zu von Garrel", zeit: "", ort: "", projectId: null, personIds: [] });
  });

  it("verlangt Titel und gültiges Datum, Uhrzeit nur im Format HH:MM", () => {
    expect(terminSchema.safeParse({ id: ID, datum: "2026-10-20", titel: " " }).success).toBe(false);
    expect(terminSchema.safeParse({ id: ID, datum: "20.10.2026", titel: "x" }).success).toBe(false);
    expect(terminSchema.safeParse({ id: ID, datum: "2026-10-20", titel: "x", zeit: "8 Uhr" }).success).toBe(false);
    expect(terminSchema.safeParse({ id: ID, datum: "2026-10-20", titel: "x", zeit: "08:30" }).success).toBe(true);
  });
});
