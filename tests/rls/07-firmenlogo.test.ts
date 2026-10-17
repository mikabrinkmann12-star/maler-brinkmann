// Firmenlogo (Bucket „firmenlogo“): nur der Admin lädt hoch und löscht, Büro und Admin lesen, sonst niemand.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa7, 0x35, 0x81, 0x84, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const pfad = `logo-test-${randomBytes(4).toString("hex")}.png`;
let admin: TestNutzer, buero: TestNutzer, maler: TestNutzer;
let adminC: SupabaseClient, bueroC: SupabaseClient, malerC: SupabaseClient;

beforeAll(async () => {
  [admin, buero, maler] = await Promise.all([testNutzerAnlegen("admin"), testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [adminC, bueroC, malerC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(maler.benutzername, maler.passwort),
  ]);
});

afterAll(async () => {
  await adminClient().storage.from("firmenlogo").remove([pfad, `${pfad}.buero`, `${pfad}.maler`]);
  await Promise.all([admin, buero, maler].map(testNutzerLoeschen));
});

describe("Firmenlogo", () => {
  it("nur der Admin lädt hoch", async () => {
    expect((await malerC.storage.from("firmenlogo").upload(`${pfad}.maler`, png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await bueroC.storage.from("firmenlogo").upload(`${pfad}.buero`, png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await anonClient().storage.from("firmenlogo").upload(`${pfad}.anon`, png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await adminC.storage.from("firmenlogo").upload(pfad, png, { contentType: "image/png" })).error).toBeNull();
  });

  it("nur Dateien vom Typ PNG/JPEG sind erlaubt", async () => {
    const r = await adminC.storage.from("firmenlogo").upload(`${pfad}.txt`, new Uint8Array([1, 2, 3]), { contentType: "text/plain" });
    expect(r.error).not.toBeNull();
  });

  it("Büro und Admin lesen, Mitarbeiter und Fremde nicht", async () => {
    expect((await bueroC.storage.from("firmenlogo").download(pfad)).error).toBeNull();
    expect((await adminC.storage.from("firmenlogo").download(pfad)).error).toBeNull();
    expect((await malerC.storage.from("firmenlogo").download(pfad)).error).not.toBeNull();
    expect((await anonClient().storage.from("firmenlogo").download(pfad)).error).not.toBeNull();
  });

  it("nur der Admin löscht", async () => {
    await bueroC.storage.from("firmenlogo").remove([pfad]);
    expect((await adminClient().storage.from("firmenlogo").download(pfad)).error).toBeNull(); // Büro konnte nicht löschen
    await adminC.storage.from("firmenlogo").remove([pfad]);
    expect((await adminClient().storage.from("firmenlogo").download(pfad)).error).not.toBeNull();
  });
});
