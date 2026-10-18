// Liest aus dem Text einer Lieferantenrechnung (PDF-Text) die wichtigsten Felder heraus.
// Regelbasiert, ohne KI: Beschriftungen wie „Rechnungsnummer“, „Rechnungsdatum“, „Gesamtbetrag“ werden gesucht.
// Das Ergebnis ist ein Vorschlag, den ein Mensch bestätigt („Zu prüfen“).

export type ErkannteFelder = {
  lieferant: string;
  rechnungsnummer: string;
  rechnungsdatum: string | null;
  faelligAm: string | null;
  netto: number | null;
  brutto: number | null;
  iban: string;
};

/** „1.234,56“, „1234,56“, „12,5“, auch englisch „1,234.56“ → Zahl, sonst null. */
export function betragLesen(roh: string): number | null {
  const t = roh.replace(/EUR|€|\s/gi, "");
  if (!/^-?\d[\d.,]*$/.test(t)) return null;
  const letzterPunkt = t.lastIndexOf(".");
  const letztesKomma = t.lastIndexOf(",");
  let normal: string;
  if (letztesKomma > letzterPunkt) {
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (letzterPunkt > letztesKomma && letztesKomma !== -1) {
    normal = t.replace(/,/g, ""); // englisch: 1,234.56
  } else if (letzterPunkt !== -1) {
    // nur Punkte: „1.234“ (Tausender) oder „12.50“ (englisch)
    const rest = t.slice(letzterPunkt + 1);
    normal = rest.length === 3 ? t.replace(/\./g, "") : t;
  } else {
    normal = t;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function istEchtesDatum(j: number, m: number, t: number): boolean {
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t && j >= 2000 && j <= 2100;
}

const zwei = (n: number) => String(n).padStart(2, "0");

/** „12.03.2026“, „12.3.26“, „2026-03-12“ → „2026-03-12“, sonst null. */
export function datumLesen(roh: string): string | null {
  const t = roh.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(t);
  if (m) {
    const j = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return istEchtesDatum(j, Number(m[2]), Number(m[1])) ? `${j}-${zwei(Number(m[2]))}-${zwei(Number(m[1]))}` : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return istEchtesDatum(Number(m[1]), Number(m[2]), Number(m[3])) ? t : null;
  return null;
}

/** Tage auf ein ISO-Datum addieren. */
export function tageDazu(iso: string, tage: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + tage));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}

const DATUM = String.raw`(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})`;
const BETRAG = String.raw`(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2})`;

/** IBAN-Prüfsumme (Modulo 97). */
export function ibanGueltig(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const z of umgestellt) {
    const wert = /\d/.test(z) ? z : String(z.charCodeAt(0) - 55);
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

function ibanFinden(text: string): string {
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g)) {
    if (ibanGueltig(m[0])) return m[0].replace(/\s+/g, "");
  }
  return "";
}

function normal(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
}

// Nur Großschreibung (außer GmbH), damit „10 kg“ oder „Se“ nicht als Rechtsform gelten
const FIRMEN_ENDUNG = /(?:^|\W)(?:GmbH|GMBH|mbH|AG|KG|OHG|UG|GbR|SE|e\.\s?K\.|e\.\s?V\.|Inh\.|& Co\.)(?=\W|$)/;

function lieferantFinden(zeilen: string[], bekannte: string[], eigene: string[]): string {
  const eigeneNormal = eigene.map(normal).filter(Boolean);
  const istEigen = (s: string) => eigeneNormal.some((e) => normal(s).includes(e));
  const gesamt = normal(zeilen.join(" "));
  // 1. Ein bekannter Lieferant (aus Kontakten oder früheren Rechnungen) kommt im Text vor: der längste Name gewinnt.
  const treffer = bekannte
    .filter((b) => normal(b).length >= 4 && !istEigen(b) && gesamt.includes(normal(b)))
    .sort((a, b) => normal(b).length - normal(a).length)[0];
  if (treffer) return treffer;
  // 2. Erste Zeile oben mit Rechtsform („Müller Farben GmbH“), die nicht unser Betrieb ist.
  for (const z of zeilen.slice(0, 25)) {
    if (!FIRMEN_ENDUNG.test(z) || istEigen(z) || z.length > 80) continue;
    // Absenderzeile „Firma · Straße · PLZ Ort“: nur der erste Teil
    const teil = z.split(/[·|•]|\s-\s|\s{3,}/)[0].trim();
    if (teil.length >= 4) return teil;
  }
  return "";
}

function beschriftungWert(text: string, beschriftung: RegExp, wert: string, abstand = 40): string[] {
  const re = new RegExp(`(?:${beschriftung.source})[^\\n\\d-]{0,${abstand}}?[:\\s]*${wert}`, "gi");
  return [...text.matchAll(re)].map((m) => m[m.length - 1]);
}

/** Vorschlag aus dem Text einer Rechnung. `bekannteLieferanten`: Namen aus Kontakten/früheren Rechnungen. `eigeneNamen`: unser Betrieb (wird nie als Lieferant genommen). */
export function felderAusText(text: string, bekannteLieferanten: string[] = [], eigeneNamen: string[] = []): ErkannteFelder {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);

  // Rechnungsnummer
  let rechnungsnummer = "";
  const nr = /(?:Rechnungs-?\s?(?:nummer|nr\.?)|Rechnung\s*(?:Nr\.?|Nummer)|Beleg-?\s?(?:nummer|nr\.?)|Invoice\s*(?:no\.?|number|nr\.?)|Re\.?-?\s?Nr\.?)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-/_.]{2,30})/gi;
  for (const m of text.matchAll(nr)) {
    const kandidat = m[1].replace(/[.,]+$/, "");
    if (/\d/.test(kandidat)) { rechnungsnummer = kandidat; break; }
  }

  // Rechnungsdatum
  const datumsTreffer = beschriftungWert(text, /Rechnungsdatum|Belegdatum|Rechnungs-Datum|Datum der Rechnung|Invoice date/, DATUM)
    .map(datumLesen).filter((d): d is string => !!d);
  let rechnungsdatum = datumsTreffer[0] ?? null;
  if (!rechnungsdatum) {
    const einfach = beschriftungWert(text, /Datum/, DATUM, 15).map(datumLesen).filter((d): d is string => !!d);
    rechnungsdatum = einfach[0] ?? null;
  }
  if (!rechnungsdatum) {
    for (const m of text.matchAll(new RegExp(DATUM, "g"))) {
      const d = datumLesen(m[1]);
      if (d) { rechnungsdatum = d; break; }
    }
  }

  // Fälligkeit
  let faelligAm: string | null = null;
  for (const roh of beschriftungWert(text, /f[äa]llig(?:\s*am|keit(?:sdatum)?)?|zahlbar\s*bis|zahlungsziel|zu zahlen bis/, DATUM, 30)) {
    const d = datumLesen(roh);
    if (d) { faelligAm = d; break; }
  }
  if (!faelligAm && rechnungsdatum) {
    const tage = /(?:innerhalb\s+von|zahlbar\s+binnen|Zahlungsziel:?|zahlbar\s+in)\s*(\d{1,3})\s*Tag/i.exec(text)
      ?? /(\d{1,3})\s*Tage?\s*(?:netto|rein netto|nach Rechnungsdatum|ohne Abzug)/i.exec(text);
    if (tage && Number(tage[1]) <= 120) faelligAm = tageDazu(rechnungsdatum, Number(tage[1]));
  }

  // Beträge
  const bruttoKandidaten = beschriftungWert(text, /Gesamtbetrag|Rechnungsbetrag|Endbetrag|Zahlbetrag|Gesamtsumme|Bruttobetrag|Summe brutto|Brutto(?:summe)?|Gesamt brutto|Zu zahlen|Zahlungsbetrag|Betrag brutto|Total/, BETRAG, 45)
    .map(betragLesen).filter((n): n is number => n !== null && n !== 0);
  const nettoKandidaten = beschriftungWert(text, /Nettobetrag|Summe netto|Netto(?:summe)?|Zwischensumme|Gesamt netto|Betrag netto|Warenwert|Nettosumme/, BETRAG, 45)
    .map(betragLesen).filter((n): n is number => n !== null && n !== 0);

  let brutto: number | null = null;
  let netto: number | null = null;
  // Zusammenpassendes Paar suchen: brutto = netto + 19 % bzw. 7 % bzw. 0 %
  for (const b of [...bruttoKandidaten].sort((x, y) => y - x)) {
    for (const n of nettoKandidaten) {
      if ([0.19, 0.07, 0].some((satz) => Math.abs(Math.round(n * (1 + satz) * 100) / 100 - b) <= 0.02)) {
        brutto = b;
        netto = n;
        break;
      }
    }
    if (brutto !== null) break;
  }
  if (brutto === null && bruttoKandidaten.length) brutto = Math.max(...bruttoKandidaten);
  if (netto === null && nettoKandidaten.length) {
    const passend = nettoKandidaten.filter((n) => brutto === null || n <= brutto);
    netto = passend.length ? Math.max(...passend) : null;
  }
  // Nur ein Steuersatz im Text → Netto aus Brutto schätzen (bleibt „zu prüfen“)
  if (netto === null && brutto !== null) {
    const steuerWort = String.raw`(?:USt|MwSt|MWST|Umsatzsteuer|Mehrwertsteuer)\.?`;
    const saetze = new Set(
      [...text.matchAll(new RegExp(String.raw`(\d{1,2})(?:[.,]0+)?\s?%\s*${steuerWort}|${steuerWort}\s*(?:von\s*)?(\d{1,2})(?:[.,]0+)?\s?%`, "gi"))]
        .map((m) => Number(m[1] ?? m[2])),
    );
    if (saetze.size === 1) {
      const satz = [...saetze][0];
      if (satz === 19 || satz === 7) netto = Math.round((brutto / (1 + satz / 100)) * 100) / 100;
    }
  }

  return {
    lieferant: lieferantFinden(zeilen, bekannteLieferanten, eigeneNamen),
    rechnungsnummer,
    rechnungsdatum,
    faelligAm,
    netto,
    brutto,
    iban: ibanFinden(text),
  };
}

/** Wie viele der wichtigen Felder (Lieferant, Nummer, Datum, Brutto) gefunden wurden: 0 bis 4. */
export function vollstaendigkeit(f: Pick<ErkannteFelder, "lieferant" | "rechnungsnummer" | "rechnungsdatum" | "brutto">): number {
  return [f.lieferant, f.rechnungsnummer, f.rechnungsdatum, f.brutto].filter((x) => x !== "" && x !== null).length;
}
