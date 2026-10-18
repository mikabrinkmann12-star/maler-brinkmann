"use client";

import { createContext, useContext } from "react";
import { STANDARD_EINHEITEN, type EinheitenEinstellungen } from "@/lib/einheiten";

/** Einheiten aus den Einstellungen für alle Eingabefelder im Büro (Vorschlagsliste und Vorauswahl). Ohne Anbieter gelten die Standardwerte. */
export const EinheitenKontext = createContext<EinheitenEinstellungen>(STANDARD_EINHEITEN);

export const useEinheiten = () => useContext(EinheitenKontext);
