import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { programToDto } from "@/lib/program-dto";
import { estimateSuccessRank } from "@/lib/rank-estimate";
import { isNewProgram } from "@/lib/program-status";
import type { ProgramDto } from "@/types/program";
import type { Program, ProgramYear } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

function textIncludes(value: string | null | undefined, needle: string) {
  return (value ?? "").toLocaleLowerCase("tr-TR").includes(needle.toLocaleLowerCase("tr-TR"));
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b, "tr-TR"),
  );
}

function multiValues(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function searchTokens(value: string | null) {
  return (value ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeParseStringArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function loadDisabledProgramCodes() {
  try {
    const rows = await prisma.$queryRaw<Array<{ disabledProgramsJson: string }>>`
      SELECT disabledProgramsJson
      FROM UserState
      WHERE id = 'default'
      LIMIT 1
    `;
    return new Set(safeParseStringArray(rows[0]?.disabledProgramsJson));
  } catch {
    return new Set<string>();
  }
}

function sortPrograms(items: ProgramDto[], sortKey: string, direction: string, disabledProgramCodes: Set<string>) {
  const multiplier = direction === "desc" ? -1 : 1;
  const pick = (item: ProgramDto): string | number => {
    if (sortKey === "lowestScore") return item.latest?.lowestScore ?? -1;
    if (sortKey === "disabled") return disabledProgramCodes.has(item.code) ? 1 : 0;
    if (sortKey === "estimatedRank2026") {
      return estimateSuccessRank(item) ?? (direction === "desc" ? -1 : Number.MAX_SAFE_INTEGER);
    }
    if (sortKey === "successRank") return item.latest?.successRank ?? Number.MAX_SAFE_INTEGER;
    if (sortKey === "successRank2024") return item.years.find((year) => year.year === 2024)?.successRank ?? Number.MAX_SAFE_INTEGER;
    if (sortKey === "successRank2023") return item.years.find((year) => year.year === 2023)?.successRank ?? Number.MAX_SAFE_INTEGER;
    if (sortKey === "quota") return item.latest?.quota ?? -1;
    if (sortKey === "placed") return item.latest?.placed ?? -1;
    if (sortKey === "universityName") return item.universityName;
    if (sortKey === "scoreType") return item.scoreType;
    return item.programName;
  };

  return [...items].sort((a, b) => {
    const av = pick(a);
    const bv = pick(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * multiplier;
    return String(av).localeCompare(String(bv), "tr-TR") * multiplier;
  });
}

async function loadPrograms(codes?: string[]) {
  const programs = await prisma.program.findMany({
    where: codes?.length ? { code: { in: codes } } : undefined,
    orderBy: [{ universityName: "asc" }, { programName: "asc" }],
  });

  let years: ProgramYear[] = [];
  if (codes?.length) {
    for (let index = 0; index < codes.length; index += 800) {
      const chunk = codes.slice(index, index + 800);
      years = years.concat(
        await prisma.programYear.findMany({
          where: { programCode: { in: chunk } },
          orderBy: { year: "asc" },
        }),
      );
    }
  } else {
    years = await prisma.programYear.findMany({ orderBy: { year: "asc" } });
  }

  const yearsByCode = new Map<string, ProgramYear[]>();
  for (const year of years) {
    const current = yearsByCode.get(year.programCode) ?? [];
    current.push(year);
    yearsByCode.set(year.programCode, current);
  }

  return programs.map((program: Program) => programToDto({ ...program, years: yearsByCode.get(program.code) ?? [] }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const codes = searchParams.get("codes")?.split(",").map((code) => code.trim()).filter(Boolean);
    const limit = Number(searchParams.get("limit") ?? "700");

    const allItems = await loadPrograms(codes);
    const minRank = Number(searchParams.get("minRank") || "0");
    const maxRank = Number(searchParams.get("maxRank") || "0");
    const onlyNewPrograms = searchParams.get("new") === "1";
    const showDisabledPrograms = searchParams.get("disabled") === "1";
    const queryTokens = searchTokens(searchParams.get("q"));
    const hasSuccessRank = allItems.some((item) => item.latest?.successRank !== null && item.latest?.successRank !== undefined);
    const scoreTypes = multiValues(searchParams, "scoreType");
    const universities = multiValues(searchParams, "universityName");
    const programNames = multiValues(searchParams, "programName");
    const cities = multiValues(searchParams, "city");
    const universityTypes = multiValues(searchParams, "universityType");
    const feeTypes = multiValues(searchParams, "feeType");
    const educationTypes = multiValues(searchParams, "educationType");
    const sortKey = searchParams.get("sort") ?? "successRank";
    const disabledProgramCodes =
      !showDisabledPrograms || sortKey === "disabled" ? await loadDisabledProgramCodes() : new Set<string>();

    const filtered = allItems.filter((item) => {
      if (!item.latest || item.latest.year !== 2025) return false;
      if (
        queryTokens.length > 0 &&
        !queryTokens.every((token) => textIncludes(`${item.universityName} ${item.programName}`, token))
      ) {
        return false;
      }
      if (scoreTypes.length > 0 && !scoreTypes.includes(item.scoreType)) return false;
      if (universities.length > 0 && !universities.includes(item.universityName)) return false;
      if (programNames.length > 0 && !programNames.some((programName) => textIncludes(item.programName, programName))) return false;
      if (cities.length > 0 && (!item.city || !cities.includes(item.city))) return false;
      if (universityTypes.length > 0 && !universityTypes.includes(item.universityType)) return false;
      if (feeTypes.length > 0 && !feeTypes.includes(item.feeType)) return false;
      if (educationTypes.length > 0 && !educationTypes.includes(item.educationType)) return false;
      if (onlyNewPrograms && !isNewProgram(item)) return false;
      if (!showDisabledPrograms && disabledProgramCodes.has(item.code)) return false;
      if (searchParams.get("programCode") && !textIncludes(item.code, searchParams.get("programCode") ?? "")) return false;
      if (hasSuccessRank && minRank > 0 && (!item.latest.successRank || item.latest.successRank < minRank)) return false;
      if (hasSuccessRank && maxRank > 0 && (!item.latest.successRank || item.latest.successRank > maxRank)) return false;
      return true;
    });

    const sorted = sortPrograms(filtered, sortKey, searchParams.get("dir") ?? "asc", disabledProgramCodes);

    const optionSource = codes?.length ? allItems : allItems;

    return NextResponse.json({
      items: sorted.slice(0, Number.isFinite(limit) ? limit : 700),
      total: sorted.length,
      options: {
        scoreType: unique(optionSource.map((item) => item.scoreType)),
        universityName: unique(optionSource.map((item) => item.universityName)),
        programName: unique(optionSource.map((item) => item.programName)),
        city: unique(optionSource.map((item) => item.city)),
        universityType: unique(optionSource.map((item) => item.universityType)),
        feeType: unique(optionSource.map((item) => item.feeType)),
        educationType: unique(optionSource.map((item) => item.educationType)),
      },
      meta: {
        hasSuccessRank,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Program verisi okunamadı.",
        detail: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 },
    );
  }
}
