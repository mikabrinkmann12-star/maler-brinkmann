import { PhoneIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { telLink } from "@/lib/projekt";

/** Runder Anruf-Knopf (nur wenn es eine Nummer gibt). */
export function AnrufLink({ nummer, name }: { nummer: string | null | undefined; name: string }) {
  const link = telLink(nummer);
  if (!link) return null;
  return (
    <a href={link} aria-label={`${name} anrufen`} className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
      <PhoneIcon />
    </a>
  );
}
