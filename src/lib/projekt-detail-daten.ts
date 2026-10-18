import "server-only";
import { anzeigeStatus, offenerBetrag, type RechnungZeile } from "@/lib/rechnung-liste";
import { heuteIso } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";

// Zahlen für die Kacheln der Büro-Projektseite. Nur mit den Rechten des eingeloggten Büro-Nutzers (RLS).

export type ProjektZahlen = {
  rechnungen: { anzahl: number; offenBrutto: number };
  stunden: number;
  fotos: number;
  dateien: number;
  notizen: number;
  berichte: number;
  aufmassZeilen: number;
  materialOffen: number;
};

const zaehle = async (abfrage: PromiseLike<{ count: number | null }>) => (await abfrage).count ?? 0;

export async function projektZahlenLaden(projektId: string): Promise<ProjektZahlen> {
  const supabase = await createClient();
  const kopf = { count: "exact", head: true } as const;
  const [rechnungen, zeiten, fotos, dateien, notizen, berichte, aufmass, material] = await Promise.all([
    supabase
      .from("invoices")
      .select("status, lexware_status, rechnungsdatum, zahlungsziel_tage, brutto, mahnstufe")
      .eq("project_id", projektId)
      .is("archiviert_am", null),
    supabase.from("time_entries").select("stunden").eq("project_id", projektId).is("archiviert_am", null).limit(5000),
    zaehle(supabase.from("project_photos").select("id", kopf).eq("project_id", projektId).is("archiviert_am", null)),
    zaehle(supabase.from("project_files").select("id", kopf).eq("project_id", projektId).is("archiviert_am", null)),
    zaehle(supabase.from("project_notes").select("id", kopf).eq("project_id", projektId).is("archiviert_am", null)),
    zaehle(supabase.from("project_reports").select("id", kopf).eq("project_id", projektId).is("archiviert_am", null)),
    zaehle(supabase.from("measurements").select("id", kopf).eq("project_id", projektId).is("archiviert_am", null)),
    zaehle(supabase.from("material_usage").select("id", kopf).eq("project_id", projektId).is("archiviert_am", null).is("erledigt_am", null)),
  ]);

  const heute = heuteIso();
  const offeneRechnungen = (rechnungen.data ?? []).map((r) => {
    const anzeige = anzeigeStatus(
      { status: r.status as RechnungZeile["status"], lexwareStatus: r.lexware_status ?? "", rechnungsdatum: r.rechnungsdatum ?? heute, zahlungszielTage: r.zahlungsziel_tage, mahnstufe: r.mahnstufe },
      heute,
    );
    return offenerBetrag({ brutto: Number(r.brutto ?? 0) }, anzeige);
  });

  return {
    rechnungen: { anzahl: rechnungen.data?.length ?? 0, offenBrutto: Math.round(offeneRechnungen.reduce((s, x) => s + x * 100, 0)) / 100 },
    stunden: (zeiten.data ?? []).reduce((s, z) => s + Number(z.stunden ?? 0), 0),
    fotos,
    dateien,
    notizen,
    berichte,
    aufmassZeilen: aufmass,
    materialOffen: material,
  };
}
