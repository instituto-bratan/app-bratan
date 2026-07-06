// Converte texto digitado em reais para número. Aceita os jeitos comuns de
// digitar — "1.500,00", "R$ 150", "1500.00", "150,5" — e retorna NaN quando
// não dá para entender o valor.
export function parseMoneyBR(value: string): number {
  const cleaned = (value || "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned)) return NaN;
  const negative = cleaned.trim().startsWith("-");
  const digits = cleaned.replace(/-/g, "");
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");

  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = digits;
  } else if (lastComma > lastDot) {
    // Vírgula por último = decimal brasileiro; pontos (e vírgulas extras) são milhar.
    const noDots = digits.replace(/\./g, "");
    const idx = noDots.lastIndexOf(",");
    normalized = `${noDots.slice(0, idx).replace(/,/g, "")}.${noDots.slice(idx + 1)}`;
  } else {
    // Ponto por último: é decimal quando tem 1–2 casas ("1500.00");
    // com 3+ casas é separador de milhar ("1.500").
    const decimals = digits.length - lastDot - 1;
    const noCommas = digits.replace(/,/g, "");
    if (decimals >= 1 && decimals <= 2) {
      const idx = noCommas.lastIndexOf(".");
      normalized = `${noCommas.slice(0, idx).replace(/\./g, "")}.${noCommas.slice(idx + 1)}`;
    } else {
      normalized = noCommas.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  return negative ? -parsed : parsed;
}
