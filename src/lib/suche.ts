/** Suchtext für PostgREST-Filter entschärfen (keine Sonderzeichen der Filtersprache). */
export function suchtext(roh: string): string {
  return roh.replace(/[^\p{L}\p{N} .\-@/]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
