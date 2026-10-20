import { NextResponse } from "next/server";
import { angebotPdfErzeugen } from "@/lib/angebot-pdf-daten";
import { freigabeFinden, pdfHeruntergeladen } from "@/lib/angebot-freigabe-daten";
import { createAdminClient } from "@/lib/supabase/admin";

// Öffentliche PDF-Adresse für den Link in der Angebots-Mail. Kein Login: Der Schlüssel im Link ist die Berechtigung (48 zufällige Hex-Zeichen,
// in der Datenbank nur als Hash, 90 Tage gültig, widerrufbar). Ausnahme der Regel „Dienst-Client nur nach requireRole(admin)“, siehe CLAUDE.md.

export const dynamic = "force-dynamic";

export async function GET(anfrage: Request, { params }: RouteContext<"/angebot/[token]/pdf">) {
  const { token } = await params;
  const db = createAdminClient();
  const freigabe = await freigabeFinden(db, token);
  if (!freigabe) return new NextResponse("Dieser Link ist nicht mehr gültig.", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  const pdf = await angebotPdfErzeugen(freigabe.quoteId, db);
  if (!pdf) return new NextResponse("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });

  const herunterladen = new URL(anfrage.url).searchParams.get("download") === "1";
  if (herunterladen) await pdfHeruntergeladen(db, freigabe.id);
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${herunterladen ? "attachment" : "inline"}; filename="${pdf.dateiname}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
