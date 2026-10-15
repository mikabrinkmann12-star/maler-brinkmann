"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Meldet nur auf DIESEM Gerät ab (scope "local"), nicht auf allen Handys. */
export async function abmelden() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
