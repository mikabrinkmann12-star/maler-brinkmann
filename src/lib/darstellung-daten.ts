import "server-only";
import { LEERE_DARSTELLUNG, darstellungPruefen, wirksameDarstellung, type Darstellung } from "@/lib/darstellung";
import { createClient } from "@/lib/supabase/server";

/** Darstellung des eingeloggten Nutzers: eigene Werte, Vorgabe der Firma und was davon gilt. Wer das aufruft, hat requireUser() geprüft. */
export async function darstellungLaden(): Promise<{ eigene: Darstellung; firma: Darstellung; wirksam: ReturnType<typeof wirksameDarstellung> }> {
  const supabase = await createClient();
  const [{ data: zeile }, { data: vorgabe }] = await Promise.all([
    supabase.from("nutzer_darstellung").select("akzent, reihenfolge, ausgeblendet").maybeSingle(),
    supabase.from("app_settings").select("wert").eq("schluessel", "darstellung").maybeSingle(),
  ]);
  const eigene = zeile ? darstellungPruefen(zeile) : LEERE_DARSTELLUNG;
  const firma = vorgabe ? darstellungPruefen(vorgabe.wert) : LEERE_DARSTELLUNG;
  return { eigene, firma, wirksam: wirksameDarstellung(eigene, firma) };
}
