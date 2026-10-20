import { describe, expect, it } from "vitest";
import { einsaetzeVon, filterPersonen, gewaehltePersonen, personenParam } from "./einsatz-personen";

const ich = { id: "ich", vorname: "Sebastian", nachname: "Plentner" };
const anna = { id: "anna", vorname: "Anna", nachname: "Zander" };
const bert = { id: "bert", vorname: "Bert", nachname: "Adler" };
const fremd = { id: "fremd", vorname: "Fritz", nachname: "Fremd" };
const kollegen = new Map([ich, anna, bert, fremd].map((p) => [p.id, p]));
const auto1 = { assignment_members: [{ user_id: "ich" }, { user_id: "anna" }] };
const auto2 = { assignment_members: [{ user_id: "bert" }] };

describe("filterPersonen", () => {
  it("bietet mich zuerst und dann meine Teamkollegen an, nicht Leute aus anderen Autos", () => {
    expect(filterPersonen(ich, [auto1], kollegen).map((p) => p.id)).toEqual(["ich", "anna"]);
  });
  it("sortiert die Kollegen nach Namen und zählt jeden nur einmal", () => {
    const zwei = { assignment_members: [{ user_id: "ich" }, { user_id: "anna" }, { user_id: "bert" }] };
    expect(filterPersonen(ich, [zwei, auto1], kollegen).map((p) => p.id)).toEqual(["ich", "anna", "bert"]);
  });
  it("ohne Einsatz bleibt nur ich", () => {
    expect(filterPersonen(ich, [], kollegen).map((p) => p.id)).toEqual(["ich"]);
  });
  it("lässt unbekannte Nutzer (z. B. Ehemalige) weg", () => {
    expect(filterPersonen(ich, [{ assignment_members: [{ user_id: "ich" }, { user_id: "weg" }] }], kollegen).map((p) => p.id)).toEqual(["ich"]);
  });
});

describe("gewaehltePersonen", () => {
  const erlaubt = [ich, anna];
  it("ohne Angabe nur ich", () => expect(gewaehltePersonen(undefined, erlaubt, "ich")).toEqual(["ich"]));
  it("nimmt nur erlaubte Personen (kein Zugriff auf fremde Einsätze über die Adresse)", () => {
    expect(gewaehltePersonen("anna,fremd", erlaubt, "ich")).toEqual(["anna"]);
  });
  it("nur Unerlaubtes ergibt wieder nur ich", () => expect(gewaehltePersonen("fremd", erlaubt, "ich")).toEqual(["ich"]));
  it("ignoriert Doppelte und Leerzeichen, hält die Reihenfolge der Liste", () => {
    expect(gewaehltePersonen(" anna , ich,anna", erlaubt, "ich")).toEqual(["ich", "anna"]);
  });
  it("versteht auch eine Liste von Parametern", () => expect(gewaehltePersonen(["anna", "ich"], erlaubt, "ich")).toEqual(["ich", "anna"]));
});

describe("personenParam", () => {
  it("lässt den Normalfall weg", () => expect(personenParam(["ich"], "ich")).toBeUndefined());
  it("schreibt andere Wahl hin", () => {
    expect(personenParam(["anna"], "ich")).toBe("anna");
    expect(personenParam(["ich", "anna"], "ich")).toBe("ich,anna");
  });
});

describe("einsaetzeVon", () => {
  it("findet die Einsätze einer Person", () => {
    expect(einsaetzeVon([auto1, auto2], "anna")).toEqual([auto1]);
    expect(einsaetzeVon([auto1, auto2], "niemand")).toEqual([]);
  });
});
