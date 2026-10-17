"use client";

import { Auswahl } from "@/components/feld";
import type { Textvorlage } from "@/lib/textvorlagen";

/** Auswahl „Vorlage einsetzen“: Der Text der gewählten Vorlage ersetzt den Text im Feld darunter und bleibt änderbar. */
export function VorlagenAuswahl({
  vorlagen,
  gesperrt,
  onWahl,
}: {
  vorlagen: Textvorlage[];
  gesperrt: boolean;
  onWahl: (inhalt: string) => void;
}) {
  if (gesperrt || vorlagen.length === 0) return null;
  return (
    <Auswahl
      aria-label="Textvorlage einsetzen"
      value=""
      onChange={(e) => {
        const v = vorlagen.find((x) => x.id === e.target.value);
        if (v) onWahl(v.inhalt);
      }}
      className="h-10 max-w-xs text-sm"
    >
      <option value="">Vorlage einsetzen …</option>
      {vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}{v.standard ? " (Standard)" : ""}</option>)}
    </Auswahl>
  );
}
