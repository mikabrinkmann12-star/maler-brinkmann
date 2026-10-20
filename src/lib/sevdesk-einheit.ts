/** Bezeichner einer Einheit vergleichbar machen: „Std.“ = „std“, „m²“ = „m2“. */
export function einheitSchluessel(name: string): string {
  return name.toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/[.\s]/g, "");
}
