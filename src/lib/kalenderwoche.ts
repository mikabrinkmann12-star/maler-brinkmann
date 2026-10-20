// ISO-Kalenderwoche (auch im Browser nutzbar).

/** ISO-Kalenderwoche („KW 43“) eines Tages „JJJJ-MM-TT“ (der Donnerstag der Woche bestimmt das Jahr). */
export function kalenderwoche(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const wochentag = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() + 3 - wochentag);
  const ersterJanuar = Date.UTC(d.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((d.getTime() - ersterJanuar) / 86_400_000 / 7);
}
