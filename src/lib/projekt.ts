// Kleine Hilfen rund um Baustellen und Kontakte (auch im Browser nutzbar).

export type Adresse = { strasse?: string | null; plz?: string | null; ort?: string | null };

/** "Birkenweg 7, 26683 Saterland-Scharrel" (fehlende Teile werden weggelassen). */
export function adresseText(a: Adresse): string {
  const ortTeil = [a.plz, a.ort].filter(Boolean).join(" ");
  return [a.strasse, ortTeil].filter(Boolean).join(", ");
}

/** Link, der auf dem Handy die Navigation (Google Maps) öffnet. */
export function mapsLink(a: Adresse): string | null {
  const text = adresseText(a);
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : null;
}

/** "tel:"-Link aus einer Telefonnummer (nur Ziffern und führendes +). */
export function telLink(nummer: string | null | undefined): string | null {
  if (!nummer) return null;
  const sauber = nummer.trim().replace(/(?!^\+)[^\d]/g, "");
  return sauber.replace(/\D/g, "").length >= 3 ? `tel:${sauber}` : null;
}

export type KontaktName = {
  firmenname?: string | null;
  anrede?: string | null;
  vorname?: string | null;
  nachname?: string | null;
};

/** Anzeigename eines Kunden: Firma oder "Vorname Nachname". */
export function kontaktName(k: KontaktName | null | undefined): string {
  if (!k) return "";
  if (k.firmenname?.trim()) return k.firmenname.trim();
  return [k.vorname, k.nachname].filter(Boolean).join(" ").trim();
}

/** Link, der auf iPhone/Mac die Karten-App von Apple öffnet. */
export function appleMapsLink(a: Adresse): string | null {
  const text = adresseText(a);
  return text ? `https://maps.apple.com/?q=${encodeURIComponent(text)}` : null;
}

/** „mailto:“-Link, nur bei einer plausiblen Adresse. */
export function mailLink(email: string | null | undefined): string | null {
  const e = email?.trim();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? `mailto:${e}` : null;
}
