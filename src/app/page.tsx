import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBetrag, formatDatum } from "@/lib/format";

// Vorläufige Startseite für Schritt 0.1.
// Ab 0.3 leitet "/" je nach Rolle weiter (Mitarbeiter → /heute, Büro → /buero).
export default function Startseite() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Maler Brinkmann</CardTitle>
          <CardDescription>
            Das Grundgerüst läuft (Phase 0.1). Login und Rollen folgen in 0.3.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2 text-base">
            <dt className="text-muted-foreground">Datum</dt>
            <dd>{formatDatum(new Date())}</dd>
            <dt className="text-muted-foreground">Betrag</dt>
            <dd>{formatBetrag(1234.56)}</dd>
          </dl>
          <Button size="touch" className="w-full">
            Großer Knopf für die Baustelle
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
