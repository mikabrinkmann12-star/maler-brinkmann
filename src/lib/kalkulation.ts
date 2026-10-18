// Kalkulation einer Leistung wie in Plancraft: Lohn (Zeit × Lohngruppe) + Material + Geräte + Fremdleistung + Sonstiges ergeben den
// Verkaufspreis. Jede Kostenart hat einen eigenen Zuschlag, der Lohn rechnet mit dem Verrechnungssatz der Lohngruppe.
// Reine Logik, auch im Browser nutzbar (Vorschau im Formular). Gespeichert wird danach Kosten (Summe der Einkaufswerte) und der
// Zuschlag, mit dem die Datenbank-Spalte `vk` genau auf den kalkulierten Preis kommt.

import { MAX_PREIS, vkBerechnen } from "@/lib/katalog";

export const KOSTENARTEN = ["lohn", "material", "geraete", "fremdleistung", "sonstiges"] as const;
export type Kostenart = (typeof KOSTENARTEN)[number];

export const KOSTENART_NAMEN: Record<Kostenart, string> = {
  lohn: "Lohn",
  material: "Material",
  geraete: "Geräte",
  fremdleistung: "Fremdleistung",
  sonstiges: "Sonstiges",
};

/** Zuschläge in Prozent (der Lohn hat keinen: er rechnet mit dem Verrechnungssatz der Lohngruppe). */
export type Zuschlaege = { material: number; geraete: number; fremdleistung: number; sonstiges: number };

/** Lohnkosten = was eine Stunde den Betrieb kostet, Verrechnungssatz = was sie dem Kunden kostet (beides in € je Stunde). */
export type Lohngruppe = { id: string; name: string; lohnkosten: number; verrechnungssatz: number };

export type KalkulationEinstellungen = { zuschlaege: Zuschlaege; lohngruppen: Lohngruppe[] };

/** Zusammensetzung einer Leistung; Beträge in € je Einheit der Leistung, Lohn in Minuten je Einheit. */
export type KalkulationEingabe = {
  lohngruppeId: string;
  lohnMinuten: number;
  material: number;
  geraete: number;
  fremdleistung: number;
  sonstiges: number;
};

export type KalkulationErgebnis = {
  ek: Record<Kostenart, number>;
  vk: Record<Kostenart, number>;
  ekGesamt: number;
  /** Summe der Verkaufspreise der Kostenarten (der kalkulierte Preis) */
  vkGesamt: number;
  /** Zuschlag in Prozent, der zusammen mit den Kosten den Verkaufspreis ergibt (so wird die Leistung gespeichert) */
  zuschlagProzent: number;
  /** Verkaufspreis, der dann in der Datenbank steht: Kosten × (1 + Zuschlag). Weicht nur bei hohen Kosten (über etwa 100 € je Einheit) um einige Cent von `vkGesamt` ab. */
  vkGespeichert: number;
};

export const STANDARD_EINSTELLUNGEN: KalkulationEinstellungen = {
  zuschlaege: { material: 40, geraete: 5, fremdleistung: 0, sonstiges: 3 },
  lohngruppen: [{ id: "standard", name: "Standard", lohnkosten: 24.88, verrechnungssatz: 47.5 }],
};

export const LEERE_KALKULATION: KalkulationEingabe = { lohngruppeId: "", lohnMinuten: 0, material: 0, geraete: 0, fremdleistung: 0, sonstiges: 0 };

const runde = (wert: number, stellen: number) => {
  const f = 10 ** stellen;
  return Math.round(wert * f + Number.EPSILON * Math.sign(wert)) / f;
};

/** Zuschlag in Prozent, der sich beim Lohn aus der Lohngruppe ergibt (z. B. 47,50 € ÷ 24,88 € = 90,92 %). Nur zur Anzeige. */
export function lohnZuschlagProzent(g: Pick<Lohngruppe, "lohnkosten" | "verrechnungssatz">): number {
  return g.lohnkosten > 0 ? runde((g.verrechnungssatz / g.lohnkosten - 1) * 100, 2) : 0;
}

/**
 * Zuschlag (auf 2 Nachkommastellen, 0 bis 999,99), mit dem `vkBerechnen(ek, zuschlag)` den Verkaufspreis `vk` ergibt.
 * Nimmt den rechnerischen Wert und sucht in der Nähe den, der auf den Cent trifft. Bei hohen Kosten (über etwa 100 € je Einheit)
 * ist ein Hundertstel Prozent Zuschlag mehr als ein Cent, dann gilt der nächstbeste Wert.
 */
export function effektiverZuschlag(ek: number, vk: number): number {
  if (ek <= 0 || vk <= ek) return 0;
  const start = Math.min(999.99, Math.max(0, Math.round((vk / ek - 1) * 10_000) / 100));
  let beste = start;
  let besteAbweichung = Infinity;
  for (let d = 0; d <= 10; d++) {
    for (const richtung of d === 0 ? [1] : [1, -1]) {
      const z = Math.round((start + (richtung * d) / 100) * 100) / 100;
      if (z < 0 || z > 999.99) continue;
      const abweichung = Math.abs(Math.round(vkBerechnen(ek, z) * 100) - Math.round(vk * 100));
      if (abweichung === 0) return z;
      if (abweichung < besteAbweichung) {
        beste = z;
        besteAbweichung = abweichung;
      }
    }
  }
  return beste;
}

/** Lohngruppe zur ID; unbekannt oder leer = die erste. */
export function lohngruppeFinden(einst: KalkulationEinstellungen, id: string): Lohngruppe | null {
  return einst.lohngruppen.find((g) => g.id === id) ?? einst.lohngruppen[0] ?? null;
}

export function kalkulieren(e: KalkulationEingabe, einst: KalkulationEinstellungen): KalkulationErgebnis {
  const g = lohngruppeFinden(einst, e.lohngruppeId);
  const stunden = e.lohnMinuten / 60;
  const ek: Record<Kostenart, number> = {
    lohn: g ? runde(stunden * g.lohnkosten, 4) : 0,
    material: runde(e.material, 4),
    geraete: runde(e.geraete, 4),
    fremdleistung: runde(e.fremdleistung, 4),
    sonstiges: runde(e.sonstiges, 4),
  };
  // Jede Kostenart wird für sich auf Cent gerundet; so addieren sich die gezeigten Zeilen genau zur Summe.
  const vk: Record<Kostenart, number> = {
    lohn: g ? runde(stunden * g.verrechnungssatz, 2) : 0,
    material: vkBerechnen(ek.material, einst.zuschlaege.material),
    geraete: vkBerechnen(ek.geraete, einst.zuschlaege.geraete),
    fremdleistung: vkBerechnen(ek.fremdleistung, einst.zuschlaege.fremdleistung),
    sonstiges: vkBerechnen(ek.sonstiges, einst.zuschlaege.sonstiges),
  };
  const ekGesamt = runde(KOSTENARTEN.reduce((s, a) => s + ek[a], 0), 4);
  const vkGesamt = runde(KOSTENARTEN.reduce((s, a) => s + Math.round(vk[a] * 100), 0) / 100, 2);
  const zuschlagProzent = effektiverZuschlag(ekGesamt, vkGesamt);
  return { ek, vk, ekGesamt, vkGesamt, zuschlagProzent, vkGespeichert: vkBerechnen(ekGesamt, zuschlagProzent) };
}

/** Passt die Kalkulation in die Grenzen der Datenbank (Kosten höchstens 1.000.000 €)? */
export function kalkulationInGrenzen(r: KalkulationErgebnis): boolean {
  return r.ekGesamt <= MAX_PREIS && r.vkGesamt <= MAX_PREIS * 10;
}

// ---------------------------------------------------------------------------
// Gespeicherte JSON-Werte lesen (robust: Kaputtes oder Fehlendes fällt auf Startwerte zurück)
// ---------------------------------------------------------------------------

const zahl = (w: unknown, standard = 0) => (typeof w === "number" && Number.isFinite(w) ? w : typeof w === "string" && w.trim() !== "" && Number.isFinite(Number(w)) ? Number(w) : standard);

/** Gespeicherte JSON-Werte robust lesen (kaputte oder fehlende Einträge fallen auf die Startwerte zurück). */
export function einstellungenAusJson(zuschlaege: unknown, lohngruppen: unknown): KalkulationEinstellungen {
  const z = (zuschlaege && typeof zuschlaege === "object" ? zuschlaege : {}) as Record<string, unknown>;
  const standard = STANDARD_EINSTELLUNGEN;
  const gruppen: Lohngruppe[] = Array.isArray(lohngruppen)
    ? lohngruppen.flatMap((g): Lohngruppe[] => {
        if (!g || typeof g !== "object") return [];
        const r = g as Record<string, unknown>;
        if (typeof r.id !== "string" || typeof r.name !== "string") return [];
        return [{ id: r.id, name: r.name, lohnkosten: zahl(r.lohnkosten), verrechnungssatz: zahl(r.verrechnungssatz) }];
      })
    : [];
  return {
    zuschlaege: {
      material: zahl(z.material, standard.zuschlaege.material),
      geraete: zahl(z.geraete, standard.zuschlaege.geraete),
      fremdleistung: zahl(z.fremdleistung, standard.zuschlaege.fremdleistung),
      sonstiges: zahl(z.sonstiges, standard.zuschlaege.sonstiges),
    },
    lohngruppen: gruppen.length ? gruppen : standard.lohngruppen,
  };
}

/** Gespeicherte Zusammensetzung einer Leistung lesen (leer oder kaputt = keine Kalkulation). */
export function kalkulationAusJson(wert: unknown): KalkulationEingabe | null {
  if (!wert || typeof wert !== "object") return null;
  const r = wert as Record<string, unknown>;
  return {
    lohngruppeId: typeof r.lohngruppeId === "string" ? r.lohngruppeId : "",
    lohnMinuten: zahl(r.lohnMinuten),
    material: zahl(r.material),
    geraete: zahl(r.geraete),
    fremdleistung: zahl(r.fremdleistung),
    sonstiges: zahl(r.sonstiges),
  };
}
