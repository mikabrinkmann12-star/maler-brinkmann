"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zahlLesen } from "@/lib/angebot";
import { requireBueroRecht } from "@/lib/auth";
import { istIsoDatum } from "@/lib/datum";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { createClient } from "@/lib/supabase/server";

// Kosten erfassen und Kostenarten zuordnen (Büro und Admin). Verbindlich regelt RLS die Rechte.

export type KostenErgebnis = { fehler?: string };

const uuid = z.uuid();
const KOSTENARTEN_ERFASSBAR = ["material", "geraete", "fremdleistung", "sonstiges"] as const;

const kostenSchema = z.object({
  id: z.uuid(),
  datum: z.string().refine(istIsoDatum, "Bitte ein Datum angeben."),
  kostenart: z.enum(KOSTENARTEN_ERFASSBAR, { error: "Bitte eine Kostenart wählen." }),
  betrag: z.string().transform((t, ctx) => {
    const w = zahlLesen(t, 2);
    if (w === null || w < 0 || w > 9_999_999.99) {
      ctx.addIssue({ code: "custom", message: "Bitte einen Betrag in Euro angeben, z. B. 120,50." });
      return z.NEVER;
    }
    return w;
  }),
  beschreibung: z.string().trim().max(300, "Die Beschreibung ist zu lang (höchstens 300 Zeichen)."),
});

function aktualisieren(projektId: string) {
  revalidatePath(`/buero/projekte/${projektId}/nachkalkulation`);
  revalidatePath(`/buero/projekte/${projektId}`);
}

/** Kosten zum Projekt erfassen („Kosten erfassen“). Idempotent: die ID kommt vom Formular, ein zweites Senden legt nichts doppelt an. */
export async function kostenErfassen(projektId: string, eingabe: unknown): Promise<KostenErgebnis> {
  await requireBueroRecht("projekte_bearbeiten");
  if (!uuid.safeParse(projektId).success) return { fehler: "Ungültiges Projekt." };
  const p = kostenSchema.safeParse(eingabe);
  if (!p.success) return { fehler: ersteMeldung(p.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_costs")
    .upsert({ id: p.data.id, project_id: projektId, datum: p.data.datum, kostenart: p.data.kostenart, betrag: p.data.betrag, beschreibung: p.data.beschreibung }, { onConflict: "id", ignoreDuplicates: true });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  aktualisieren(projektId);
  return {};
}

/** Erfasste Kosten entfernen (archivieren, nichts wird gelöscht). */
export async function kostenArchivieren(projektId: string, id: string): Promise<KostenErgebnis> {
  await requireBueroRecht("projekte_bearbeiten");
  if (!uuid.safeParse(projektId).success || !uuid.safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_costs").update({ archiviert_am: new Date().toISOString() }).eq("id", id).eq("project_id", projektId).select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt." };
  aktualisieren(projektId);
  return {};
}

/** Kostenart einer dem Projekt zugewiesenen Eingangsrechnung ändern. */
export async function eingangsrechnungKostenart(projektId: string, id: string, kostenart: string): Promise<KostenErgebnis> {
  await requireBueroRecht("eingangsrechnungen");
  if (!uuid.safeParse(projektId).success || !uuid.safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const art = z.enum(KOSTENARTEN_ERFASSBAR).safeParse(kostenart);
  if (!art.success) return { fehler: "Bitte eine Kostenart wählen." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("incoming_invoices").update({ kostenart: art.data }).eq("id", id).eq("project_id", projektId).select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt." };
  aktualisieren(projektId);
  return {};
}
