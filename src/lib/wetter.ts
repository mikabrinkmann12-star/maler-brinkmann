// Wetter für die Büro-Startseite (Open-Meteo, kostenlos, ohne Schlüssel; es gehen nur die Koordinaten der Region raus,
// keine Daten von Kunden oder Mitarbeitern). Die Antwort wird 30 Minuten zwischengespeichert. Fällt der Dienst aus,
// fehlt einfach der Kasten.

/** Saterland (Ortsmitte), gerundet. */
export const WETTER_ORT = { name: "Saterland", breite: 53.03, laenge: 7.68 };

export type WetterStunde = { uhrzeit: string; grad: number; symbol: string; text: string };
export type WetterDaten = { ort: string; grad: number; symbol: string; text: string; minGrad: number; maxGrad: number; stunden: WetterStunde[] };

/** WMO-Wettercode → Symbol und deutscher Text. */
export function wetterCode(code: number): { symbol: string; text: string } {
  if (code === 0) return { symbol: "☀️", text: "Klar" };
  if (code === 1) return { symbol: "🌤️", text: "Überwiegend klar" };
  if (code === 2) return { symbol: "⛅", text: "Wolkig" };
  if (code === 3) return { symbol: "☁️", text: "Bewölkt" };
  if (code === 45 || code === 48) return { symbol: "🌫️", text: "Nebel" };
  if (code >= 51 && code <= 57) return { symbol: "🌦️", text: "Nieselregen" };
  if (code >= 61 && code <= 67) return { symbol: "🌧️", text: "Regen" };
  if (code >= 71 && code <= 77) return { symbol: "🌨️", text: "Schnee" };
  if (code >= 80 && code <= 82) return { symbol: "🌦️", text: "Regenschauer" };
  if (code === 85 || code === 86) return { symbol: "🌨️", text: "Schneeschauer" };
  if (code >= 95) return { symbol: "⛈️", text: "Gewitter" };
  return { symbol: "☁️", text: "Wechselhaft" };
}

type Antwort = {
  current?: { temperature_2m?: number; weather_code?: number };
  hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[] };
  daily?: { temperature_2m_min?: number[]; temperature_2m_max?: number[] };
};

/** Antwort von Open-Meteo in unsere Form bringen; bei fehlenden Werten null. */
export function wetterAusAntwort(a: Antwort | null | undefined, ort = WETTER_ORT.name): WetterDaten | null {
  const t = a?.current?.temperature_2m;
  const c = a?.current?.weather_code;
  if (typeof t !== "number" || typeof c !== "number") return null;
  const zeiten = a?.hourly?.time ?? [];
  const stunden: WetterStunde[] = zeiten.slice(0, 5).flatMap((zeit, i) => {
    const grad = a?.hourly?.temperature_2m?.[i];
    const code = a?.hourly?.weather_code?.[i];
    if (typeof grad !== "number" || typeof code !== "number") return [];
    return [{ uhrzeit: zeit.slice(11, 16), grad: Math.round(grad), ...wetterCode(code) }];
  });
  const min = a?.daily?.temperature_2m_min?.[0];
  const max = a?.daily?.temperature_2m_max?.[0];
  return {
    ort,
    grad: Math.round(t),
    ...wetterCode(c),
    minGrad: Math.round(typeof min === "number" ? min : t),
    maxGrad: Math.round(typeof max === "number" ? max : t),
    stunden,
  };
}
