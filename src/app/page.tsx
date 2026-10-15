import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { startseiteFuer } from "@/lib/rollen";

// "/" hat keinen eigenen Inhalt: Mitarbeiter → /heute, Büro/Admin → /buero.
export default async function Startseite() {
  const nutzer = await requireUser();
  redirect(startseiteFuer(nutzer.rolle));
}
