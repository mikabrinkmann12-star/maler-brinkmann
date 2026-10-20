"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht, requireUser } from "@/lib/auth";
import { CONTAINER_NAMEN, istContainerArt } from "@/lib/container";
import { createClient } from "@/lib/supabase/server";

// Container melden: jeder aktive Nutzer; die 7-Tage-Sperre pro Art steht in der Datenbank (Trigger). Erledigt/Sperre aufheben: Büro/Admin.

export type ContainerErgebnis = { fehler?: string };

function aktualisieren() {
  revalidatePath("/heute");
  revalidatePath("/buero");
  revalidatePath("/buero/container");
}

export async function containerMelden(art: unknown): Promise<ContainerErgebnis> {
  const nutzer = await requireUser();
  if (!istContainerArt(art)) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { error } = await supabase.from("container_requests").insert({ art, ausgeloest_von: nutzer.id });
  if (error) {
    if (error.code === "P0001") return { fehler: error.message };
    return { fehler: `Der ${CONTAINER_NAMEN[art]} konnte nicht gemeldet werden. Bitte nochmal versuchen.` };
  }
  aktualisieren();
  return {};
}

const bueroSchema = z.object({ id: z.uuid(), notiz: z.string().trim().max(300, "Die Notiz ist zu lang (höchstens 300 Zeichen).").default("") });

/** Büro/Admin: Meldung ist erledigt (z. B. bestellt). Die Sperre läuft trotzdem weiter. */
export async function containerErledigt(eingabe: unknown): Promise<ContainerErgebnis> {
  await requireBueroRecht("container_verwalten");
  const p = bueroSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("container_requests")
    .update({ erledigt_am: new Date().toISOString(), notiz: p.data.notiz || null })
    .eq("id", p.data.id)
    .is("erledigt_am", null)
    .select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt (vielleicht ist es schon erledigt)." };
  aktualisieren();
  return {};
}

/** Büro/Admin: Sperre vorzeitig aufheben, dann kann die Art sofort wieder gemeldet werden. */
export async function containerSperreAufheben(id: unknown): Promise<ContainerErgebnis> {
  await requireBueroRecht("container_verwalten");
  if (!z.uuid().safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("container_requests")
    .update({ freigegeben_am: new Date().toISOString() })
    .eq("id", id as string)
    .is("freigegeben_am", null)
    .select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt." };
  aktualisieren();
  return {};
}
