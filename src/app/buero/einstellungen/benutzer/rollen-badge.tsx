import { Badge } from "@/components/ui/badge";
import { ROLLEN_NAMEN, type Rolle } from "@/lib/rollen";

const VARIANTE = {
  admin: "default",
  buero: "secondary",
  mitarbeiter: "outline",
} as const;

export function RollenBadge({ rolle }: { rolle: Rolle }) {
  return <Badge variant={VARIANTE[rolle]}>{ROLLEN_NAMEN[rolle]}</Badge>;
}

export function StatusBadges({
  aktiv,
  mussPasswortAendern,
}: {
  aktiv: boolean;
  mussPasswortAendern: boolean;
}) {
  return (
    <>
      {!aktiv && <Badge variant="destructive">Gesperrt</Badge>}
      {aktiv && mussPasswortAendern && (
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
          Startpasswort
        </Badge>
      )}
    </>
  );
}
