// Kennzeichen einheitlich schreiben (auch im Browser nutzbar).

/** Deutsches Kennzeichen: Ort (1–3 Buchstaben), Buchstaben (1–2), Zahl (1–4), optional E/H. */
const KENNZEICHEN = /^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*(\d{1,4})\s*([EH])?$/;

/**
 * Kennzeichen vereinheitlichen: Großbuchstaben, „CLP-DE 101“.
 * Passt es nicht zum deutschen Muster, wird es nur aufgeräumt (Leerzeichen, Großschreibung)
 * und trotzdem angenommen, solange es nur Buchstaben, Ziffern, Leerzeichen und Bindestriche enthält.
 * Unbrauchbare Eingaben geben null zurück.
 */
export function kennzeichenNormalisieren(eingabe: string): string | null {
  const roh = eingabe.trim().toUpperCase().replace(/\s+/g, " ");
  if (roh.length < 3 || roh.length > 14) return null;
  const treffer = KENNZEICHEN.exec(roh);
  if (treffer) return `${treffer[1]}-${treffer[2]} ${treffer[3]}${treffer[4] ?? ""}`;
  return /^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 -]*$/.test(roh) ? roh : null;
}
