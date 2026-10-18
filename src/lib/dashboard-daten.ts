import "server-only";
import { angeboteLaden } from "@/lib/angebot-daten";
import { FORDERUNGS_STANDARD, chatSumme, forderungsBereich, forderungsUebersicht, projekteNachStatus, type ForderungsZeitraum } from "@/lib/dashboard";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { kontaktName } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";

export type EinsatzHeute = { id: string; auto: string; baustellen: { id: string; name: string }[]; team: string[] };
export type ZuletztProjekt = { id: string; name: string; projektnummer: string; kunde: string; bearbeitet: string; status: { name: string; farbe: string } | null };
export type AbwesendHeute = { name: string; grund: string };

const ABWESENHEIT: Record<string, string> = {
  urlaub: "Urlaub",
  unbezahlter_urlaub: "Unbezahlter Urlaub",
  ueberstundenabbau: "Abfeiern",
};

/**
 * Zahlen für die Büro-Startseite. Alles mit den Rechten des eingeloggten Nutzers (RLS); der Aufrufer hat requireRole(BUERO_ROLLEN) geprüft.
 * Die Forderungen zeigen den Stand vom letzten Abgleich mit Lexware.
 */
export async function dashboardLaden(heute: string, forderungsZeitraum: ForderungsZeitraum = FORDERUNGS_STANDARD) {
  const supabase = await createClient();
  const [projekte, zuletzt, einsaetze, urlaubHeute, kranke, urlaubOffen, rechnungen, rechnungsEntwuerfe, versendet, angebotsEntwuerfe, chat, kollegen, eingangPruefen] = await Promise.all([
    supabase.from("projects").select("status_id, project_statuses(name, farbe, sortierung)").is("archiviert_am", null).limit(1000),
    supabase
      .from("projects")
      .select("id, name, projektnummer, updated_at, project_statuses(name, farbe), contacts(firmenname, vorname, nachname)")
      .is("archiviert_am", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("assignments")
      .select("id, vehicles(name, kennzeichen), assignment_stops(sortierung, projects(id, name)), assignment_members(user_id)")
      .eq("datum", heute),
    supabase.from("leave_requests").select("user_id, art").eq("status", "genehmigt").lte("von", heute).gte("bis", heute),
    supabase.from("time_entries").select("user_id").eq("art", "krank").eq("datum", heute).is("archiviert_am", null),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "offen"),
    supabase
      .from("invoices")
      .select("status, lexware_status, rechnungsdatum, zahlungsziel_tage, brutto, mahnstufe")
      .eq("status", "uebertragen")
      .is("archiviert_am", null)
      .limit(1000),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "entwurf").is("archiviert_am", null),
    angeboteLaden({ status: "versendet" }),
    supabase.from("quotes").select("id", { count: "exact", head: true }).eq("status", "entwurf").is("archiviert_am", null),
    supabase.rpc("chat_ungelesen"),
    kollegenLaden(),
    supabase.from("incoming_invoices").select("id", { count: "exact", head: true }).eq("zu_pruefen", true).is("archiviert_am", null),
  ]);

  const name = (uid: string) => {
    const k = kollegen.get(uid);
    return k ? `${k.vorname} ${k.nachname}`.trim() : "Ehemaliger Kollege";
  };

  const heuteImEinsatz: EinsatzHeute[] = (einsaetze.data ?? []).map((e) => ({
    id: e.id,
    auto: e.vehicles ? [e.vehicles.name, e.vehicles.kennzeichen && e.vehicles.kennzeichen !== e.vehicles.name ? e.vehicles.kennzeichen : ""].filter(Boolean).join(" · ") : "Ohne Firmenwagen",
    baustellen: [...(e.assignment_stops ?? [])]
      .sort((a, b) => a.sortierung - b.sortierung)
      .flatMap((s) => (s.projects ? [{ id: s.projects.id, name: s.projects.name }] : [])),
    team: (e.assignment_members ?? []).map((m) => name(m.user_id)).sort((a, b) => a.localeCompare(b, "de")),
  }));

  const abwesend: AbwesendHeute[] = [
    ...(urlaubHeute.data ?? []).map((l) => ({ name: name(l.user_id), grund: ABWESENHEIT[l.art] ?? "Abwesend" })),
    ...(kranke.data ?? []).map((k) => ({ name: name(k.user_id), grund: "Krank" })),
  ].sort((a, b) => a.name.localeCompare(b.name, "de"));

  const geld = forderungsUebersicht(
    (rechnungen.data ?? []).map((r) => ({
      status: r.status,
      lexwareStatus: r.lexware_status ?? "",
      rechnungsdatum: r.rechnungsdatum,
      zahlungszielTage: r.zahlungsziel_tage,
      brutto: r.brutto == null ? null : Number(r.brutto),
      mahnstufe: r.mahnstufe,
    })),
    heute,
    forderungsBereich(forderungsZeitraum, heute),
  );
  const offeneAngebote = versendet.zeilen.filter((a) => !a.archiviert);

  return {
    projekte: projekteNachStatus(projekte.data ?? []),
    zuletzt: (zuletzt.data ?? []).map((p): ZuletztProjekt => ({
      id: p.id,
      name: p.name,
      projektnummer: p.projektnummer,
      kunde: kontaktName(p.contacts),
      bearbeitet: p.updated_at,
      status: p.project_statuses ? { name: p.project_statuses.name, farbe: p.project_statuses.farbe } : null,
    })),
    heuteImEinsatz,
    abwesend,
    angebote: {
      offenAnzahl: offeneAngebote.length,
      offenNetto: Math.round(offeneAngebote.reduce((s, a) => s + a.netto * 100, 0)) / 100,
      entwuerfe: angebotsEntwuerfe.count ?? 0,
    },
    rechnungen: { forderungen: geld, entwuerfe: rechnungsEntwuerfe.count ?? 0 },
    aufgaben: { urlaubsantraege: urlaubOffen.count ?? 0, chat: chatSumme(chat.data), eingangPruefen: eingangPruefen.count ?? 0 },
  };
}
