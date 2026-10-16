// Kleiner CSV-Leser (auch im Browser nutzbar). Kann Anführungszeichen, Zeilenumbrüche
// in Feldern, BOM und erkennt Komma oder Semikolon als Trennzeichen.

/** Trennzeichen aus der Kopfzeile erraten (außerhalb von Anführungszeichen zählen). */
export function trennzeichenErkennen(text: string): "," | ";" | "\t" {
  const kopf = text.split(/\r?\n/, 1)[0] ?? "";
  let imText = false;
  const zaehler = { ",": 0, ";": 0, "\t": 0 };
  for (const z of kopf) {
    if (z === '"') imText = !imText;
    else if (!imText && z in zaehler) zaehler[z as keyof typeof zaehler]++;
  }
  return (Object.entries(zaehler).sort((a, b) => b[1] - a[1])[0][0] as "," | ";" | "\t") ?? ",";
}

/** Text → Tabelle (Liste von Zeilen, jede eine Liste von Feldern). */
export function csvLesen(eingabe: string): string[][] {
  const text = eingabe.replace(/^﻿/, "");
  const trenner = trennzeichenErkennen(text);
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = "";
  let imText = false;

  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (imText) {
      if (z === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; }
        else imText = false;
      } else feld += z;
    } else if (z === '"') imText = true;
    else if (z === trenner) { zeile.push(feld); feld = ""; }
    else if (z === "\n" || z === "\r") {
      if (z === "\r" && text[i + 1] === "\n") i++;
      zeile.push(feld); feld = "";
      zeilen.push(zeile); zeile = [];
    } else feld += z;
  }
  if (feld !== "" || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  // Komplett leere Zeilen ignorieren
  return zeilen.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Tabelle mit Kopfzeile → Liste von Objekten (Spaltenname → Wert). */
export function csvAlsObjekte(eingabe: string): { spalten: string[]; zeilen: Record<string, string>[] } {
  const tabelle = csvLesen(eingabe);
  if (!tabelle.length) return { spalten: [], zeilen: [] };
  const spalten = tabelle[0].map((s) => s.trim());
  const zeilen = tabelle.slice(1).map((r) => Object.fromEntries(spalten.map((s, i) => [s, (r[i] ?? "").trim()])));
  return { spalten, zeilen };
}
