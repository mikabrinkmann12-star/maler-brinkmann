// Kundenkonto (Debitor) je Kontakt: neue Kontakte bekommen automatisch die nächste freie Nummer, Nummern sind eindeutig und liegen
// zwischen 10000 und 69999. Wegwerf-Kontakte (TEST-…), werden wieder gelöscht.
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { adminClient } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
const ids: string[] = [];
const db = () => adminClient();

afterAll(async () => {
  if (ids.length) await db().from("contacts").delete().in("id", ids);
});

describe("Kundenkonto (Debitor)", () => {
  it("vergibt automatisch die nächste freie Nummer", async () => {
    const { data: max } = await db().from("contacts").select("debitorennummer").not("debitorennummer", "is", null).order("debitorennummer", { ascending: false }).limit(1);
    const a = await db().from("contacts").insert({ typ: "privat", nachname: `${kennung} A`, kundennummer: `${kennung}-A` }).select("id, debitorennummer").single();
    const b = await db().from("contacts").insert({ typ: "privat", nachname: `${kennung} B`, kundennummer: `${kennung}-B` }).select("id, debitorennummer").single();
    ids.push(a.data!.id, b.data!.id);
    expect(a.data!.debitorennummer).toBe((max?.[0]?.debitorennummer ?? 10000) + 1);
    expect(b.data!.debitorennummer).toBe(a.data!.debitorennummer! + 1);
  });

  it("lehnt doppelte und ungültige Nummern ab", async () => {
    const { data: a } = await db().from("contacts").select("debitorennummer").eq("id", ids[0]).single();
    expect((await db().from("contacts").update({ debitorennummer: a!.debitorennummer }).eq("id", ids[1])).error?.code).toBe("23505");
    expect((await db().from("contacts").update({ debitorennummer: 9999 }).eq("id", ids[1])).error).not.toBeNull();
    expect((await db().from("contacts").update({ debitorennummer: 70000 }).eq("id", ids[1])).error).not.toBeNull();
  });
});
