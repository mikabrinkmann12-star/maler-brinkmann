import "server-only";
import { chatText, hinweisTitel, hinweisZiel, nachZeitSortieren, type Benachrichtigung } from "@/lib/benachrichtigung";
import { createClient } from "@/lib/supabase/server";

// Benachrichtigungen fürs Büro. Wer sie aufruft, hat vorher requireRole(BUERO_ROLLEN) geprüft; gelesen wird mit den Rechten des Nutzers (RLS).

/** Hinweise (letzte 50, gelesen und ungelesen) plus je Projekt mit ungelesenen Chat-Nachrichten ein Eintrag. */
export async function benachrichtigungenLaden(): Promise<Benachrichtigung[]> {
  const supabase = await createClient();
  const [{ data: hinweise }, { data: chat }] = await Promise.all([
    supabase.from("notifications").select("id, typ, text, project_id, created_at, gelesen_am").order("created_at", { ascending: false }).limit(50),
    supabase.rpc("chat_ungelesen"),
  ]);

  const chatProjekte = (chat ?? []).filter((c) => Number(c.anzahl) > 0);
  let projekte = new Map<string, string>();
  const letzte = new Map<string, { zeit: string; text: string }>();
  if (chatProjekte.length) {
    const ids = chatProjekte.map((c) => c.project_id);
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from("projects").select("id, name").in("id", ids),
      supabase.from("project_messages").select("project_id, text, created_at").in("project_id", ids).is("archiviert_am", null).order("created_at", { ascending: false }).limit(200),
    ]);
    projekte = new Map((p ?? []).map((x) => [x.id, x.name]));
    for (const n of m ?? []) if (!letzte.has(n.project_id)) letzte.set(n.project_id, { zeit: n.created_at, text: n.text });
  }

  const liste: Benachrichtigung[] = [
    ...(hinweise ?? []).map((h): Benachrichtigung => ({
      id: `h-${h.id}`,
      art: "hinweis",
      titel: hinweisTitel(h.typ),
      text: h.text,
      href: hinweisZiel(h),
      zeit: h.created_at,
      gelesen: h.gelesen_am != null,
      hinweisId: h.id,
    })),
    ...chatProjekte.map((c): Benachrichtigung => {
      const l = letzte.get(c.project_id);
      return {
        id: `c-${c.project_id}`,
        art: "chat",
        titel: `Projektchat: ${projekte.get(c.project_id) ?? "Projekt"}`,
        text: chatText(Number(c.anzahl), l?.text ?? null),
        href: `/baustellen/${c.project_id}/chat`,
        zeit: l?.zeit ?? new Date().toISOString(),
        gelesen: false,
      };
    }),
  ];
  return nachZeitSortieren(liste);
}

/** Zahl der ungelesenen Benachrichtigungen (Hinweise + Projekte mit neuen Chat-Nachrichten) für die Glocke. */
export async function ungelesenZaehler(): Promise<number> {
  const supabase = await createClient();
  const [{ count }, { data: chat }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("gelesen_am", null),
    supabase.rpc("chat_ungelesen"),
  ]);
  return (count ?? 0) + (chat ?? []).filter((c) => Number(c.anzahl) > 0).length;
}
