// Liefert die Kennung der gerade laufenden Version (siehe next.config.ts).
// Die App im Browser vergleicht sie mit ihrer eigenen und zeigt bei
// Unterschied „Neue Version – neu laden“. Ohne Login erreichbar (siehe proxy.ts).

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "lokal" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
