export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("tr-TR").format(value);
}

export function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

export function riskLabel(userRank: number | null, programRanks: Array<number | null | undefined>) {
  if (!userRank) return null;
  const ranks = programRanks.filter((rank): rank is number => typeof rank === "number" && rank > 0);
  if (ranks.length === 0) return "Sıralama verisi yok";

  const latest = ranks.at(-1) ?? ranks[0];
  const median = [...ranks].sort((a, b) => a - b)[Math.floor(ranks.length / 2)];
  const reference = Math.round((latest * 0.65 + median * 0.35));
  const ratio = userRank / reference;

  if (ratio <= 0.85) return "Güvenli";
  if (ratio <= 1.05) return "Makul";
  if (ratio <= 1.25) return "Riskli";
  return "Çok Riskli";
}
