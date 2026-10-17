import "server-only";
import { angebotBerechnen, type AngebotStatus, type Baustein, type BausteinTyp } from "@/lib/angebot";
import { adresseText, kontaktName } from "@/lib/projekt";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

// Abfragen für Angebote (nur Büro/Admin, die Datenbank erzwingt es per RLS).
// Wer sie aufruft, hat vorher requireRole(BUERO_ROLLEN) geprüft.

export type AngebotKopf = {
  id: string;
  projectId: string;
  status: AngebotStatus;
  betreff: string;
  leistungsort: string;
  datum: string;
  empfaenger: string;
  einleitung: string;
  schlusstext: string;
  steuersatz: number;
  reverseCharge: boolean;
  rabattProzent: number;
  archiviert: boolean;
  versendetAm: string | null;
  versendetAn: string;
  zahlungszielTage: number | null;
  skontoProzent: number | null;
  skontoTage: number | null;
  gueltigBis: string | null;
};

export type AngebotProjekt = {
  id: string;
  name: string;
  projektnummer: string;
  adresse: string;
  archiviert: boolean;
};

export type AngebotKunde = {
  id: string;
  kundennummer: string;
  name: string;
  email: string;
};

export type AngebotDetail = {
  angebot: AngebotKopf;
  bausteine: Baustein[];
  projekt: AngebotProjekt;
  kunde: AngebotKunde | null;
};

type ItemZeile = {
  id: string;
  typ: BausteinTyp;
  kurztext: string | null;
  langtext: string | null;
  menge: number | string | null;
  einheit: string | null;
  einzelpreis: number | string | null;
  bild_pfad: string | null;
  material_id?: string | null;
};

export function bausteinAusZeile(z: ItemZeile): Baustein {
  return {
    id: z.id,
    typ: z.typ,
    kurztext: z.kurztext ?? "",
    langtext: z.langtext ?? "",
    menge: z.menge == null ? null : Number(z.menge),
    einheit: z.einheit ?? "",
    einzelpreis: z.einzelpreis == null ? null : Number(z.einzelpreis),
    bildPfad: z.bild_pfad,
    materialId: z.material_id ?? null,
  };
}

/** Ein Angebot mit allen Bausteinen, Projekt und Kunde. null = gibt es nicht (oder keine Rechte). */
export async function angebotLaden(id: string): Promise<AngebotDetail | null> {
  const supabase = await createClient();
  const { data: q, error } = await supabase
    .from("quotes")
    .select(
      "id, project_id, status, betreff, leistungsort, datum, empfaenger, einleitung, schlusstext, steuersatz, reverse_charge, rabatt_prozent, archiviert_am, versendet_am, versendet_an, zahlungsziel_tage, skonto_prozent, skonto_tage, gueltig_bis, projects(id, name, projektnummer, baustelle_strasse, baustelle_plz, baustelle_ort, archiviert_am, contacts(id, kundennummer, typ, firmenname, vorname, nachname, email))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Das Angebot konnte nicht geladen werden.");
  if (!q) return null;

  const { data: items, error: itemsFehler } = await supabase
    .from("quote_items")
    .select("id, typ, kurztext, langtext, menge, einheit, einzelpreis, bild_pfad, material_id")
    .eq("quote_id", id)
    .order("sortierung")
    .order("created_at")
    .limit(2000);
  if (itemsFehler) throw new Error("Die Bausteine konnten nicht geladen werden.");

  const p = q.projects;
  const k = p?.contacts;
  return {
    angebot: {
      id: q.id,
      projectId: q.project_id,
      status: q.status,
      betreff: q.betreff,
      leistungsort: q.leistungsort ?? "",
      datum: q.datum,
      empfaenger: q.empfaenger ?? "",
      einleitung: q.einleitung ?? "",
      schlusstext: q.schlusstext ?? "",
      steuersatz: Number(q.steuersatz),
      reverseCharge: q.reverse_charge,
      rabattProzent: Number(q.rabatt_prozent),
      archiviert: q.archiviert_am != null,
      versendetAm: q.versendet_am,
      versendetAn: q.versendet_an ?? "",
      zahlungszielTage: q.zahlungsziel_tage,
      skontoProzent: q.skonto_prozent == null ? null : Number(q.skonto_prozent),
      skontoTage: q.skonto_tage,
      gueltigBis: q.gueltig_bis,
    },
    bausteine: items.map(bausteinAusZeile),
    projekt: {
      id: q.project_id,
      name: p?.name ?? "",
      projektnummer: p?.projektnummer ?? "",
      adresse: p ? adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }) : "",
      archiviert: p?.archiviert_am != null,
    },
    kunde: k ? { id: k.id, kundennummer: k.kundennummer ?? "", name: kontaktName(k), email: k.email ?? "" } : null,
  };
}

export type AngebotListenZeile = {
  id: string;
  betreff: string;
  datum: string;
  status: AngebotStatus;
  netto: number;
  archiviert: boolean;
  projektId: string;
  projektName: string;
  projektnummer: string;
  kunde: string;
};

export const MAX_ANGEBOTE = 300;

/** Angebotsliste (neueste zuerst). Suche über Betreff, Projekt, Projektnummer und Kunde. */
export async function angeboteLaden(opts: {
  q?: string;
  status?: AngebotStatus | "";
  archiv?: boolean;
  projektId?: string;
}): Promise<{ zeilen: AngebotListenZeile[]; gesamt: number }> {
  const supabase = await createClient();
  let abfrage = supabase
    .from("quotes")
    .select(
      "id, project_id, betreff, datum, status, steuersatz, reverse_charge, rabatt_prozent, archiviert_am, created_at, projects(name, projektnummer, contacts(firmenname, vorname, nachname)), quote_items(typ, menge, einzelpreis)",
    );
  abfrage = opts.archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
  if (opts.status) abfrage = abfrage.eq("status", opts.status);
  if (opts.projektId) abfrage = abfrage.eq("project_id", opts.projektId);
  const { data, error } = await abfrage.order("datum", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error("Die Angebote konnten nicht geladen werden.");

  const zeilen: AngebotListenZeile[] = data.map((q) => {
    const posten: Baustein[] = (q.quote_items ?? []).map((i, n) => ({
      id: String(n), typ: i.typ, kurztext: "", langtext: "", menge: i.menge == null ? null : Number(i.menge),
      einheit: "", einzelpreis: i.einzelpreis == null ? null : Number(i.einzelpreis), bildPfad: null,
    }));
    const rechnung = angebotBerechnen(posten, {
      rabattProzent: Number(q.rabatt_prozent), steuersatz: Number(q.steuersatz), reverseCharge: q.reverse_charge,
    });
    return {
      id: q.id,
      betreff: q.betreff,
      datum: q.datum,
      status: q.status,
      netto: rechnung.nettoNachRabatt,
      archiviert: q.archiviert_am != null,
      projektId: q.project_id,
      projektName: q.projects?.name ?? "",
      projektnummer: q.projects?.projektnummer ?? "",
      kunde: kontaktName(q.projects?.contacts),
    };
  });

  const suche = suchtext(opts.q ?? "").toLowerCase();
  const gefiltert = suche
    ? zeilen.filter((z) => [z.betreff, z.projektName, z.projektnummer, z.kunde].some((t) => t.toLowerCase().includes(suche)))
    : zeilen;
  return { zeilen: gefiltert.slice(0, MAX_ANGEBOTE), gesamt: gefiltert.length };
}

/** Projekte, für die man ein Angebot anlegen kann (nicht archiviert), mit Kunde. */
export async function projekteFuerAngebot(): Promise<{ id: string; label: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, projektnummer, contacts(firmenname, vorname, nachname)")
    .is("archiviert_am", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Die Projekte konnten nicht geladen werden.");
  return data.map((p) => ({
    id: p.id,
    label: [p.projektnummer, p.name, kontaktName(p.contacts)].filter(Boolean).join(" · "),
  }));
}
