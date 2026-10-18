"use client";

import { createContext, useContext } from "react";

/** Zahl der ungelesenen Benachrichtigungen (Glocke in der Seitenleiste); die Fenster aktualisieren sie, die Navigation zeigt sie an. */
export const BueroKontext = createContext<{ ungelesen: number; setUngelesen: (n: number) => void }>({ ungelesen: 0, setUngelesen: () => {} });

export const useBuero = () => useContext(BueroKontext);

/** Ereignisse, mit denen die Menüeinträge die Fenster öffnen (Fenster hängen einmal im Rahmen). */
export const SUCHE_OEFFNEN = "buero:suche-oeffnen";
export const BENACHRICHTIGUNGEN_OEFFNEN = "buero:benachrichtigungen-oeffnen";

/** „Neue Zeit“ als Fenster (Menü-Plus, Zeiten-Seite, Suche). Mit `detail: { person?, datum? }` vorbelegbar. */
export const NEUE_ZEIT_OEFFNEN = "buero:neue-zeit-oeffnen";
export type NeueZeitVorgabe = { person?: string; datum?: string };
