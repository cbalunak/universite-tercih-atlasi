import type { Program, ProgramYear } from "@/generated/prisma/client";
import type { ProgramDto, ProgramYearDto } from "@/types/program";

type ProgramWithYears = Program & { years: ProgramYear[] };

export function yearToDto(year: ProgramYear): ProgramYearDto {
  return {
    year: year.year,
    quota: year.quota,
    placed: year.placed,
    lowestScore: year.lowestScore,
    highestScore: year.highestScore,
    successRank: year.successRank,
  };
}

export function programToDto(program: ProgramWithYears): ProgramDto {
  const years = program.years.sort((a, b) => a.year - b.year).map(yearToDto);
  return {
    code: program.code,
    universityName: program.universityName,
    originalUniversityName: program.originalUniversityName,
    facultyName: program.facultyName,
    programName: program.programName,
    scoreType: program.scoreType,
    universityType: program.universityType,
    city: program.city,
    feeType: program.feeType,
    educationType: program.educationType,
    latest: years.find((year) => year.year === 2025) ?? years.at(-1) ?? null,
    years,
  };
}
