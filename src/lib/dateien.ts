// Dateien in der Ablage eines Projekts (auch im Browser nutzbar): erlaubte Typen, Größe, Pfade.
// Bilder gehören zu den Fotos, hier liegen Dokumente (PDF, Word, Excel …).

export const DATEI_MAX_BYTES = 20 * 1024 * 1024;

/** Endung → Dateityp (so wie der Speicher ihn erlaubt). Manche Browser melden bei Office-Dateien keinen Typ, dann gilt die Endung. */
export const ENDUNG_ZU_TYP: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

/** Wert für das `accept`-Attribut des Dateiwählers. */
export const DATEI_ACCEPT = Object.keys(ENDUNG_ZU_TYP).map((e) => `.${e}`).join(",");

export function endungVon(dateiname: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(dateiname.trim());
  return m ? m[1].toLowerCase() : "";
}

export type DateiPruefung = { ok: true; typ: string; endung: string } | { ok: false; fehler: string };

/** Datei prüfen: erlaubte Endung, Größe, nicht leer. */
export function dateiPruefen(name: string, groesse: number): DateiPruefung {
  const endung = endungVon(name);
  const typ = ENDUNG_ZU_TYP[endung];
  if (!typ) return { ok: false, fehler: `„${name}“: Dieser Dateityp ist nicht erlaubt. Erlaubt sind PDF, Word, Excel, PowerPoint, Text, CSV und ZIP. Bilder lädst du bei den Fotos hoch.` };
  if (groesse <= 0) return { ok: false, fehler: `„${name}“ ist leer.` };
  if (groesse > DATEI_MAX_BYTES) return { ok: false, fehler: `„${name}“ ist zu groß (höchstens 20 MB).` };
  return { ok: true, typ, endung };
}

/** Speicherpfad: <Projekt>/<Datei-ID>.<Endung> (der Originalname steht nur in der Datenbank). */
export function dateiPfad(projektId: string, dateiId: string, endung: string): string {
  return `${projektId}/${dateiId}.${endung}`;
}

/** „1,2 MB“, „340 KB“, „12 Byte“ */
export function groesseText(bytes: number): string {
  if (bytes < 1024) return `${bytes} Byte`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
