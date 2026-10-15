// Hilfen für die installierbare App (nur im Browser benutzen).

/** Kennung der Version, mit der diese Seite gebaut wurde (siehe next.config.ts). */
export const EIGENE_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "lokal";

/** true, wenn der Server eine andere Version meldet als die geladene Seite. */
export function istNeueVersion(serverVersion: unknown): boolean {
  return typeof serverVersion === "string" && serverVersion !== "" && serverVersion !== EIGENE_VERSION;
}

// ---------------------------------------------------------------------------
// „App installieren“: Chrome feuert früh beim Laden ein beforeinstallprompt-
// Ereignis. Wir merken es uns hier global, damit der Knopf unter „Mehr“ es
// später auslösen kann, auch wenn die Seite erst danach geöffnet wird.
// ---------------------------------------------------------------------------
type InstallEreignis = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let gemerkt: InstallEreignis | null = null;
const zuhoerer = new Set<() => void>();

function benachrichtigen() {
  zuhoerer.forEach((f) => f());
}

export function installAngebotMerken(ereignis: Event) {
  gemerkt = ereignis as InstallEreignis;
  benachrichtigen();
}

export function installAngebotVergessen() {
  gemerkt = null;
  benachrichtigen();
}

export function installAngebotAbonnieren(f: () => void): () => void {
  zuhoerer.add(f);
  return () => zuhoerer.delete(f);
}

export function installAngebotVorhanden(): boolean {
  return gemerkt !== null;
}

/** Öffnet Chromes Installations-Dialog. true = installiert. */
export async function appInstallieren(): Promise<boolean> {
  const ereignis = gemerkt;
  if (!ereignis) return false;
  await ereignis.prompt();
  const { outcome } = await ereignis.userChoice;
  installAngebotVergessen(); // Ein Ereignis kann nur einmal benutzt werden
  return outcome === "accepted";
}
