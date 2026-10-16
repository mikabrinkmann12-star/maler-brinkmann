// Fotos vor dem Hochladen verkleinern (im Browser). Spart Datenvolumen auf der
// Baustelle und Speicher. Nebeneffekt: Die neue JPEG-Datei enthält keine
// Metadaten mehr (z. B. GPS-Position des Handys).

export const FOTO_MAX_KANTE = 1920;
export const FOTO_QUALITAET = 0.82;
export const VORSCHAU_MAX_KANTE = 480;
export const VORSCHAU_QUALITAET = 0.7;

/** Neue Größe, sodass die längere Seite höchstens maxKante ist (nie vergrößern). */
export function zielGroesse(breite: number, hoehe: number, maxKante: number): { breite: number; hoehe: number } {
  const faktor = Math.min(1, maxKante / Math.max(breite, hoehe, 1));
  return { breite: Math.max(1, Math.round(breite * faktor)), hoehe: Math.max(1, Math.round(hoehe * faktor)) };
}

/** Speicherpfade im Bucket „projektfotos“: <projekt>/<id>.jpg und die Vorschau daneben. */
export function fotoPfade(projektId: string, fotoId: string): { bild: string; vorschau: string } {
  return { bild: `${projektId}/${fotoId}.jpg`, vorschau: `${projektId}/${fotoId}_klein.jpg` };
}

/** Vorschau-Pfad zu einem gespeicherten Bild-Pfad. */
export function vorschauPfad(bildPfad: string): string {
  return bildPfad.replace(/\.jpg$/, "_klein.jpg");
}

type Quelle = ImageBitmap | HTMLImageElement;

async function laden(datei: Blob): Promise<{ quelle: Quelle; breite: number; hoehe: number; freigeben: () => void }> {
  try {
    // Dreht Handyfotos richtig herum (EXIF-Ausrichtung)
    const bitmap = await createImageBitmap(datei, { imageOrientation: "from-image" });
    return { quelle: bitmap, breite: bitmap.width, hoehe: bitmap.height, freigeben: () => bitmap.close() };
  } catch {
    // Ältere Browser: über ein <img> laden
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    return { quelle: bild, breite: bild.naturalWidth, hoehe: bild.naturalHeight, freigeben: () => URL.revokeObjectURL(url) };
  }
}

function alsJpeg(quelle: Quelle, breite: number, hoehe: number, maxKante: number, qualitaet: number) {
  const ziel = zielGroesse(breite, hoehe, maxKante);
  const leinwand = document.createElement("canvas");
  leinwand.width = ziel.breite;
  leinwand.height = ziel.hoehe;
  const ctx = leinwand.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(quelle, 0, 0, ziel.breite, ziel.hoehe);
  return new Promise<{ blob: Blob; breite: number; hoehe: number }>((ok, fehler) =>
    leinwand.toBlob(
      (blob) => (blob ? ok({ blob, ...ziel }) : fehler(new Error("Bild konnte nicht gespeichert werden."))),
      "image/jpeg",
      qualitaet,
    ),
  );
}

/** Macht aus einem Handyfoto ein verkleinertes JPEG plus eine kleine Vorschau. */
export async function fotoVorbereiten(datei: Blob) {
  const { quelle, breite, hoehe, freigeben } = await laden(datei);
  try {
    const bild = await alsJpeg(quelle, breite, hoehe, FOTO_MAX_KANTE, FOTO_QUALITAET);
    const vorschau = await alsJpeg(quelle, breite, hoehe, VORSCHAU_MAX_KANTE, VORSCHAU_QUALITAET);
    return { bild: bild.blob, vorschau: vorschau.blob, breite: bild.breite, hoehe: bild.hoehe };
  } finally {
    freigeben();
  }
}

export const FOTO_KATEGORIEN = ["vorher", "nachher", "mangel", "sonstiges"] as const;
export type FotoKategorie = (typeof FOTO_KATEGORIEN)[number];
export const FOTO_KATEGORIE_NAMEN: Record<FotoKategorie, string> = {
  vorher: "Vorher",
  nachher: "Nachher",
  mangel: "Mangel",
  sonstiges: "Sonstiges",
};
