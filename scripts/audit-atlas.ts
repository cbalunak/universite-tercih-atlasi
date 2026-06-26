import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type Program, type ProgramYear } from "../generated/prisma/client";

type ProgramWithYears = Program & { years: ProgramYear[] };

type AtlasRecord = {
  kilavuzKodu: number | string;
  universiteAdi?: string | null;
  birimAdi?: string | null;
  puanTuru?: string | null;
  ilAdi?: string | null;
  kontenjan?: number | string | null;
  minPuan?: number | string | null;
  basariSirasi?: number | string | null;
  basariSirasi1?: number | string | null;
  basariSirasi2?: number | string | null;
  minPuan1?: number | string | null;
  minPuan2?: number | string | null;
};

type AtlasResponse = {
  content: AtlasRecord[];
  totalElements: number;
  totalPages: number;
  number: number;
};

type ComparisonIssue = {
  severity: "error" | "warning";
  code: string;
  field: string;
  localValue: string;
  atlasValue: string;
  university: string;
  program: string;
};

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

const endpoint = "https://yokatlas.yok.gov.tr/api/tercih-kilavuz/search";
const args = new Set(process.argv.slice(2));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const pageSizeArg = process.argv.find((arg) => arg.startsWith("--page-size="));
const pageSize = pageSizeArg ? Number(pageSizeArg.split("=")[1]) : 1000;
const outputDirArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputDir = outputDirArg ? outputDirArg.slice("--out=".length) : "reports";
const strictScores = args.has("--strict-scores");

function toInt(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "0") return null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function toFloat(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "0") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).trim();
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const normalized =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "")
      : lastComma >= 0
        ? text.replace(",", ".")
        : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function csvEscape(value: unknown) {
  const text = display(value);
  if (/^[=+\-@]/.test(text)) return `"'${text.replaceAll('"', '""')}"`;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

async function postAtlas(page: number): Promise<AtlasResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Tercih-Uygulama/0.1 Atlas audit",
    },
    body: JSON.stringify({
      filters: { birimTuruId: 46 },
      page,
      size: pageSize,
      sortBy: "kilavuzKodu",
      direction: "ASC",
    }),
  });

  if (!response.ok) {
    throw new Error(`Atlas HTTP ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as AtlasResponse;
}

async function fetchAtlasRecords() {
  const first = await postAtlas(0);
  const records = [...first.content];
  const totalPages = limit ? Math.min(first.totalPages, Math.ceil(limit / pageSize)) : first.totalPages;

  for (let page = 1; page < totalPages; page += 1) {
    const payload = await postAtlas(page);
    records.push(...payload.content);
    process.stdout.write(`Atlas sayfa ${page + 1}/${totalPages} alındı\r`);
  }

  process.stdout.write("\n");
  return {
    records: limit ? records.slice(0, limit) : records,
    totalElements: first.totalElements,
  };
}

function yearValue(program: ProgramWithYears, year: number, field: "successRank" | "lowestScore" | "quota") {
  return program.years.find((item) => item.year === year)?.[field] ?? null;
}

function compareValue(
  issues: ComparisonIssue[],
  program: ProgramWithYears,
  field: string,
  localValue: number | null,
  atlasValue: number | null,
  tolerance = 0,
) {
  const bothEmpty = localValue === null && atlasValue === null;
  if (bothEmpty) return;

  const mismatch =
    localValue === null ||
    atlasValue === null ||
    (typeof localValue === "number" && typeof atlasValue === "number" && Math.abs(localValue - atlasValue) > tolerance);

  if (!mismatch) return;

  issues.push({
    severity: "error",
    code: program.code,
    field,
    localValue: display(localValue),
    atlasValue: display(atlasValue),
    university: program.universityName,
    program: program.programName,
  });
}

async function main() {
  const [{ records, totalElements }, programs] = await Promise.all([
    fetchAtlasRecords(),
    prisma.program.findMany({ include: { years: true } }),
  ]);

  const programsByCode = new Map(programs.map((program) => [program.code, program]));
  const atlasByCode = new Map(records.map((record) => [String(record.kilavuzKodu), record]));
  const issues: ComparisonIssue[] = [];
  const missingInAtlas: ComparisonIssue[] = [];
  const missingInLocal: ComparisonIssue[] = [];

  for (const program of programs) {
    const latest = program.years.find((item) => item.year === 2025);
    if (!latest) continue;

    const atlas = atlasByCode.get(program.code);
    if (!atlas) {
      missingInAtlas.push({
        severity: "warning",
        code: program.code,
        field: "program",
        localValue: "var",
        atlasValue: "yok",
        university: program.universityName,
        program: program.programName,
      });
      continue;
    }

    compareValue(issues, program, "2025.successRank", yearValue(program, 2025, "successRank"), toInt(atlas.basariSirasi));
    compareValue(issues, program, "2024.successRank", yearValue(program, 2024, "successRank"), toInt(atlas.basariSirasi1));
    compareValue(issues, program, "2023.successRank", yearValue(program, 2023, "successRank"), toInt(atlas.basariSirasi2));
    compareValue(issues, program, "2025.quota", yearValue(program, 2025, "quota"), toInt(atlas.kontenjan));

    if (strictScores) {
      compareValue(issues, program, "2025.lowestScore", yearValue(program, 2025, "lowestScore"), toFloat(atlas.minPuan), 0.001);
      compareValue(issues, program, "2024.lowestScore", yearValue(program, 2024, "lowestScore"), toFloat(atlas.minPuan1), 0.001);
      compareValue(issues, program, "2023.lowestScore", yearValue(program, 2023, "lowestScore"), toFloat(atlas.minPuan2), 0.001);
    }
  }

  for (const atlas of records) {
    const code = String(atlas.kilavuzKodu);
    if (programsByCode.has(code)) continue;
    missingInLocal.push({
      severity: "warning",
      code,
      field: "program",
      localValue: "yok",
      atlasValue: "var",
      university: display(atlas.universiteAdi),
      program: display(atlas.birimAdi),
    });
  }

  const allIssues = [...issues, ...missingInAtlas, ...missingInLocal];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.mkdir(outputDir, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    atlasTotalElements: totalElements,
    atlasFetchedRows: records.length,
    localPrograms: programs.length,
    comparedLocal2025Programs: programs.filter((program) => program.years.some((year) => year.year === 2025)).length,
    mismatches: issues.length,
    missingInAtlas: missingInAtlas.length,
    missingInLocal: missingInLocal.length,
    strictScores,
  };

  const baseName = `atlas-comparison-${stamp}`;
  await fs.writeFile(path.join(outputDir, `${baseName}.json`), JSON.stringify({ summary, issues: allIssues }, null, 2));
  await fs.writeFile(
    path.join(outputDir, `${baseName}.csv`),
    [
      ["severity", "code", "field", "localValue", "atlasValue", "university", "program"].join(","),
      ...allIssues.map((issue) =>
        [
          issue.severity,
          issue.code,
          issue.field,
          issue.localValue,
          issue.atlasValue,
          issue.university,
          issue.program,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n"),
  );

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Raporlar: ${path.join(outputDir, `${baseName}.json`)} ve ${path.join(outputDir, `${baseName}.csv`)}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
