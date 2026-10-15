import { startTransition, type FormEvent } from "react";

/**
 * Schickt ein Formular an eine useActionState-Aktion, OHNE dass React das
 * Formular danach automatisch zurücksetzt.
 *
 * Für Formulare mit kontrollierten Feldern (useState) verwenden: Beim
 * automatischen Zurücksetzen springt ein <select> sichtbar auf den alten Wert,
 * während intern ein anderer gilt. Das nächste Speichern würde dann den
 * angezeigten statt des gewählten Werts schicken.
 */
export function abschicken(
  ereignis: FormEvent<HTMLFormElement>,
  aktion: (daten: FormData) => void,
) {
  ereignis.preventDefault();
  const daten = new FormData(ereignis.currentTarget);
  startTransition(() => aktion(daten));
}
