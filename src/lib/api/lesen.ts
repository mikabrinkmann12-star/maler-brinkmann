import "server-only";
import { istUuid } from "./router";
import { ApiFehler, type ApiKontext, type ApiRoute } from "./typen";
import { CONTAINER_ARTEN, CONTAINER_NAMEN, sperreBis, type ContainerMeldung } from "@/lib/container";
import { heuteIso } from "@/lib/datum";
import { kontaktName } from "@/lib/projekt";
import { urlaubskonto } from "@/lib/urlaub";
import { istTag } from "@/lib/zeitraum";

// Lesende Endpunkte. Jeder Handler fragt feste Spalten mit festem Limit ab (kein freier Zugriff auf Tabellen).

const LIMIT = 100;

/** Suchtext für PostgREST-Filter entschärfen (keine Sonderzeichen der Filtersprache). */
function suche(roh: string | null): string {
  return (roh ?? "").replace(/[^\p{L}\p{N} .\-@/]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

function begrenzung(c: ApiKontext, standard = 50): number {
  const n = Number(c.query.get("limit") ?? standard);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, LIMIT) : standard;
}

function uuidParam(c: ApiKontext, name: string): string {
  const w = c.params[name] ?? c.query.get(name);
  if (!istUuid(w)) throw new ApiFehler(400, `„${name}“ ist keine gültige ID.`);
  return w;
}

function tagParam(c: ApiKontext, name: string): string | null {
  const w = c.query.get(name);
  if (w === null || w === "") return null;
  if (!istTag(w)) throw new ApiFehler(400, `„${name}“ muss ein Datum im Format JJJJ-MM-TT sein.`);
  return w;
}

const name = (p: { vorname: string; nachname: string } | null | undefined) => (p ? `${p.vorname} ${p.nachname}`.trim() : "");

export const leseRouten: ApiRoute[] = [
  {
    methode: "GET",
    pfad: "uebersicht",
    scope: "lesen",
    titel: "Kennzahlen: offene Angebote, Rechnungsentwürfe, Eingangsrechnungen zu prüfen, offene Urlaubsanträge, gemeldete Container, Projekte nach Status.",
    handler: async ({ db }) => {
      const kopf = { count: "exact", head: true } as const;
      const [angebote, entwuerfeA, entwuerfeR, eingang, urlaub, container, projekte] = await Promise.all([
        db.from("quotes").select("id", kopf).eq("status", "versendet").is("archiviert_am", null),
        db.from("quotes").select("id", kopf).eq("status", "entwurf").is("archiviert_am", null),
        db.from("invoices").select("id", kopf).eq("status", "entwurf").is("archiviert_am", null),
        db.from("incoming_invoices").select("id", kopf).eq("zu_pruefen", true).is("archiviert_am", null),
        db.from("leave_requests").select("id", kopf).eq("status", "offen"),
        db.from("container_requests").select("id", kopf).is("erledigt_am", null),
        db.from("projects").select("project_statuses(name)").is("archiviert_am", null).limit(2000),
      ]);
      const nachStatus: Record<string, number> = {};
      for (const p of projekte.data ?? []) {
        const n = p.project_statuses?.name ?? "Ohne Status";
        nachStatus[n] = (nachStatus[n] ?? 0) + 1;
      }
      return {
        angebote_versendet: angebote.count ?? 0,
        angebote_entwuerfe: entwuerfeA.count ?? 0,
        rechnungs_entwuerfe: entwuerfeR.count ?? 0,
        eingangsrechnungen_zu_pruefen: eingang.count ?? 0,
        urlaubsantraege_offen: urlaub.count ?? 0,
        container_gemeldet_offen: container.count ?? 0,
        projekte_nach_status: nachStatus,
      };
    },
  },
  {
    methode: "GET",
    pfad: "projekte",
    scope: "lesen",
    titel: "Projekte suchen (nach Name, Nummer, Ort, Straße).",
    parameter: "q (Suchtext), archiv=1 (nur archivierte), limit (höchstens 100)",
    handler: async (c) => {
      const q = suche(c.query.get("q"));
      let a = c.db
        .from("projects")
        .select("id, projektnummer, name, start_datum, end_datum, baustelle_strasse, baustelle_plz, baustelle_ort, archiviert_am, project_statuses(name), contacts(firmenname, vorname, nachname, kundennummer)")
        .order("updated_at", { ascending: false })
        .limit(begrenzung(c));
      a = c.query.get("archiv") === "1" ? a.not("archiviert_am", "is", null) : a.is("archiviert_am", null);
      if (q) a = a.or(`name.ilike.%${q}%,projektnummer.ilike.%${q}%,baustelle_ort.ilike.%${q}%,baustelle_strasse.ilike.%${q}%`);
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Die Projekte konnten nicht geladen werden.");
      return data.map((p) => ({
        id: p.id,
        projektnummer: p.projektnummer,
        name: p.name,
        status: p.project_statuses?.name ?? null,
        kunde: kontaktName(p.contacts),
        kundennummer: p.contacts?.kundennummer ?? null,
        baustelle: [p.baustelle_strasse, [p.baustelle_plz, p.baustelle_ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        start: p.start_datum,
        ende: p.end_datum,
        archiviert: p.archiviert_am !== null,
      }));
    },
  },
  {
    methode: "GET",
    pfad: "projekte/:id",
    scope: "lesen",
    titel: "Ein Projekt mit Kunde, Team, Angeboten und Rechnungen.",
    handler: async (c) => {
      const id = uuidParam(c, "id");
      const { data: p } = await c.db
        .from("projects")
        .select("id, projektnummer, name, beschreibung, start_datum, end_datum, baustelle_strasse, baustelle_plz, baustelle_ort, archiviert_am, project_statuses(name), contacts(id, firmenname, vorname, nachname, kundennummer, telefon, mobil, email)")
        .eq("id", id)
        .maybeSingle();
      if (!p) throw new ApiFehler(404, "Projekt nicht gefunden.");
      const [team, angebote, rechnungen] = await Promise.all([
        c.db.from("project_members").select("profiles!project_members_user_id_fkey(vorname, nachname)").eq("project_id", id),
        c.db.from("quotes").select("id, betreff, status, datum").eq("project_id", id).is("archiviert_am", null).limit(50),
        c.db.from("invoices").select("id, betreff, status, rechnungsnummer, rechnungsdatum, brutto, lexware_status").eq("project_id", id).is("archiviert_am", null).limit(50),
      ]);
      return {
        id: p.id,
        projektnummer: p.projektnummer,
        name: p.name,
        beschreibung: p.beschreibung,
        status: p.project_statuses?.name ?? null,
        baustelle: [p.baustelle_strasse, [p.baustelle_plz, p.baustelle_ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        start: p.start_datum,
        ende: p.end_datum,
        archiviert: p.archiviert_am !== null,
        kunde: p.contacts ? { id: p.contacts.id, name: kontaktName(p.contacts), kundennummer: p.contacts.kundennummer, telefon: p.contacts.mobil || p.contacts.telefon, email: p.contacts.email } : null,
        team: (team.data ?? []).map((m) => name(m.profiles)).filter(Boolean),
        angebote: angebote.data ?? [],
        rechnungen: rechnungen.data ?? [],
      };
    },
  },
  {
    methode: "GET",
    pfad: "kontakte",
    scope: "lesen",
    titel: "Kontakte (Kunden, Lieferanten) suchen.",
    parameter: "q (Suchtext), limit",
    handler: async (c) => {
      const q = suche(c.query.get("q"));
      let a = c.db
        .from("contacts")
        .select("id, kundennummer, typ, firmenname, vorname, nachname, ort, plz, strasse, telefon, mobil, email")
        .is("archiviert_am", null)
        .order("updated_at", { ascending: false })
        .limit(begrenzung(c));
      if (q) a = a.or(`firmenname.ilike.%${q}%,vorname.ilike.%${q}%,nachname.ilike.%${q}%,ort.ilike.%${q}%,kundennummer.ilike.%${q}%`);
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Die Kontakte konnten nicht geladen werden.");
      return data.map((k) => ({
        id: k.id,
        kundennummer: k.kundennummer,
        typ: k.typ,
        name: kontaktName(k),
        adresse: [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        telefon: k.mobil || k.telefon,
        email: k.email,
      }));
    },
  },
  {
    methode: "GET",
    pfad: "mitarbeiter",
    scope: "lesen",
    titel: "Aktive Mitarbeiter mit Rolle und Telefonnummer.",
    handler: async ({ db }) => {
      const { data, error } = await db.from("profiles").select("id, vorname, nachname, rolle, telefon").eq("aktiv", true).order("nachname").limit(200);
      if (error) throw new ApiFehler(500, "Die Mitarbeiter konnten nicht geladen werden.");
      return data.map((p) => ({ id: p.id, name: name(p), rolle: p.rolle, telefon: p.telefon }));
    },
  },
  {
    methode: "GET",
    pfad: "zeiten",
    scope: "lesen",
    titel: "Zeiteinträge (Stunden, Art, Projekt) eines Zeitraums.",
    parameter: "person (ID), projekt (ID), von und bis (JJJJ-MM-TT, Standard: aktueller Monat), limit",
    handler: async (c) => {
      const heute = heuteIso();
      const von = tagParam(c, "von") ?? `${heute.slice(0, 8)}01`;
      const bis = tagParam(c, "bis") ?? heute;
      let a = c.db
        .from("time_entries")
        .select("id, datum, von, bis, pause_min, stunden, art, beschreibung, user_id, project_id, profiles!time_entries_user_id_fkey(vorname, nachname), projects(name, projektnummer)")
        .is("archiviert_am", null)
        .gte("datum", von)
        .lte("datum", bis)
        .order("datum", { ascending: false })
        .limit(begrenzung(c, 100));
      if (c.query.get("person")) a = a.eq("user_id", uuidParam(c, "person"));
      if (c.query.get("projekt")) a = a.eq("project_id", uuidParam(c, "projekt"));
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Die Zeiten konnten nicht geladen werden.");
      return data.map((z) => ({
        id: z.id,
        datum: z.datum,
        von: z.von,
        bis: z.bis,
        pause_min: z.pause_min,
        stunden: Number(z.stunden),
        art: z.art,
        mitarbeiter: name(z.profiles),
        projekt: z.projects ? `${z.projects.projektnummer} ${z.projects.name}`.trim() : null,
        beschreibung: z.beschreibung,
      }));
    },
  },
  {
    methode: "GET",
    pfad: "einteilung",
    scope: "lesen",
    titel: "Einteilung eines Tages: Autos, Baustellen (Stopps) und Mitarbeiter.",
    parameter: "datum (JJJJ-MM-TT, Standard heute)",
    handler: async (c) => {
      const datum = tagParam(c, "datum") ?? heuteIso();
      const { data, error } = await c.db
        .from("assignments")
        .select("id, notiz, vehicles(name, kennzeichen), assignment_stops(sortierung, zeit, zeit_art, projects(id, name, projektnummer)), assignment_members(profiles(vorname, nachname))")
        .eq("datum", datum)
        .limit(50);
      if (error) throw new ApiFehler(500, "Die Einteilung konnte nicht geladen werden.");
      return {
        datum,
        einsaetze: data.map((e) => ({
          auto: e.vehicles ? [e.vehicles.name, e.vehicles.kennzeichen].filter(Boolean).join(" · ") : "Ohne Firmenwagen",
          notiz: e.notiz,
          baustellen: [...(e.assignment_stops ?? [])]
            .sort((x, y) => x.sortierung - y.sortierung)
            .map((s) => ({ projekt_id: s.projects?.id ?? null, name: s.projects?.name ?? "", zeit: s.zeit, zeit_art: s.zeit_art })),
          mitarbeiter: (e.assignment_members ?? []).map((m) => name(m.profiles)).filter(Boolean),
        })),
      };
    },
  },
  {
    methode: "GET",
    pfad: "angebote",
    scope: "lesen",
    titel: "Angebote (Betreff, Status, Datum, Projekt).",
    parameter: "projekt (ID), status (entwurf|versendet|angenommen|abgelehnt), limit",
    handler: async (c) => {
      let a = c.db.from("quotes").select("id, betreff, status, datum, versendet_am, project_id, projects(name, projektnummer)").is("archiviert_am", null).order("created_at", { ascending: false }).limit(begrenzung(c));
      if (c.query.get("projekt")) a = a.eq("project_id", uuidParam(c, "projekt"));
      const st = c.query.get("status");
      if (st) {
        if (!["entwurf", "versendet", "angenommen", "abgelehnt"].includes(st)) throw new ApiFehler(400, "Unbekannter Status.");
        a = a.eq("status", st as "entwurf");
      }
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Die Angebote konnten nicht geladen werden.");
      return data.map((q) => ({ id: q.id, betreff: q.betreff, status: q.status, datum: q.datum, versendet_am: q.versendet_am, projekt_id: q.project_id, projekt: q.projects ? `${q.projects.projektnummer} ${q.projects.name}`.trim() : "" }));
    },
  },
  {
    methode: "GET",
    pfad: "rechnungen",
    scope: "lesen",
    titel: "Ausgangsrechnungen (Nummer, Status, Betrag).",
    parameter: "projekt (ID), limit",
    handler: async (c) => {
      let a = c.db.from("invoices").select("id, betreff, status, rechnungsnummer, rechnungsdatum, brutto, netto, lexware_status, mahnstufe, project_id").is("archiviert_am", null).order("created_at", { ascending: false }).limit(begrenzung(c));
      if (c.query.get("projekt")) a = a.eq("project_id", uuidParam(c, "projekt"));
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Die Rechnungen konnten nicht geladen werden.");
      return data.map((r) => ({ ...r, brutto: r.brutto === null ? null : Number(r.brutto), netto: r.netto === null ? null : Number(r.netto) }));
    },
  },
  {
    methode: "GET",
    pfad: "eingangsrechnungen",
    scope: "lesen",
    titel: "Eingangsrechnungen von Lieferanten.",
    parameter: "zahlstatus (offen|bezahlt), zu_pruefen=1, limit",
    handler: async (c) => {
      let a = c.db
        .from("incoming_invoices")
        .select("id, lieferant, rechnungsnummer, rechnungsdatum, faellig_am, netto, brutto, zahlstatus, zu_pruefen, bereich, projects(name, projektnummer)")
        .is("archiviert_am", null)
        .order("created_at", { ascending: false })
        .limit(begrenzung(c));
      const z = c.query.get("zahlstatus");
      if (z === "offen" || z === "bezahlt") a = a.eq("zahlstatus", z);
      if (c.query.get("zu_pruefen") === "1") a = a.eq("zu_pruefen", true);
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Die Eingangsrechnungen konnten nicht geladen werden.");
      return data.map((r) => ({
        id: r.id,
        lieferant: r.lieferant,
        rechnungsnummer: r.rechnungsnummer,
        rechnungsdatum: r.rechnungsdatum,
        faellig_am: r.faellig_am,
        netto: r.netto === null ? null : Number(r.netto),
        brutto: r.brutto === null ? null : Number(r.brutto),
        zahlstatus: r.zahlstatus,
        zu_pruefen: r.zu_pruefen,
        zuweisung: r.projects ? `${r.projects.projektnummer} ${r.projects.name}`.trim() : r.bereich,
      }));
    },
  },
  {
    methode: "GET",
    pfad: "urlaub",
    scope: "lesen",
    titel: "Urlaubs- und Abfeier-Anträge.",
    parameter: "status (offen|genehmigt|abgelehnt|zurueckgezogen), limit",
    handler: async (c) => {
      let a = c.db.from("leave_requests").select("id, von, bis, art, status, bemerkung, antwort, profiles!leave_requests_user_id_fkey(vorname, nachname)").order("von", { ascending: false }).limit(begrenzung(c));
      const st = c.query.get("status");
      if (st) {
        if (!["offen", "genehmigt", "abgelehnt", "zurueckgezogen"].includes(st)) throw new ApiFehler(400, "Unbekannter Status.");
        a = a.eq("status", st as "offen");
      }
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Die Anträge konnten nicht geladen werden.");
      return data.map((u) => ({ id: u.id, mitarbeiter: name(u.profiles), von: u.von, bis: u.bis, art: u.art, status: u.status, bemerkung: u.bemerkung, antwort: u.antwort }));
    },
  },
  {
    methode: "GET",
    pfad: "urlaub/rest",
    scope: "lesen",
    titel: "Resturlaub einer Person im laufenden Jahr: Anspruch, genehmigte und beantragte Werktage (Feiertage Niedersachsen abgezogen, kein Übertrag).",
    parameter: "person (ID, Pflicht)",
    handler: async (c) => {
      const person = uuidParam(c, "person");
      const jahr = Number(heuteIso().slice(0, 4));
      const [profil, antraege] = await Promise.all([
        c.db.from("profiles").select("vorname, nachname, urlaubstage_jahr").eq("id", person).eq("aktiv", true).maybeSingle(),
        c.db.from("leave_requests").select("von, bis, art, status").eq("user_id", person).in("status", ["offen", "genehmigt"]).gte("bis", `${jahr}-01-01`).limit(200),
      ]);
      if (profil.error || antraege.error) throw new ApiFehler(500, "Der Urlaub konnte nicht geladen werden.");
      if (!profil.data) throw new ApiFehler(404, "Mitarbeiter nicht gefunden.");
      const k = urlaubskonto(profil.data.urlaubstage_jahr, antraege.data, jahr);
      return { mitarbeiter: name(profil.data), jahr, anspruch: k.anspruch, genehmigt: k.genehmigt, beantragt: k.beantragt, rest: k.rest };
    },
  },
  {
    methode: "GET",
    pfad: "container",
    scope: "lesen",
    titel: "Container-Meldungen und ob Papier- bzw. Restmüllcontainer gerade gesperrt sind (7 Tage nach einer Meldung).",
    handler: async ({ db }) => {
      const { data, error } = await db.from("container_requests").select("id, art, created_at, erledigt_am, notiz, freigegeben_am, profiles!container_requests_ausgeloest_von_fkey(vorname, nachname)").order("created_at", { ascending: false }).limit(30);
      if (error) throw new ApiFehler(500, "Die Container-Meldungen konnten nicht geladen werden.");
      const meldungen: ContainerMeldung[] = data
        .filter((m) => m.art === "papier" || m.art === "restmuell")
        .map((m) => ({ id: m.id, art: m.art as "papier" | "restmuell", zeit: m.created_at, wer: name(m.profiles), erledigt: m.erledigt_am !== null, notiz: m.notiz ?? "", freigegeben: m.freigegeben_am !== null }));
      return {
        status: CONTAINER_ARTEN.map((art) => {
          const bis = sperreBis(meldungen, art);
          return { art, name: CONTAINER_NAMEN[art], gesperrt: bis !== null, wieder_moeglich_ab: bis ? bis.toISOString() : null };
        }),
        meldungen,
      };
    },
  },
  {
    methode: "GET",
    pfad: "katalog",
    scope: "lesen",
    titel: "Leistungen und Materialien aus den Stammdaten mit Verkaufspreis.",
    parameter: "q (Suchtext), art (leistung|material, Standard leistung), limit",
    handler: async (c) => {
      const q = suche(c.query.get("q"));
      const limit = begrenzung(c, 30);
      if (c.query.get("art") === "material") {
        let a = c.db.from("materials").select("id, name, artikelnr, lieferant, einheit, vk").is("archiviert_am", null).order("name").limit(limit);
        if (q) a = a.or(`name.ilike.%${q}%,artikelnr.ilike.%${q}%,lieferant.ilike.%${q}%`);
        const { data, error } = await a;
        if (error) throw new ApiFehler(500, "Der Katalog konnte nicht geladen werden.");
        return data.map((m) => ({ id: m.id, name: m.name, artikelnummer: m.artikelnr, lieferant: m.lieferant, einheit: m.einheit, verkaufspreis: m.vk === null ? null : Number(m.vk) }));
      }
      let a = c.db.from("services").select("id, name, nummer, einheit, vk").is("archiviert_am", null).order("name").limit(limit);
      if (q) a = a.or(`name.ilike.%${q}%,nummer.ilike.%${q}%,langtext.ilike.%${q}%`);
      const { data, error } = await a;
      if (error) throw new ApiFehler(500, "Der Katalog konnte nicht geladen werden.");
      return data.map((s) => ({ id: s.id, name: s.name, nummer: s.nummer, einheit: s.einheit, verkaufspreis: s.vk === null ? null : Number(s.vk) }));
    },
  },
  {
    methode: "GET",
    pfad: "termine",
    scope: "lesen",
    titel: "Termine aller Mitarbeiter.",
    parameter: "von und bis (JJJJ-MM-TT, Standard: ab heute 30 Tage), limit",
    handler: async (c) => {
      const heute = heuteIso();
      const von = tagParam(c, "von") ?? heute;
      const bis = tagParam(c, "bis") ?? new Date(Date.parse(`${von}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await c.db
        .from("appointments")
        .select("id, datum, zeit, titel, ort, notiz, appointment_members(profiles(vorname, nachname))")
        .is("archiviert_am", null)
        .gte("datum", von)
        .lte("datum", bis)
        .order("datum")
        .limit(begrenzung(c, 100));
      if (error) throw new ApiFehler(500, "Die Termine konnten nicht geladen werden.");
      return data.map((t) => ({ id: t.id, datum: t.datum, zeit: t.zeit, titel: t.titel, ort: t.ort, notiz: t.notiz, personen: (t.appointment_members ?? []).map((m) => name(m.profiles)).filter(Boolean) }));
    },
  },
];
