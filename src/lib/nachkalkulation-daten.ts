import "server-only";
import { angebotBerechnen } from "@/lib/angebot";
import { angebotLaden } from "@/lib/angebot-daten";
import { STANDARD_EINSTELLUNGEN, kalkulationAusJson, type KalkulationEinstellungen } from "@/lib/kalkulation";
import { kalkulationLaden } from "@/lib/kalkulation-daten";
import { ergebnisBerechnen, istBerechnen, sollBerechnen, type Ergebnis, type Ist, type Soll } from "@/lib/nachkalkulation";
import { createClient } from "@/lib/supabase/server";

// Zahlen für die Nachkalkulation eines Projekts. Nur mit den Rechten des eingeloggten Büro-Nutzers (RLS).
// Wer das aufruft, hat vorher requireBueroRecht("projekte_ansehen") geprüft.

export type Nachkalkulation = {
  /** Angebot, auf dem das Soll beruht (angenommen vor versendet vor Entwurf, jeweils das neueste); null = kein Angebot */
  angebot: { id: string; betreff: string; status: string; datum: string } | null;
  soll: Soll;
  ist: Ist;
  ergebnis: Ergebnis;
  /** Die Kalkulation (Lohnkosten) konnte nicht gelesen werden, es gelten Startwerte */
  einstellungenFehlen: boolean;
  kosten: { id: string; datum: string; kostenart: string; betrag: number; beschreibung: string }[];
  eingangsrechnungen: { id: string; lieferant: string; rechnungsnummer: string; netto: number; kostenart: string }[];
};

const STATUS_VORRANG: Record<string, number> = { angenommen: 0, versendet: 1, entwurf: 2 };

export async function nachkalkulationLaden(projektId: string): Promise<Nachkalkulation> {
  const supabase = await createClient();

  let einst: KalkulationEinstellungen = STANDARD_EINSTELLUNGEN;
  let einstellungenFehlen = false;
  try {
    einst = await kalkulationLaden();
  } catch {
    einstellungenFehlen = true;
  }

  const [angebote, zeiten, kosten, rechnungen] = await Promise.all([
    supabase.from("quotes").select("id, betreff, status, datum, created_at").eq("project_id", projektId).is("archiviert_am", null).neq("status", "abgelehnt").limit(200),
    supabase.from("time_entries").select("art, stunden").eq("project_id", projektId).is("archiviert_am", null).limit(5000),
    supabase.from("project_costs").select("id, datum, kostenart, betrag, beschreibung").eq("project_id", projektId).is("archiviert_am", null).order("datum", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("incoming_invoices").select("id, lieferant, rechnungsnummer, netto, kostenart").eq("project_id", projektId).is("archiviert_am", null).limit(500),
  ]);
  if (angebote.error || zeiten.error || kosten.error || rechnungen.error) throw new Error("Die Nachkalkulation konnte nicht geladen werden.");

  const gewaehlt = [...(angebote.data ?? [])].sort(
    (a, b) => (STATUS_VORRANG[a.status] ?? 9) - (STATUS_VORRANG[b.status] ?? 9) || (b.datum ?? "").localeCompare(a.datum ?? "") || b.created_at.localeCompare(a.created_at),
  )[0];

  let erlos = 0;
  let positionen: { menge: number; kalkulation: ReturnType<typeof kalkulationAusJson> }[] = [];
  if (gewaehlt) {
    const detail = await angebotLaden(gewaehlt.id);
    if (detail) {
      const rechnung = angebotBerechnen(detail.bausteine, { rabattProzent: detail.angebot.rabattProzent, steuersatz: detail.angebot.steuersatz, reverseCharge: detail.angebot.reverseCharge });
      erlos = rechnung.nettoNachRabatt;
      const { data: quellen } = await supabase.from("quote_items").select("id, typ, menge, service_id, services(kalkulation)").eq("quote_id", gewaehlt.id).eq("typ", "position").limit(2000);
      positionen = (quellen ?? []).map((q) => ({ menge: Number(q.menge ?? 0), kalkulation: q.service_id ? kalkulationAusJson(q.services?.kalkulation) : null }));
    }
  }

  const soll = sollBerechnen(positionen, einst);
  const ist = istBerechnen(
    {
      zeiten: (zeiten.data ?? []).map((z) => ({ art: z.art, stunden: Number(z.stunden ?? 0) })),
      kosten: (kosten.data ?? []).map((k) => ({ kostenart: k.kostenart, betrag: Number(k.betrag) })),
      eingangsrechnungen: (rechnungen.data ?? []).map((r) => ({ kostenart: r.kostenart, netto: Number(r.netto ?? 0) })),
    },
    einst,
  );

  return {
    angebot: gewaehlt ? { id: gewaehlt.id, betreff: gewaehlt.betreff, status: gewaehlt.status, datum: gewaehlt.datum } : null,
    soll,
    ist,
    ergebnis: ergebnisBerechnen(erlos, soll, ist),
    einstellungenFehlen,
    kosten: (kosten.data ?? []).map((k) => ({ id: k.id, datum: k.datum, kostenart: k.kostenart, betrag: Number(k.betrag), beschreibung: k.beschreibung })),
    eingangsrechnungen: (rechnungen.data ?? []).map((r) => ({ id: r.id, lieferant: r.lieferant, rechnungsnummer: r.rechnungsnummer ?? "", netto: Number(r.netto ?? 0), kostenart: r.kostenart })),
  };
}
