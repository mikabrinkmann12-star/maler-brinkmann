// Mahnstufen einer Rechnung. Die App schreibt Zahlungserinnerung und Mahnungen selbst (PDF per E-Mail) und vermerkt, wie weit gemahnt wurde.

export const MAHNSTUFEN = [
  { stufe: 0, name: "Nicht gemahnt" },
  { stufe: 1, name: "Zahlungserinnerung" },
  { stufe: 2, name: "1. Mahnung" },
  { stufe: 3, name: "2. Mahnung" },
] as const;

export function istMahnstufe(wert: unknown): wert is 0 | 1 | 2 | 3 {
  return wert === 0 || wert === 1 || wert === 2 || wert === 3;
}

export function mahnstufeName(stufe: number): string {
  return MAHNSTUFEN.find((m) => m.stufe === stufe)?.name ?? "Nicht gemahnt";
}
