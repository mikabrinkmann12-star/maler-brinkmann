import { cn } from "cn";

/** Fehler- oder Hinweistext über einem Formular. */
export function FormularMeldung({
  art = "fehler",
  children,
}: {
  art?: "fehler" | "hinweis";
  children: React.ReactNode;
}) {
  return (
    <p
      role={art === "fehler" ? "alert" : "status"}
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        art === "fehler"
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-50 text-amber-900",
      )}
    >
      {children}
    </p>
  );
}
