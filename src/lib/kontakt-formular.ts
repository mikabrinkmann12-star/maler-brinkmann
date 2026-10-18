// Startwerte des Kontaktformulars (als Text). Eigene Datei, weil Seiten auf dem Server sie brauchen und das Formular selbst nur im Browser läuft.

export type KontaktFormWerte = {
  typ: "privat" | "firma";
  kundennummer: string;
  firmenname: string;
  anrede: string;
  vorname: string;
  nachname: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  mobil: string;
  website: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  farbe: string;
  empfaenger: string;
  zahlungsziel_tage: string;
  skonto_prozent: string;
  skonto_tage: string;
  steuersatz: string;
  leitweg_id: string;
  notizen: string;
};

export const LEERES_FORMULAR: KontaktFormWerte = {
  typ: "privat", kundennummer: "", firmenname: "", anrede: "", vorname: "", nachname: "", ansprechpartner: "",
  email: "", telefon: "", mobil: "", website: "", strasse: "", plz: "", ort: "", land: "Deutschland", farbe: "", empfaenger: "",
  zahlungsziel_tage: "", skonto_prozent: "", skonto_tage: "", steuersatz: "19", leitweg_id: "", notizen: "",
};
