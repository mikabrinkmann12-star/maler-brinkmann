import { timingSafeEqual } from "node:crypto";
import { imapKonfiguration } from "@/lib/env";
import { postfachAbrufen } from "@/lib/postfach-abruf";
import { createAdminClient } from "@/lib/supabase/admin";

// Täglicher automatischer Abruf des Rechnungs-Postfachs (Zeitplan in vercel.json).
// Kein Login: Vercel schickt „Authorization: Bearer <CRON_SECRET>“. Ohne gesetztes CRON_SECRET tut die Adresse nichts.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  const geheimnis = process.env.CRON_SECRET;
  if (!geheimnis) return Response.json({ fehler: "CRON_SECRET ist nicht gesetzt." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!gleich(request.headers.get("authorization") ?? "", `Bearer ${geheimnis}`)) {
    return Response.json({ fehler: "Nicht erlaubt." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const konfig = imapKonfiguration();
  if (!konfig) return Response.json({ fehler: "Das Postfach ist nicht eingerichtet." }, { status: 503, headers: { "Cache-Control": "no-store" } });

  // Der Firmenname steht in den Einstellungen; ohne Login geht das nur mit dem Dienst-Schlüssel
  const supabase = createAdminClient();
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "firma").maybeSingle();
  const name = typeof (data?.wert as { name?: unknown } | null)?.name === "string" ? ((data?.wert as { name: string }).name) : "";
  const ergebnis = await postfachAbrufen(supabase, konfig, [name, "Brinkmann"].filter(Boolean));
  return Response.json(ergebnis, { headers: { "Cache-Control": "no-store" } });
}
