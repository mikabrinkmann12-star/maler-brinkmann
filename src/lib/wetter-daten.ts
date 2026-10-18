import "server-only";
import { WETTER_ORT, wetterAusAntwort, type WetterDaten } from "@/lib/wetter";

/** Aktuelles Wetter und die nächsten Stunden für Saterland. Bei jedem Fehler null (kein Kasten, kein Absturz). */
export async function wetterLaden(): Promise<WetterDaten | null> {
  const adresse =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${WETTER_ORT.breite}&longitude=${WETTER_ORT.laenge}` +
    "&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_min,temperature_2m_max" +
    "&forecast_hours=5&forecast_days=1&timezone=Europe%2FBerlin";
  try {
    const antwort = await fetch(adresse, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(3000) });
    if (!antwort.ok) return null;
    return wetterAusAntwort(await antwort.json());
  } catch {
    return null;
  }
}
