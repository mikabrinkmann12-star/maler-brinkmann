import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

/** Eine weiße Zeile mit Symbol, Text und Pfeil (Einstellungen der Mitarbeiter-App). */
export function EinstellungsZeile({
  href,
  icon,
  text,
  hinweis,
}: {
  href: string;
  icon: React.ReactNode;
  text: string;
  hinweis?: string;
}) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted">
      <span className="text-muted-foreground [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base">{text}</span>
        {hinweis && <span className="block truncate text-sm text-muted-foreground">{hinweis}</span>}
      </span>
      <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
