// Erster Test aus dem Plan: Akzeptiert Supabase die interne Fake-Adresse
// (<benutzername>@login.maler-brinkmann.de) mit email_confirm, und klappt
// der Login damit?
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { nutzerAnlegen } from "@/lib/nutzer";
import { adminClient, einloggen, loginDomain } from "./hilfen";

const benutzername = `test-${randomBytes(4).toString("hex")}`;
const passwort = `Test-${randomBytes(12).toString("hex")}`;
let userId: string | undefined;

describe("Login mit interner Adresse", () => {
  afterAll(async () => {
    if (userId) await adminClient().auth.admin.deleteUser(userId);
  });

  it("legt einen Nutzer mit Fake-Adresse und email_confirm an", async () => {
    userId = await nutzerAnlegen(adminClient(), loginDomain(), {
      benutzername,
      vorname: "Test",
      nachname: "Login",
      rolle: "mitarbeiter",
      passwort,
      mussPasswortAendern: false,
    });

    const { data, error } = await adminClient().auth.admin.getUserById(userId);
    expect(error).toBeNull();
    expect(data.user?.email).toBe(`${benutzername}@${loginDomain()}`);
    expect(data.user?.email_confirmed_at).toBeTruthy();
  });

  it("hat das Profil mit den Daten vom Server", async () => {
    const { data, error } = await adminClient()
      .from("profiles")
      .select("benutzername, vorname, nachname, rolle, aktiv, muss_passwort_aendern")
      .eq("id", userId!)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      benutzername,
      vorname: "Test",
      nachname: "Login",
      rolle: "mitarbeiter",
      aktiv: true,
      muss_passwort_aendern: false,
    });
  });

  it("kann sich mit Benutzername + Passwort einloggen und sieht sein Profil", async () => {
    const client = await einloggen(benutzername, passwort);
    const { data, error } = await client.from("profiles").select("benutzername");
    expect(error).toBeNull();
    expect(data).toEqual([{ benutzername }]);
  });

  it("lehnt ein falsches Passwort ab", async () => {
    await expect(einloggen(benutzername, "falsches-passwort")).rejects.toThrow();
  });
});
