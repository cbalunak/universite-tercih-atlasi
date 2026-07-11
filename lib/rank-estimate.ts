import type { ProgramDto } from "@/types/program";

export function estimateSuccessRank(program: ProgramDto, targetYear = 2026) {
  const points = program.years
    .map((year) => ({ year: year.year, rank: year.successRank }))
    .filter((point): point is { year: number; rank: number } => point.year >= 2023 && point.rank !== null && point.rank > 0);

  if (points.length === 0) return null;
  if (points.length === 1) return points[0].rank;

  const meanYear = points.reduce((total, point) => total + point.year, 0) / points.length;
  const meanRank = points.reduce((total, point) => total + point.rank, 0) / points.length;
  const variance = points.reduce((total, point) => total + (point.year - meanYear) ** 2, 0);
  if (variance === 0) return Math.round(meanRank);

  const covariance = points.reduce((total, point) => total + (point.year - meanYear) * (point.rank - meanRank), 0);
  const slope = covariance / variance;
  const estimate = meanRank + slope * (targetYear - meanYear);

  return Math.max(1, Math.round(estimate));
}
