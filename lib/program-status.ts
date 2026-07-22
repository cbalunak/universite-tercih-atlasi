import type { ProgramDto } from "@/types/program";

function hasScoreOrRank(value: number | null | undefined) {
  return typeof value === "number" && value > 0;
}

export function isNewProgram(program: ProgramDto) {
  return program.years.every((year) => !hasScoreOrRank(year.lowestScore) && !hasScoreOrRank(year.successRank));
}

export function quotaChangeDirection(program: ProgramDto) {
  const currentQuota = program.latest?.quota ?? null;
  const previousQuota = program.years.find((year) => year.year === 2024)?.quota ?? null;

  if (currentQuota === null || previousQuota === null || currentQuota === previousQuota) return null;
  return currentQuota > previousQuota ? "up" : "down";
}
