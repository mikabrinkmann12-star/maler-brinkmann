import "server-only";
import { z } from "zod";
import { istUuid } from "./router";
import { ApiFehler, type ApiKontext, type ApiRoute } from "./typen";
import { angebotEntwurfAnlegen } from "@/lib/angebot-erstellen";
import { istContainerArt } from "@/lib/container";
import { naechsteKundennummer } from "@/lib/kundennummer";
import { PROJEKT_START_STANDARD, naechsteProjektnummer } from "@/lib/projektnummer";
import { rechnungEntwurfAusAngebot } from "@/lib/rechnung-erstellen";
import { zeitDatenSchema, zeitZeile } from "@/lib/zeit-schema";

// Schreibende Endpunkte. BEWUSST NICHT enthalten: Angebote/Rechnungen versenden oder an die Buchhaltung übertragen, Löschen (nichts wird
// gelöscht), Nutzer und Einstellungen ändern. Eingaben werden mit zod geprüft; alles andere regeln Trigger und Regeln der Datenbank.

const text = (max: number, name: string) => z.string().trim().max(max, `${name} ist zu lang (höchstens ${max} Zeichen).`);

function pruefen<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new ApiFehler(400, r.error.issues[0]?.message ?? "Ungültige Eingabe.");
  return r.data;
}

function dbFehler(fehler: { code?: string; message: string }, standard: string): never {
  if (fehler.code === "P0001") throw new ApiFehler(409, fehler.message); // Meldungen der Trigger sind schon deutsch
  if (fehler.code === "23P01") throw new ApiFehler(409, "Die Zeit überschneidet sich mit einem schon gespeicherten Eintrag dieser Person.");
  if (fehler.code === "23505") throw new ApiFehler(409, "Das gibt es schon.");
  if (fehler.code === "23503") throw new ApiFehler(400, "Ein angegebener Verweis (z. B. Projekt oder Person) gibt es nicht.");
  throw new ApiFehler(500, standard);
}

function idParam(c: ApiKontext, name: string): string {
  const w = c.params[name];
  if (!istUuid(w)) throw new ApiFehler(400, `„${name}“ ist keine gültige ID.`);
  return w;
}

const positionSchema = z.object({
  kurztext: z.string().trim().min(1, "Eine Position braucht einen Kurztext.").max(200, "Der Kurztext ist zu lang (höchstens 200 Zeichen)."),
  langtext: text(5000, "Der Langtext").optional(),
  menge: z.number("Die Menge muss eine Zahl sein.").gt(0, "Die Menge muss größer als 0 sein.").max(999_999),
  einheit: z.string().trim().min(1, "Eine Position braucht eine Einheit.").max(20, "Die Einheit ist zu lang (höchstens 20 Zeichen)."),
  einzelpreis: z.number("Der Einzelpreis muss eine Zahl sein.").min(-9_999_999).max(9_999_999),
});
type Position = z.output<typeof positionSchema>;

const rund = (n: number, stellen: number) => Math.round(n * 10 ** stellen) / 10 ** stellen;

export const schreibRouten: ApiRoute[] = [
  {
    methode: "POST",
    pfad: "container",
    scope: "schreiben",
    titel: "Papier- oder Restmüllcontainer melden. Danach ist genau diese Art 7 Tage gesperrt (Antwort 409 mit Datum, wenn schon gemeldet).",
    koerper: '{ "art": "papier" | "restmuell" }',
    handler: async (c) => {
      const b = pruefen(z.object({ art: z.string() }), c.body);
      if (!istContainerArt(b.art)) throw new ApiFehler(400, "„art“ muss „papier“ oder „restmuell“ sein.");
      const { data, error } = await c.db.from("container_requests").insert({ art: b.art, ausgeloest_von: c.nutzerId }).select("id").single();
      if (error) dbFehler(error, "Der Container konnte nicht gemeldet werden.");
      return { id: data.id };
    },
  },
  {
    methode: "POST",
    pfad: "container/:id/erledigt",
    scope: "schreiben",
    titel: "Eine Container-Meldung als erledigt markieren (z. B. nach der Bestellung), mit Notiz.",
    koerper: '{ "notiz": "Bestellt bei Firma X, Lieferung Donnerstag" }',
    handler: async (c) => {
      const id = idParam(c, "id");
      const b = pruefen(z.object({ notiz: text(300, "Die Notiz").optional() }), c.body ?? {});
      const { data, error } = await c.db
        .from("container_requests")
        .update({ erledigt_am: new Date().toISOString(), erledigt_von: c.nutzerId, notiz: b.notiz || null })
        .eq("id", id)
        .is("erledigt_am", null)
        .select("id");
      if (error) dbFehler(error, "Das hat nicht geklappt.");
      if (!data.length) throw new ApiFehler(404, "Meldung nicht gefunden oder schon erledigt.");
      return { id };
    },
  },
  {
    methode: "POST",
    pfad: "zeiten",
    scope: "schreiben",
    titel: "Eine Zeit für einen Mitarbeiter eintragen (von–bis mit Pause oder nur Stunden). Überschneidungen werden abgelehnt.",
    koerper: '{ "person_id", "datum": "JJJJ-MM-TT", "art": "arbeitszeit", "projekt_id", "von": "06:30", "bis": "15:45", "pause_min": 45 } oder statt von/bis { "stunden": 8.5 }; optional "beschreibung"',
    handler: async (c) => {
      const b = pruefen(
        z.object({
          person_id: z.uuid("„person_id“ ist keine gültige ID."),
          datum: z.string(),
          art: z.string().default("arbeitszeit"),
          projekt_id: z.uuid().nullable().optional(),
          von: z.string().optional(),
          bis: z.string().optional(),
          pause_min: z.number().int().min(0).optional(),
          stunden: z.number().optional(),
          beschreibung: z.string().optional(),
        }),
        c.body,
      );
      const mitUhrzeit = Boolean(b.von && b.bis);
      const daten = pruefen(zeitDatenSchema, {
        datum: b.datum,
        projektId: b.projekt_id ?? null,
        art: b.art,
        modus: mitUhrzeit ? "uhrzeit" : "stunden",
        von: b.von ?? "",
        bis: b.bis ?? "",
        pauseMin: b.pause_min ?? 0,
        stunden: b.stunden ?? 0,
        beschreibung: b.beschreibung ?? "",
      });
      const { data: person } = await c.db.from("profiles").select("id").eq("id", b.person_id).eq("aktiv", true).maybeSingle();
      if (!person) throw new ApiFehler(404, "Diesen aktiven Mitarbeiter gibt es nicht.");
      const { data, error } = await c.db
        .from("time_entries")
        .insert({ ...zeitZeile(daten), user_id: b.person_id, erstellt_von: c.nutzerId })
        .select("id, stunden")
        .single();
      if (error) dbFehler(error, "Die Zeit konnte nicht gespeichert werden.");
      return { id: data.id, stunden: Number(data.stunden) };
    },
  },
  {
    methode: "POST",
    pfad: "notizen",
    scope: "schreiben",
    titel: "Eine Notiz zu einem Projekt anlegen.",
    koerper: '{ "projekt_id", "text" }',
    handler: async (c) => {
      const b = pruefen(z.object({ projekt_id: z.uuid("„projekt_id“ ist keine gültige ID."), text: z.string().trim().min(1, "Der Text fehlt.").max(2000, "Die Notiz ist zu lang (höchstens 2.000 Zeichen).") }), c.body);
      const { data, error } = await c.db.from("project_notes").insert({ project_id: b.projekt_id, text: b.text, erstellt_von: c.nutzerId }).select("id").single();
      if (error) dbFehler(error, "Die Notiz konnte nicht gespeichert werden.");
      return { id: data.id };
    },
  },
  {
    methode: "POST",
    pfad: "kontakte",
    scope: "schreiben",
    titel: "Einen neuen Kontakt (Kunde) anlegen. Die Kundennummer vergibt die App.",
    koerper: '{ "typ": "privat"|"firma", "firmenname" (bei Firma), "vorname", "nachname", "strasse", "plz", "ort", "telefon", "mobil", "email" }',
    handler: async (c) => {
      const b = pruefen(
        z
          .object({
            typ: z.enum(["privat", "firma"], { error: "„typ“ muss „privat“ oder „firma“ sein." }).default("privat"),
            firmenname: text(200, "Der Firmenname").optional(),
            vorname: text(100, "Der Vorname").optional(),
            nachname: text(100, "Der Nachname").optional(),
            anrede: text(40, "Die Anrede").optional(),
            strasse: text(200, "Die Straße").optional(),
            plz: text(10, "Die PLZ").optional(),
            ort: text(100, "Der Ort").optional(),
            telefon: text(60, "Das Telefon").optional(),
            mobil: text(60, "Die Mobilnummer").optional(),
            email: z.union([z.literal(""), z.email("Die E-Mail-Adresse ist ungültig.")]).optional(),
          })
          .refine((d) => (d.typ === "firma" ? Boolean(d.firmenname) : Boolean(d.nachname)), { message: "Bei einer Firma fehlt „firmenname“, bei einer Privatperson „nachname“." }),
        c.body,
      );
      const leer = (v?: string) => (v ? v : null);
      for (let versuch = 0; versuch < 2; versuch++) {
        const nummern: string[] = [];
        for (let von = 0; von < 20_000; von += 1000) {
          const { data, error } = await c.db.from("contacts").select("kundennummer").order("id").range(von, von + 999);
          if (error) throw new ApiFehler(500, "Die Kundennummern konnten nicht gelesen werden.");
          nummern.push(...data.map((k) => k.kundennummer ?? ""));
          if (data.length < 1000) break;
        }
        const { data, error } = await c.db
          .from("contacts")
          .insert({
            typ: b.typ,
            kundennummer: naechsteKundennummer(nummern),
            firmenname: leer(b.firmenname),
            vorname: leer(b.vorname),
            nachname: leer(b.nachname),
            anrede: leer(b.anrede),
            strasse: leer(b.strasse),
            plz: leer(b.plz),
            ort: leer(b.ort),
            telefon: leer(b.telefon),
            mobil: leer(b.mobil),
            email: leer(b.email),
            created_by: c.nutzerId,
          })
          .select("id, kundennummer")
          .single();
        if (!error) return { id: data.id, kundennummer: data.kundennummer };
        if (error.code !== "23505" || versuch === 1) dbFehler(error, "Der Kontakt konnte nicht angelegt werden.");
      }
      throw new ApiFehler(500, "Der Kontakt konnte nicht angelegt werden.");
    },
  },
  {
    methode: "POST",
    pfad: "projekte",
    scope: "schreiben",
    titel: "Ein neues Projekt anlegen (Status „Entwurf“-Stufe, Projektnummer vergibt die App).",
    koerper: '{ "name", "kunde_id" (optional), "beschreibung", "strasse", "plz", "ort", "start": "JJJJ-MM-TT", "ende": "JJJJ-MM-TT" }',
    handler: async (c) => {
      const tag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum bitte als JJJJ-MM-TT.");
      const b = pruefen(
        z.object({
          name: z.string().trim().min(1, "Das Projekt braucht einen Namen.").max(200, "Der Name ist zu lang (höchstens 200 Zeichen)."),
          kunde_id: z.uuid("„kunde_id“ ist keine gültige ID.").optional(),
          beschreibung: text(2000, "Die Beschreibung").optional(),
          strasse: text(200, "Die Straße").optional(),
          plz: text(10, "Die PLZ").optional(),
          ort: text(100, "Der Ort").optional(),
          start: tag.optional(),
          ende: tag.optional(),
        }),
        c.body,
      );
      const { data: status } = await c.db.from("project_statuses").select("id").eq("aktiv", true).order("sortierung").limit(1).maybeSingle();
      if (!status) throw new ApiFehler(500, "Es gibt keinen Projektstatus.");
      const { data: einst } = await c.db.from("app_settings").select("wert").eq("schluessel", "nummernkreise").maybeSingle();
      const startWert = (einst?.wert as { projekt_start?: unknown } | null)?.projekt_start;
      const startNummer = typeof startWert === "number" && Number.isInteger(startWert) && startWert >= 0 ? startWert : PROJEKT_START_STANDARD;
      for (let versuch = 0; versuch < 2; versuch++) {
        const nummern: string[] = [];
        for (let von = 0; von < 20_000; von += 1000) {
          const { data, error } = await c.db.from("projects").select("projektnummer").order("id").range(von, von + 999);
          if (error) throw new ApiFehler(500, "Die Projektnummern konnten nicht gelesen werden.");
          nummern.push(...data.map((p) => p.projektnummer));
          if (data.length < 1000) break;
        }
        const { data, error } = await c.db
          .from("projects")
          .insert({
            name: b.name,
            projektnummer: naechsteProjektnummer(nummern, startNummer),
            status_id: status.id,
            contact_id: b.kunde_id ?? null,
            beschreibung: b.beschreibung || null,
            baustelle_strasse: b.strasse || null,
            baustelle_plz: b.plz || null,
            baustelle_ort: b.ort || null,
            start_datum: b.start ?? null,
            end_datum: b.ende ?? null,
            created_by: c.nutzerId,
          })
          .select("id, projektnummer")
          .single();
        if (!error) return { id: data.id, projektnummer: data.projektnummer };
        if (error.code !== "23505" || versuch === 1) dbFehler(error, "Das Projekt konnte nicht angelegt werden.");
      }
      throw new ApiFehler(500, "Das Projekt konnte nicht angelegt werden.");
    },
  },
  {
    methode: "POST",
    pfad: "angebote",
    scope: "schreiben",
    titel: "Ein Angebot als ENTWURF für ein Projekt anlegen (Kunde, Adresse, Steuer, Texte werden vorbelegt), optional gleich mit Positionen. Versenden ist hier nicht möglich.",
    koerper: '{ "projekt_id", "betreff", "positionen": [ { "kurztext", "langtext", "menge", "einheit", "einzelpreis" } ] }',
    handler: async (c) => {
      const b = pruefen(
        z.object({
          projekt_id: z.uuid("„projekt_id“ ist keine gültige ID."),
          betreff: z.string().trim().min(1, "Das Angebot braucht einen Betreff.").max(200, "Der Betreff ist zu lang (höchstens 200 Zeichen)."),
          positionen: z.array(positionSchema).max(200, "Höchstens 200 Positionen auf einmal.").optional(),
        }),
        c.body,
      );
      const r = await angebotEntwurfAnlegen(c.db, b.projekt_id, { betreff: b.betreff }, c.nutzerId);
      if (r.fehler || !r.id) throw new ApiFehler(400, r.fehler ?? "Das Angebot konnte nicht angelegt werden.");
      if (b.positionen?.length) await positionenAnhaengen(c, r.id, b.positionen, true);
      return { id: r.id, status: "entwurf" };
    },
  },
  {
    methode: "POST",
    pfad: "angebote/:id/positionen",
    scope: "schreiben",
    titel: "Positionen an ein Angebot im Entwurf anhängen.",
    koerper: '{ "positionen": [ { "kurztext", "langtext", "menge", "einheit", "einzelpreis" } ] }',
    handler: async (c) => {
      const id = idParam(c, "id");
      const b = pruefen(z.object({ positionen: z.array(positionSchema).min(1, "Mindestens eine Position.").max(200, "Höchstens 200 Positionen auf einmal.") }), c.body);
      await positionenAnhaengen(c, id, b.positionen, false);
      return { id, hinzugefuegt: b.positionen.length };
    },
  },
  {
    methode: "POST",
    pfad: "angebote/:id/status",
    scope: "schreiben",
    titel: "Angebotsstatus setzen: angenommen, abgelehnt oder zurück auf entwurf. „versendet“ gibt es hier nicht (Jarvis verschickt nichts).",
    koerper: '{ "status": "angenommen" | "abgelehnt" | "entwurf" }',
    handler: async (c) => {
      const id = idParam(c, "id");
      const b = pruefen(z.object({ status: z.enum(["angenommen", "abgelehnt", "entwurf"], { error: "„status“ muss angenommen, abgelehnt oder entwurf sein." }) }), c.body);
      const { data, error } = await c.db.from("quotes").update({ status: b.status }).eq("id", id).select("id");
      if (error) dbFehler(error, "Der Status konnte nicht geändert werden.");
      if (!data.length) throw new ApiFehler(404, "Angebot nicht gefunden.");
      return { id, status: b.status };
    },
  },
  {
    methode: "POST",
    pfad: "rechnungen",
    scope: "schreiben",
    titel: "Einen Rechnungsentwurf aus einem versendeten oder angenommenen Angebot anlegen. Er wird NICHT an die Buchhaltung übertragen und nicht verschickt.",
    koerper: '{ "angebot_id" }',
    handler: async (c) => {
      const b = pruefen(z.object({ angebot_id: z.uuid("„angebot_id“ ist keine gültige ID.") }), c.body);
      const r = await rechnungEntwurfAusAngebot(c.db, b.angebot_id);
      if (r.fehler || !r.id) throw new ApiFehler(409, r.fehler ?? "Der Rechnungsentwurf konnte nicht angelegt werden.");
      return { id: r.id, status: "entwurf", hinweis: r.hinweis ?? null };
    },
  },
];

/** Positionen hinten an ein Angebot im Entwurf anhängen; bei `nachNeuanlage` ist es sicher ein neuer Entwurf. */
async function positionenAnhaengen(c: ApiKontext, angebotId: string, positionen: Position[], nachNeuanlage: boolean) {
  const { data: q } = await c.db.from("quotes").select("id, status").eq("id", angebotId).maybeSingle();
  if (!q) throw new ApiFehler(404, "Angebot nicht gefunden.");
  if (q.status !== "entwurf") throw new ApiFehler(409, "Positionen lassen sich nur im Entwurf ändern. Setze das Angebot zuerst zurück auf „entwurf“.");
  const { data: letzte } = await c.db.from("quote_items").select("sortierung").eq("quote_id", angebotId).order("sortierung", { ascending: false }).limit(1).maybeSingle();
  const start = (letzte?.sortierung ?? -1) + 1;
  const { error } = await c.db.from("quote_items").insert(
    positionen.map((p, i) => ({
      quote_id: angebotId,
      typ: "position" as const,
      sortierung: start + i,
      kurztext: p.kurztext,
      langtext: p.langtext || null,
      menge: rund(p.menge, 3),
      einheit: p.einheit,
      einzelpreis: rund(p.einzelpreis, 2),
    })),
  );
  if (error) {
    if (nachNeuanlage) await c.db.from("quotes").update({ archiviert_am: new Date().toISOString() }).eq("id", angebotId);
    dbFehler(error, "Die Positionen konnten nicht gespeichert werden.");
  }
}
