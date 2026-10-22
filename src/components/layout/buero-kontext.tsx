"use client";

import { createContext, useContext } from "react";
import { standardRechte, type Rechte } from "@/lib/rechte";

/** Zahl der ungelesenen Benachrichtigungen (Glocke in der Seitenleiste); die Fenster aktualisieren sie, die Navigation zeigt sie an. */
/** `rechte` = Rechte des eingeloggten Nutzers (das Menü zeigt nur, was er darf; durchgesetzt wird es von Server und Datenbank). */
export const BueroKontext = createContext<{ ungelesen: number; setUngelesen: (n: number) => void; rechte: Rechte }>({
  ungelesen: 0,
  setUngelesen: () => {},
  rechte: standardRechte("admin"),
});

export const useBuero = () => useContext(BueroKontext);

/** Ereignisse, mit denen die Menüeinträge die Fenster öffnen (Fenster hängen einmal im Rahmen). */
export const SUCHE_OEFFNEN = "buero:suche-oeffnen";
export const BENACHRICHTIGUNGEN_OEFFNEN = "buero:benachrichtigungen-oeffnen";
export const JARVIS_OEFFNEN = "buero:jarvis-oeffnen";

/** „Neue Zeit“ als Fenster (Menü-Plus, Zeiten-Seite, Suche). Mit `detail: { person?, datum? }` vorbelegbar. */
export const NEUE_ZEIT_OEFFNEN = "buero:neue-zeit-oeffnen";
export type NeueZeitVorgabe = { person?: string; datum?: string };
