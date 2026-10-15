// Startpasswörter, die man gut vorlesen und abtippen kann,
// z. B. "Pinsel-Deich-Walze-47". Nur ASCII, keine Umlaute.
// 3 Wörter aus 48 + Zahl 10–99 ≈ 10 Mio. Möglichkeiten. Das reicht, weil das
// Startpasswort beim ersten Login geändert werden muss und Supabase
// Login-Versuche begrenzt.

const WOERTER = [
  "Pinsel", "Rolle", "Eimer", "Leiter", "Farbe", "Lack", "Wand", "Decke",
  "Tapete", "Kelle", "Putz", "Gips", "Spachtel", "Fenster", "Sockel", "Quast",
  "Walze", "Folie", "Lasur", "Kalk", "Balkon", "Garten", "Sonne", "Regen",
  "Wolke", "Anker", "Hafen", "Moor", "Deich", "Kanal", "Torf", "Boot",
  "Bruecke", "Kiefer", "Birke", "Wiese", "Feld", "Mauer", "Dach", "Giebel",
  "Treppe", "Kamin", "Brunnen", "Insel", "Strand", "Wind", "Nebel", "Stern",
] as const;

function zufallsIndex(anzahl: number): number {
  const zahl = new Uint32Array(1);
  crypto.getRandomValues(zahl);
  return zahl[0] % anzahl;
}

export function startpasswortErzeugen(): string {
  const wort = () => WOERTER[zufallsIndex(WOERTER.length)];
  const zahl = 10 + zufallsIndex(90);
  return `${wort()}-${wort()}-${wort()}-${zahl}`;
}
