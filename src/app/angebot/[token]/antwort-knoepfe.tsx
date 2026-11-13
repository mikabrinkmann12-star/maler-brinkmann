"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";

/** Annehmen/Ablehnen in der Online-Ansicht. Annehmen braucht Namen und Häkchen (verbindliche Zusage in Textform). */
export function AntwortKnoepfe({ token, betrag }: { token: string; betrag: string }) {
  const router = useRouter();
  const [modus, setModus] = useState<"" | "annehmen" | "ablehnen">("");
  const [name, setName] = useState("");
  const [grund, setGrund] = useState("");
  const [bestaetigt, setBestaetigt] = useState(false);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function senden() {
    setFehler("");
    setLaeuft(true);
    try {
      const body = modus === "annehmen" ? { antwort: "angenommen", name, bestaetigt } : { antwort: "abgelehnt", name, grund };
      const r = await fetch(`/angebot/${token}/antwort`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const daten = (await r.json().catch(() => ({}))) as { fehler?: string };
      if (!r.ok) return setFehler(daten.fehler ?? "Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.");
      router.refresh();
    } catch {
      setFehler("Keine Verbindung. Bitte versuchen Sie es noch einmal.");
    } finally {
      setLaeuft(false);
    }
  }

  const feld = "h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.6_0.135_153)]";

  if (!modus) {
    return (
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <button type="button" onClick={() => setModus("annehmen")} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[oklch(0.6_0.135_153)] px-5 text-base font-semibold text-white hover:opacity-90">
          <CheckIcon className="size-5" /> Angebot annehmen
        </button>
        <button type="button" onClick={() => setModus("ablehnen")} className="inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-base font-medium hover:bg-neutral-50">
          <XIcon className="size-5" /> Ablehnen
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h2 className="text-lg font-semibold">{modus === "annehmen" ? "Angebot annehmen" : "Angebot ablehnen"}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {modus === "annehmen" ? "Ihr Name" : "Ihr Name (freiwillig)"}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={feld} />
      </label>
      {modus === "annehmen" ? (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} className="mt-0.5 size-5 accent-[oklch(0.6_0.135_153)]" />
          <span>Ich nehme dieses Angebot über {betrag} verbindlich an und beauftrage die Arbeiten zu den darin genannten Bedingungen.</span>
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          Grund (freiwillig, hilft uns weiter)
          <textarea value={grund} onChange={(e) => setGrund(e.target.value)} maxLength={1000} rows={3} className="w-full rounded-lg border p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.6_0.135_153)]" />
        </label>
      )}
      {fehler && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{fehler}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={senden} disabled={laeuft || (modus === "annehmen" && (!bestaetigt || name.trim().length < 2))}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[oklch(0.6_0.135_153)] px-5 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {laeuft ? "Wird gesendet …" : modus === "annehmen" ? "Verbindlich annehmen" : "Ablehnung senden"}
        </button>
        <button type="button" onClick={() => { setModus(""); setFehler(""); }} disabled={laeuft} className="inline-flex h-11 items-center rounded-lg px-4 text-base hover:bg-neutral-50">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
