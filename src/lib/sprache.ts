// Dünne Hülle um die Spracherkennung des Browsers (Web Speech API).
// Chrome schickt die Aufnahme an Google, Safari an Apple. Firefox kann es nicht.

type ErgebnisListe = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;

export type Spracherkennung = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ErgebnisListe }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type Konstruktor = new () => Spracherkennung;

function konstruktor(): Konstruktor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Konstruktor; webkitSpeechRecognition?: Konstruktor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function spracheVerfuegbar(): boolean {
  return konstruktor() !== null;
}

export function spracherkennungErstellen(): Spracherkennung | null {
  const K = konstruktor();
  if (!K) return null;
  const e = new K();
  e.lang = "de-DE";
  e.continuous = true;
  e.interimResults = true;
  return e;
}

export function sprachFehlerText(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Mikrofon nicht erlaubt. Bitte im Browser den Mikrofon-Zugriff für diese Seite erlauben.";
    case "no-speech":
      return "Nichts gehört – bitte nochmal versuchen.";
    case "audio-capture":
      return "Kein Mikrofon gefunden.";
    case "network":
      return "Für die Spracherkennung wird Internet gebraucht.";
    default:
      return "Die Spracherkennung hat nicht geklappt.";
  }
}
