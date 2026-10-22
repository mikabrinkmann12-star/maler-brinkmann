"use server";

import { z } from "zod";
import { darf, ladeRechte, requireRole } from "@/lib/auth";
import type { ContainerMeldung } from "@/lib/container";
import { containerMeldungenLaden } from "@/lib/container-daten";
import { dashboardLaden } from "@/lib/dashboard-daten";
import { heuteIso, tageVerschieben } from "@/lib/datum";
import { formatDatumLang } from "@/lib/format";
import type { JarvisDaten } from "@/lib/jarvis-befehle";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { kontaktName } from "@/lib/projekt";
import { rechtOk } from "@/lib/rechte";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { urlaubskonto } from "@/lib/urlaub";

// Jarvis im Browser: Daten für die Namen-Erkennung und die „Nachsehen“-Fragen. Alles mit den Rechten des angemeldeten Nutzers
// (eigener Client, RLS) – nie mit dem Admin-Client oder dem API-Schlüssel. Hier wird nichts geschrieben; Container melden und
// Notiz anlegen laufen über die bestehenden Aktionen, Einteilung über die Plantafel.

export type JarvisErlaubt = {
  container: boolean;
  notiz: boolean;
  einteilung: boolean;
  einsaetze: boolean;
  urlaub: boolean;
  projekte: boolean;
};

export type JarvisStart = {
  daten: Omit<JarvisDaten, "projekte"> & {
    /** Mit Kunde und Ort für die Anzeige */
    projekte: (JarvisDaten["projekte"][number] & { kunde: string; ort: string })[];
  };
  container: ContainerMeldung[];
  erlaubt: JarvisErlaubt;
};

/** Namenslisten für die Erkennung. Wird geladen, wenn das Jarvis-Fenster aufgeht. */
export async function jarvisDatenLaden(): Promise<JarvisStart | { fehler: string }> {
  await requireRole(BUERO_ROLLEN);
  const supabase = await createClient();
  const [profile, fahrzeuge, projekte, container, rechte] = await Promise.all([
    supabase.from("profiles").select("id, vorname, nachname").eq("aktiv", true).order("vorname"),
    supabase.from("vehicles").select("id, name, kennzeichen").eq("aktiv", true).order("name"),
    supabase
      .from("projects")
      .select("id, projektnummer, name, baustelle_strasse, baustelle_ort, contacts(firmenname, vorname, nachname)")
      .is("archiviert_am", null)
      .order("name")
      .limit(1000),
    containerMeldungenLaden(30),
    ladeRechte(),
  ]);
  if (profile.error || fahrzeuge.error || projekte.error) return { fehler: "Jarvis konnte die Namen nicht laden. Bitte nochmal versuchen." };

  return {
    daten: {
      mitarbeiter: profile.data.map((p) => ({ id: p.id, vorname: p.vorname, nachname: p.nachname })),
      fahrzeuge: fahrzeuge.data,
      projekte: projekte.data.map((p) => {
        const kunde = kontaktName(p.contacts);
        return {
          id: p.id,
          name: p.name,
          kunde,
          ort: p.baustelle_ort ?? "",
          stichworte: [p.contacts?.firmenname || p.contacts?.nachname || "", p.baustelle_ort ?? "", p.baustelle_strasse ?? "", p.projektnummer].filter(Boolean),
        };
      }),
    },
    container,
    erlaubt: {
      container: rechtOk(rechte, "container_melden"),
      notiz: rechtOk(rechte, "baustelle_eintragen"),
      einteilung: rechtOk(rechte, "einteilung_bearbeiten"),
      einsaetze: rechtOk(rechte, "einsaetze_ansehen"),
      urlaub: rechtOk(rechte, "zeiten_alle"),
      projekte: rechtOk(rechte, "projekte_ansehen"),
    },
  };
}

export type JarvisAntwort = {
  titel: string;
  zeilen: { text: string; href?: string }[];
};

const abfrageSchema = z.discriminatedUnion("art", [
  z.object({ art: z.literal("heute_wo"), tage: z.number().int().min(-7).max(14) }),
  z.object({ art: z.literal("urlaub_rest"), mitarbeiterId: z.uuid() }),
  z.object({ art: z.literal("offen") }),
]);

const KEIN_RECHT = { fehler: "Dafür hast du kein Recht. Das stellt der Admin unter „Rollen & Zugriffsrechte“ ein." };

/** Nachsehen: nur lesen. Gibt kurze Sätze zurück, die das Fenster anzeigt. */
export async function jarvisAbfrage(eingabe: unknown): Promise<JarvisAntwort | { fehler: string }> {
  await requireRole(BUERO_ROLLEN);
  const p = abfrageSchema.safeParse(eingabe);
  if (!p.success) return { fehler: "Das habe ich nicht verstanden." };
  const frage = p.data;

  if (frage.art === "heute_wo") return wo(frage.tage);
  if (frage.art === "urlaub_rest") return urlaubRest(frage.mitarbeiterId);
  return offen();
}

function tagName(tage: number): string {
  return tage === 0 ? "heute" : tage === 1 ? "morgen" : tage === 2 ? "übermorgen" : tage === -1 ? "gestern" : "an diesem Tag";
}

async function wo(tage: number): Promise<JarvisAntwort | { fehler: string }> {
  if (!(await darf("einsaetze_ansehen"))) return KEIN_RECHT;
  const datum = tageVerschieben(heuteIso(), tage);
  const supabase = await createClient();
  const [einsaetze, termine, urlaub, krank, kollegen] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, vehicles(name, kennzeichen), assignment_stops(sortierung, projects(id, name)), assignment_members(user_id)")
      .eq("datum", datum),
    supabase.from("appointments").select("titel, ort, zeit, appointment_members(user_id)").eq("datum", datum).is("archiviert_am", null).order("zeit", { nullsFirst: false }),
    supabase.from("leave_requests").select("user_id, art").eq("status", "genehmigt").lte("von", datum).gte("bis", datum),
    supabase.from("time_entries").select("user_id").eq("art", "krank").eq("datum", datum).is("archiviert_am", null),
    kollegenLaden(),
  ]);
  if (einsaetze.error || termine.error) return { fehler: "Die Einteilung konnte nicht geladen werden." };

  const name = (uid: string) => {
    const k = kollegen.get(uid);
    return k ? `${k.vorname} ${k.nachname}`.trim() : "Ehemaliger Kollege";
  };
  const zeilen: JarvisAntwort["zeilen"] = [];
  for (const e of einsaetze.data) {
    const auto = e.vehicles ? e.vehicles.name : "Ohne Firmenwagen";
    const baustellen = [...e.assignment_stops].sort((a, b) => a.sortierung - b.sortierung).flatMap((s) => (s.projects ? [s.projects] : []));
    const team = e.assignment_members.map((m) => name(m.user_id)).sort((a, b) => a.localeCompare(b, "de"));
    zeilen.push({
      text: `${auto}: ${team.length ? team.join(", ") : "niemand eingeteilt"} → ${baustellen.length ? baustellen.map((b) => b.name).join(", dann ") : "keine Baustelle"}`,
      href: baustellen.length === 1 ? `/buero/projekte/${baustellen[0].id}` : undefined,
    });
  }
  for (const t of termine.data) {
    const wer = t.appointment_members.map((m) => name(m.user_id)).join(", ");
    zeilen.push({ text: `Termin${t.zeit ? ` ${t.zeit.slice(0, 5)} Uhr` : ""}: ${t.titel}${t.ort ? ` (${t.ort})` : ""}${wer ? ` – ${wer}` : ""}` });
  }
  const abwesend = [
    ...(urlaub.data ?? []).map((u) => `${name(u.user_id)} (${u.art === "urlaub" ? "Urlaub" : u.art === "ueberstundenabbau" ? "Abfeiern" : "Unbezahlter Urlaub"})`),
    ...(krank.data ?? []).map((k) => `${name(k.user_id)} (krank)`),
  ];
  if (abwesend.length) zeilen.push({ text: `Nicht da: ${abwesend.join(", ")}` });
  if (!zeilen.length) zeilen.push({ text: `Für ${tagName(tage)} ist niemand eingeteilt und es gibt keine Termine.` });
  zeilen.push({ text: "Einteilung öffnen", href: `/buero/plantafel?datum=${datum}` });
  return { titel: `Einteilung ${tagName(tage)}, ${formatDatumLang(datum)}`, zeilen };
}

async function urlaubRest(mitarbeiterId: string): Promise<JarvisAntwort | { fehler: string }> {
  if (!(await darf("zeiten_alle"))) return KEIN_RECHT;
  const jahr = Number(heuteIso().slice(0, 4));
  const supabase = await createClient();
  const [profil, antraege] = await Promise.all([
    supabase.from("profiles").select("vorname, nachname, urlaubstage_jahr").eq("id", mitarbeiterId).eq("aktiv", true).maybeSingle(),
    supabase.from("leave_requests").select("von, bis, art, status").eq("user_id", mitarbeiterId).in("status", ["offen", "genehmigt"]).gte("bis", `${jahr}-01-01`),
  ]);
  if (profil.error || antraege.error) return { fehler: "Der Urlaub konnte nicht geladen werden." };
  if (!profil.data) return { fehler: "Diese Person habe ich nicht gefunden." };

  const k = urlaubskonto(profil.data.urlaubstage_jahr, antraege.data, jahr);
  const name = `${profil.data.vorname} ${profil.data.nachname}`.trim();
  const tage = (n: number) => `${n} ${n === 1 ? "Tag" : "Tage"}`;
  const zeilen: JarvisAntwort["zeilen"] = [];
  if (k.anspruch == null || k.rest == null) {
    zeilen.push({ text: `Für ${name} ist noch kein Urlaubsanspruch eingetragen. Das macht der Admin in der Nutzerverwaltung.` });
  } else {
    zeilen.push({ text: `${name} hat noch ${tage(k.rest)} Urlaub (Anspruch ${k.anspruch}, genehmigt ${k.genehmigt}).` });
  }
  if (k.beantragt > 0) zeilen.push({ text: `Dazu ${tage(k.beantragt)} beantragt, noch nicht entschieden.` });
  zeilen.push({ text: "Urlaubsanträge öffnen", href: "/buero/urlaub" });
  return { titel: `Urlaub ${jahr}: ${name}`, zeilen };
}

async function offen(): Promise<JarvisAntwort | { fehler: string }> {
  const rechte = await ladeRechte();
  const d = await dashboardLaden(heuteIso());
  const punkte = [
    { zahl: d.aufgaben.urlaubsantraege, text: "Urlaubsanträge offen", href: "/buero/urlaub", recht: "zeiten_alle" },
    { zahl: d.aufgaben.containerOffen, text: "Container gemeldet", href: "/buero/container", recht: "container_verwalten" },
    { zahl: d.aufgaben.chat.nachrichten, text: "neue Chat-Nachrichten", href: "/buero/projekte", recht: "chat" },
    { zahl: d.rechnungen.entwuerfe, text: "Rechnungsentwürfe", href: "/buero/rechnungen?status=entwurf", recht: "rechnungen" },
    { zahl: d.angebote.entwuerfe, text: "Angebotsentwürfe", href: "/buero/angebote?status=entwurf", recht: "angebote" },
    { zahl: d.aufgaben.eingangPruefen, text: "Eingangsrechnungen zu prüfen", href: "/buero/eingangsrechnungen?tab=pruefen", recht: "eingangsrechnungen" },
  ].filter((x) => x.zahl > 0 && rechtOk(rechte, x.recht));
  return {
    titel: "Das ist offen",
    zeilen: punkte.length ? punkte.map((x) => ({ text: `${x.zahl} ${x.text}`, href: x.href })) : [{ text: "Im Moment ist nichts offen." }],
  };
}
