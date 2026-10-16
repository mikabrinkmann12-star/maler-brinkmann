// Fotos, die noch nicht hochgeladen sind, bleiben auf dem Gerät (IndexedDB),
// bis das Hochladen geklappt hat. Grund: Mit der Kamera aufgenommene Bilder
// landen auf dem iPhone nicht in den Fotos – ginge der Upload verloren, wäre
// das Bild weg. (Wie die Warteschlange, nur für große Dateien.)

export type AusstehendesFoto = {
  id: string;
  userId: string;
  projektId: string;
  kategorie: string;
  kommentar: string;
  breite: number;
  hoehe: number;
  bild: Blob;
  vorschau: Blob;
  erstelltAm: string;
  fehler?: string;
};

const DATENBANK = "mb-fotos";
const ABLAGE = "ausstehend";

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((ok, fehler) => {
    const anfrage = indexedDB.open(DATENBANK, 1);
    anfrage.onupgradeneeded = () => {
      if (!anfrage.result.objectStoreNames.contains(ABLAGE)) {
        anfrage.result.createObjectStore(ABLAGE, { keyPath: "id" });
      }
    };
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

async function vorgang<T>(modus: IDBTransactionMode, arbeit: (ablage: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await oeffnen();
  try {
    return await new Promise<T>((ok, fehler) => {
      const tx = db.transaction(ABLAGE, modus);
      const anfrage = arbeit(tx.objectStore(ABLAGE));
      tx.oncomplete = () => ok(anfrage.result);
      tx.onerror = () => fehler(tx.error);
      tx.onabort = () => fehler(tx.error);
    });
  } finally {
    db.close();
  }
}

/** false = Gerätespeicher nicht nutzbar (z. B. privater Modus). */
export async function fotoMerken(foto: AusstehendesFoto): Promise<boolean> {
  try {
    await vorgang("readwrite", (a) => a.put(foto));
    return true;
  } catch {
    return false;
  }
}

export async function ausstehendeFotos(userId: string, projektId?: string): Promise<AusstehendesFoto[]> {
  try {
    const alle = await vorgang<AusstehendesFoto[]>("readonly", (a) => a.getAll() as IDBRequest<AusstehendesFoto[]>);
    return alle
      .filter((f) => f.userId === userId && (!projektId || f.projektId === projektId))
      .sort((a, b) => a.erstelltAm.localeCompare(b.erstelltAm));
  } catch {
    return [];
  }
}

export async function fotoVergessen(id: string): Promise<void> {
  try {
    await vorgang("readwrite", (a) => a.delete(id));
  } catch {
    // nichts zu tun
  }
}
