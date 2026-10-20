import { redirect } from "next/navigation";

// „Mehr“ gibt es nicht mehr: Die Einträge stehen jetzt unter Einstellungen (Zahnrad).
export default function MehrSeite() {
  redirect("/einstellungen");
}
