"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Zeile = { sprecher: "KI" | "Anrufer"; text: string };

/** Zerlegt den Gesprächstext („KI: …“ / „Anrufer: …“ je Zeile) in Sprecher und Text. */
export function gespraechZeilen(transkript: string): Zeile[] {
  return transkript
    .split("\n")
    .map((z) => /^(KI|Anrufer):\s*(.+)$/.exec(z.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ sprecher: m[1] as "KI" | "Anrufer", text: m[2] }));
}

const keinAbo = () => () => {};
const kannSprechen = () => typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Spielt das Gespräch mit der Sprachausgabe des Browsers vor: die KI mit einer deutschen Stimme, der Anrufer mit einer tieferen.
 * Das ist nur eine Hörprobe mit der Browser-Stimme. Die echte KI-Stimme kommt vom Telefon-Dienst, der später angebunden wird.
 */
export function GespraechAbspielen({ transkript }: { transkript: string }) {
  const verfuegbar = useSyncExternalStore(keinAbo, kannSprechen, () => false);
  const [spielt, setSpielt] = useState(false);
  const lauf = useRef(0);

  useEffect(() => () => { if (kannSprechen()) window.speechSynthesis.cancel(); }, []);

  const zeilen = gespraechZeilen(transkript);
  if (!verfuegbar || zeilen.length === 0) return null;

  function stoppen() {
    lauf.current += 1;
    window.speechSynthesis.cancel();
    setSpielt(false);
  }

  function starten() {
    window.speechSynthesis.cancel();
    const mein = ++lauf.current;
    const stimmen = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("de"));
    const weiblich = stimmen.find((v) => /female|weiblich|katja|anna|petra|marlene|vicki|hedda|amala/i.test(v.name)) ?? stimmen[0];
    const maennlich = stimmen.find((v) => /male|männlich|conrad|stefan|killian|markus|hans|jonas/i.test(v.name) && v !== weiblich) ?? stimmen.find((v) => v !== weiblich) ?? weiblich;
    setSpielt(true);
    zeilen.forEach((z, i) => {
      const u = new SpeechSynthesisUtterance(z.text);
      u.lang = "de-DE";
      const ki = z.sprecher === "KI";
      const stimme = ki ? weiblich : maennlich;
      if (stimme) u.voice = stimme;
      u.rate = ki ? 1 : 1.05;
      u.pitch = ki ? 1.1 : stimmen.length > 1 ? 0.9 : 0.7;
      if (i === zeilen.length - 1) u.onend = () => { if (lauf.current === mein) setSpielt(false); };
      u.onerror = () => { if (lauf.current === mein) setSpielt(false); };
      window.speechSynthesis.speak(u);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={spielt ? stoppen : starten}>
        {spielt ? <><SquareIcon /> Stopp</> : <><PlayIcon /> Gespräch anhören</>}
      </Button>
      <span className="text-xs text-muted-foreground">Hörprobe mit der Stimme deines Browsers, nicht die endgültige KI-Stimme.</span>
    </div>
  );
}
