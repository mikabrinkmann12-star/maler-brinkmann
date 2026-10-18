import Image from "next/image";
import { cn } from "cn";

/** Firmenlogo (public/logo.png, erzeugt mit `npm run icons`). Die Breite bestimmt die Größe, z. B. className="w-40". */
export function AppLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Maler Brinkmann"
      width={700}
      height={382}
      priority
      className={cn("h-auto w-36 shrink-0", className)}
    />
  );
}
