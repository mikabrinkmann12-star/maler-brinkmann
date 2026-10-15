// Wer darf welche Datenbank-Funktion aufrufen?
// Admin-Funktionen nur der Server (Secret Key), Hilfsfunktionen nur Eingeloggte.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  einloggen,
  testNutzerAnlegen,
  testNutzerLoeschen,
  type TestNutzer,
} from "./hilfen";

let maler: TestNutzer;
let malerClient: SupabaseClient;

beforeAll(async () => {
  maler = await testNutzerAnlegen("mitarbeiter");
  malerClient = await einloggen(maler.benutzername, maler.passwort);
});

afterAll(async () => {
  await testNutzerLoeschen(maler);
});

describe("nutzer_sessions_beenden()", () => {
  it("darf ohne Login nicht aufgerufen werden", async () => {
    const { error } = await anonClient().rpc("nutzer_sessions_beenden", {
      p_user_id: maler.id,
    });
    expect(error).not.toBeNull();
  });

  it("darf von einem eingeloggten Nutzer nicht aufgerufen werden", async () => {
    const { error } = await malerClient.rpc("nutzer_sessions_beenden", {
      p_user_id: maler.id,
    });
    expect(error).not.toBeNull();
  });

  it("beendet als Server alle Sessions: Token-Erneuerung schlägt danach fehl", async () => {
    const { error } = await adminClient().rpc("nutzer_sessions_beenden", {
      p_user_id: maler.id,
    });
    expect(error).toBeNull();

    const { error: refreshFehler } = await malerClient.auth.refreshSession();
    expect(refreshFehler).not.toBeNull();
  });
});

describe("RLS-Hilfsfunktionen", () => {
  it("sind ohne Login nicht aufrufbar", async () => {
    const { error } = await anonClient().rpc("ist_admin");
    expect(error).not.toBeNull();
  });

  it("liefern für einen Maler false", async () => {
    const client = await einloggen(maler.benutzername, maler.passwort);
    const admin = await client.rpc("ist_admin");
    const buero = await client.rpc("ist_buero_oder_admin");
    expect(admin).toMatchObject({ error: null, data: false });
    expect(buero).toMatchObject({ error: null, data: false });
  });
});
