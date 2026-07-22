import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { resolveDatabaseUrl } from "../lib/database-url";

type AtlasRecord = {
  kilavuzKodu: number | string;
  universiteAdi?: string | null;
  fymkAdi?: string | null;
  birimAdi?: string | null;
  puanTuru?: string | null;
  ilAdi?: string | null;
  uniIlAdi?: string | null;
  universiteTuru?: string | null;
  bursOraniAdi?: string | null;
  ogrenimTuruAdi?: string | null;
  kontenjan?: number | string | null;
  gkY?: number | string | null;
  minPuan?: number | string | null;
  basariSirasi?: number | string | null;
  gk1?: number | string | null;
  minPuan1?: number | string | null;
  basariSirasi1?: number | string | null;
  gk2?: number | string | null;
  minPuan2?: number | string | null;
  basariSirasi2?: number | string | null;
  gk3?: number | string | null;
  minPuan3?: number | string | null;
  basariSirasi3?: number | string | null;
};

type AtlasResponse = {
  content: AtlasRecord[];
  totalElements: number;
  totalPages: number;
};

const endpoint = "https://yokatlas.yok.gov.tr/api/tercih-kilavuz/search";
const databaseUrl = resolveDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const keepLogs = args.has("--keep-logs");
const pageSizeArg = process.argv.find((arg) => arg.startsWith("--page-size="));
const pageSize = pageSizeArg ? Number(pageSizeArg.split("=")[1]) : 1000;
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

function toInt(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "0") return null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function toFloat(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "0") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;

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

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function cleanUniversityName(rawName: string, city: string | null) {
  if (!city) return rawName;
  return rawName.replace(new RegExp(`\\s*\\(${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\s*$`, "i"), "").trim();
}

function feeType(record: AtlasRecord) {
  const burs = cleanText(record.bursOraniAdi);
  if (burs) return burs;
  const type = cleanText(record.universiteTuru).toLocaleUpperCase("tr-TR");
  return type === "DEVLET" ? "Ücretsiz" : "Ücretli";
}

function dbFilePath() {
  if (!databaseUrl.startsWith("file:")) return null;
  const filePath = databaseUrl.slice("file:".length);
  return path.resolve(process.cwd(), filePath);
}

async function backupDatabase() {
  const filePath = dbFilePath();
  if (!filePath) return null;

  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  const backupPath = `${filePath}.atlas-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

async function postAtlas(page: number): Promise<AtlasResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Tercih-Uygulama/0.1 Atlas importer",
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

function yearsFromAtlas(record: AtlasRecord) {
  return [
    {
      year: 2025,
      quota: toInt(record.kontenjan),
      placed: toInt(record.gkY),
      lowestScore: toFloat(record.minPuan),
      successRank: toInt(record.basariSirasi),
    },
    {
      year: 2024,
      quota: toInt(record.gk1),
      placed: null,
      lowestScore: toFloat(record.minPuan1),
      successRank: toInt(record.basariSirasi1),
    },
    {
      year: 2023,
      quota: toInt(record.gk2),
      placed: null,
      lowestScore: toFloat(record.minPuan2),
      successRank: toInt(record.basariSirasi2),
    },
    {
      year: 2022,
      quota: toInt(record.gk3),
      placed: null,
      lowestScore: toFloat(record.minPuan3),
      successRank: toInt(record.basariSirasi3),
    },
  ].filter((year) => year.quota !== null || year.lowestScore !== null || year.successRank !== null);
}

async function main() {
  const { records, totalElements } = await fetchAtlasRecords();
  const missingRequired = records.filter((record) => !record.kilavuzKodu || !record.universiteAdi || !record.birimAdi);

  console.log(
    JSON.stringify(
      {
        atlasTotalElements: totalElements,
        fetchedRows: records.length,
        missingRequired: missingRequired.length,
        dryRun,
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  const backupPath = await backupDatabase();
  if (backupPath) console.log(`DB yedeği alındı: ${backupPath}`);

  if (!keepLogs) {
    await prisma.importIssue.deleteMany();
    await prisma.importRun.deleteMany();
  }
  await prisma.programYear.deleteMany();
  await prisma.program.deleteMany();

  let importedRows = 0;
  let skippedRows = 0;
  let rawRow = 1;
  const issues: Array<{ rowNumber: number; severity: string; field: string; message: string }> = [];

  for (const record of records) {
    const code = cleanText(record.kilavuzKodu);
    const originalUniversityName = cleanText(record.universiteAdi);
    const programName = cleanText(record.birimAdi);

    if (!code || !originalUniversityName || !programName) {
      skippedRows += 1;
      issues.push({
        rowNumber: rawRow,
        severity: "error",
        field: "required",
        message: `Zorunlu alan eksik: ${JSON.stringify({ code, originalUniversityName, programName })}`,
      });
      rawRow += 1;
      continue;
    }

    const city = cleanText(record.ilAdi ?? record.uniIlAdi) || null;
    const universityName = cleanUniversityName(originalUniversityName, city);
    const years = yearsFromAtlas(record);

    await prisma.program.create({
      data: {
        code,
        universityName,
        originalUniversityName,
        facultyName: cleanText(record.fymkAdi, "-"),
        programName,
        scoreType: cleanText(record.puanTuru, "-"),
        universityType: cleanText(record.universiteTuru, "-"),
        city,
        feeType: feeType(record),
        educationType: cleanText(record.ogrenimTuruAdi, "-"),
        years: {
          create: years.map((year) => ({
            year: year.year,
            quota: year.quota,
            placed: year.placed,
            lowestScore: year.lowestScore,
            highestScore: null,
            successRank: year.successRank,
            sourceFile: "YÖK Atlas tercih-kilavuz/search",
            rawRow,
          })),
        },
      },
    });

    importedRows += 1;
    rawRow += 1;
  }

  const run = await prisma.importRun.create({
    data: {
      fileName: "YÖK Atlas tercih-kilavuz/search",
      detectedYear: 2025,
      importedRows,
      skippedRows,
      missingFields: missingRequired.length,
      suspiciousRows: issues.length,
      issues: {
        create: issues.map((issue) => ({
          rowNumber: issue.rowNumber,
          severity: issue.severity,
          field: issue.field,
          message: issue.message,
        })),
      },
    },
  });

  const yearCounts = await prisma.programYear.groupBy({
    by: ["year"],
    _count: true,
    orderBy: { year: "asc" },
  });

  console.log(
    JSON.stringify(
      {
        importRunId: run.id,
        importedRows,
        skippedRows,
        issues: issues.length,
        yearCounts,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
