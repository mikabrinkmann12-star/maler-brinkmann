import { describe, expect, it } from "vitest";
import { chatText, hinweisTitel, hinweisZiel, nachZeitSortieren, ungelesene, type Benachrichtigung } from "./benachrichtigung";

const b = (id: string, zeit: string, gelesen: boolean): Benachrichtigung => ({ id, art: "hinweis", titel: "", text: "", href: null, zeit, gelesen });

describe("Benachrichtigungen", () => {
  it("Titel und Ziel eines Hinweises", () => {
    expect(hinweisTitel("urlaubsantrag")).toBe("Urlaubsantrag");
    expect(hinweisTitel("unbekannt")).toBe("Hinweis");
    expect(hinweisZiel({ typ: "kollege_hinzugefuegt", project_id: "p1" })).toBe("/baustellen/p1");
    expect(hinweisZiel({ typ: "urlaubsantrag", project_id: null })).toBe("/buero/urlaub");
    expect(hinweisZiel({ typ: "termin", project_id: null })).toBe("/buero/plantafel/termine");
    expect(hinweisZiel({ typ: "x", project_id: null })).toBeNull();
  });
  it("Chat-Text mit Vorschau, lange Texte werden gekürzt", () => {
    expect(chatText(1, null)).toBe("1 neue Nachricht");
    expect(chatText(3, "Wir sind\n  fertig")).toBe("3 neue Nachrichten: Wir sind fertig");
    expect(chatText(2, "a".repeat(100))).toBe(`2 neue Nachrichten: ${"a".repeat(80)}…`);
  });
  it("sortiert neueste zuerst und findet Ungelesene", () => {
    const liste = [b("alt", "2026-10-01T10:00:00Z", true), b("neu", "2026-10-18T10:00:00Z", false), b("mitte", "2026-10-10T10:00:00Z", false)];
    expect(nachZeitSortieren(liste).map((x) => x.id)).toEqual(["neu", "mitte", "alt"]);
    expect(ungelesene(liste).map((x) => x.id)).toEqual(["neu", "mitte"]);
  });
});
