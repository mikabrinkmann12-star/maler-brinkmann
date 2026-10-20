import { NextResponse } from "next/server";
import { freigabeFinden, oeffnungErfassen } from "@/lib/angebot-freigabe-daten";
import { createAdminClient } from "@/lib/supabase/admin";

// Meldet, dass jemand die Online-Ansicht wirklich geöffnet hat (sendet die Seite selbst per Skript nach dem Laden).
// Mail-Programme und Virenscanner, die Links nur abrufen, führen kein Skript aus und zählen deshalb nicht als „geöffnet“.

export const dynamic = "force-dynamic";

export async function POST(_anfrage: Request, { params }: RouteContext<"/angebot/[token]/gesehen">) {
  const { token } = await params;
  const db = createAdminClient();
  const freigabe = await freigabeFinden(db, token);
  if (freigabe) await oeffnungErfassen(db, freigabe);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
