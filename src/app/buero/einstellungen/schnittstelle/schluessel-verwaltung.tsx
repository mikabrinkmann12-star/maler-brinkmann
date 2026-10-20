"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { API_SCOPES, API_SCOPE_NAMEN, type ApiScope } from "@/lib/api-schluessel";
import { apiSchluesselAnlegen, apiSchluesselWiderrufen } from "./actions";

const EINGABE = "h-8 w-full max-w-sm rounded-md border border-border bg-white px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/** Neuen API-Schlüssel anlegen (Name + Rechte). Der Schlüssel wird nur einmal angezeigt. */
export function SchluesselAnlegen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["lesen"]);
  const [neu, setNeu] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function anlegen() {
    setFehler(null);
    starte(async () => {
      const r = await apiSchluesselAnlegen({ name, scopes });
      if (r.fehler) return setFehler(r.fehler);
      setNeu(r.klartext ?? null);
      setName("");
      router.refresh();
    });
  }

  async function kopieren() {
    if (!neu) return;
    try {
      await navigator.clipboard.writeText(neu);
      setKopiert(true);
    } catch {
      toast.error("Kopieren hat nicht geklappt. Bitte den Schlüssel von Hand markieren.");
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-white p-4">
      <h2 className="text-[15px] font-semibold">Neuen Schlüssel anlegen</h2>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">Name</span>
        <input value={name} onChange={(e) => { setName(e.target.value); setFehler(null); }} maxLength={80} placeholder="z. B. Jarvis" className={EINGABE} />
      </label>
      <fieldset className="flex flex-col gap-1.5 text-[13px]">
        <legend className="mb-1 font-medium">Rechte</legend>
        {API_SCOPES.map((s) => (
          <label key={s} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={scopes.includes(s)}
              onChange={(e) => { setScopes((alt) => (e.target.checked ? [...alt, s] : alt.filter((x) => x !== s))); setFehler(null); }}
              className="mt-0.5"
            />
            <span>{API_SCOPE_NAMEN[s]}</span>
          </label>
        ))}
      </fieldset>
      {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}
      <div>
        <Button type="button" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={anlegen}>
          <KeyRoundIcon className="size-3.5" /> {laeuft ? "Legt an …" : "Schlüssel anlegen"}
        </Button>
      </div>

      {neu && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-950">
          <p className="font-semibold">Dein neuer Schlüssel (wird nur jetzt einmal angezeigt):</p>
          <code className="rounded bg-white px-2 py-1.5 break-all select-all">{neu}</code>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" onClick={kopieren}>
              {kopiert ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />} {kopiert ? "Kopiert" : "Kopieren"}
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-3 text-[13px]" onClick={() => { setNeu(null); setKopiert(false); }}>Fertig, ich habe ihn gespeichert</Button>
          </div>
          <p>Speichere ihn sofort an einem sicheren Ort (z. B. Passwort-Manager). Später ist er nicht mehr lesbar; geht er verloren, legst du einen neuen an und widerrufst den alten.</p>
        </div>
      )}
    </section>
  );
}

/** Widerruf mit Bestätigung. */
export function Widerrufen({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={laeuft}
      onClick={() => {
        if (!window.confirm(`Den Schlüssel „${name}“ widerrufen? Programme, die ihn benutzen, funktionieren dann nicht mehr. Das lässt sich nicht rückgängig machen.`)) return;
        starte(async () => {
          const r = await apiSchluesselWiderrufen(id);
          if (r.fehler) toast.error(r.fehler);
          else toast.success("Schlüssel widerrufen.");
          router.refresh();
        });
      }}
    >
      Widerrufen
    </Button>
  );
}
