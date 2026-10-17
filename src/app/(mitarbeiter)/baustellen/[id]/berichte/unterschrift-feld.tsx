"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EraserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { istGezeichnet } from "@/lib/bericht";

const BREITE = 900;
const HOEHE = 300;

/**
 * Zeichenfläche für die Unterschrift mit dem Finger (oder der Maus). Meldet das fertige PNG (transparenter Hintergrund)
 * nach jedem Strich; solange nichts gezeichnet ist, kommt `null`.
 */
export function UnterschriftFeld({ onChange }: { onChange: (png: Blob | null) => void }) {
  const leinwandRef = useRef<HTMLCanvasElement>(null);
  const malt = useRef(false);
  const letzter = useRef<{ x: number; y: number } | null>(null);
  const [leer, setLeer] = useState(true);

  useEffect(() => {
    const ctx = leinwandRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const punkt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * BREITE, y: ((e.clientY - r.top) / r.height) * HOEHE };
  };

  const fertig = useCallback(() => {
    const leinwand = leinwandRef.current;
    const ctx = leinwand?.getContext("2d");
    if (!leinwand || !ctx) return;
    const bild = ctx.getImageData(0, 0, BREITE, HOEHE).data;
    const alpha = new Uint8Array(BREITE * HOEHE);
    for (let i = 0; i < alpha.length; i++) alpha[i] = bild[i * 4 + 3];
    if (!istGezeichnet(alpha)) {
      setLeer(true);
      onChange(null);
      return;
    }
    setLeer(false);
    leinwand.toBlob((blob) => onChange(blob), "image/png");
  }, [onChange]);

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    malt.current = true;
    const p = punkt(e);
    letzter.current = p;
    // Ein Tipp ergibt einen Punkt
    const ctx = e.currentTarget.getContext("2d");
    ctx?.beginPath();
    ctx?.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx?.fill();
  }

  function bewegen(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!malt.current || !letzter.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = punkt(e);
    ctx.beginPath();
    ctx.moveTo(letzter.current.x, letzter.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    letzter.current = p;
  }

  function ende() {
    if (!malt.current) return;
    malt.current = false;
    letzter.current = null;
    fertig();
  }

  function loeschen() {
    leinwandRef.current?.getContext("2d")?.clearRect(0, 0, BREITE, HOEHE);
    setLeer(true);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed bg-white">
        <canvas
          ref={leinwandRef}
          width={BREITE}
          height={HOEHE}
          aria-label="Unterschrift"
          className="aspect-[3/1] w-full touch-none"
          onPointerDown={start}
          onPointerMove={bewegen}
          onPointerUp={ende}
          onPointerCancel={ende}
          onPointerLeave={ende}
        />
        {leer && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">Hier mit dem Finger unterschreiben</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-neutral-300" />
      </div>
      <Button type="button" variant="outline" size="touch" onClick={loeschen} disabled={leer}>
        <EraserIcon /> Neu unterschreiben
      </Button>
    </div>
  );
}
