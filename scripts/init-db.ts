import Database from "better-sqlite3";
import path from "node:path";
import process from "node:process";

function sqlitePathFromUrl(url: string) {
  if (!url.startsWith("file:")) return url;
  const filePath = url.replace(/^file:/, "");
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const db = new Database(sqlitePathFromUrl(databaseUrl));

db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS Program (
  code TEXT PRIMARY KEY NOT NULL,
  universityName TEXT NOT NULL,
  originalUniversityName TEXT NOT NULL,
  facultyName TEXT NOT NULL,
  programName TEXT NOT NULL,
  scoreType TEXT NOT NULL,
  universityType TEXT NOT NULL,
  city TEXT,
  feeType TEXT NOT NULL,
  educationType TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ProgramYear (
  id TEXT PRIMARY KEY NOT NULL,
  programCode TEXT NOT NULL,
  year INTEGER NOT NULL,
  quota INTEGER,
  placed INTEGER,
  lowestScore REAL,
  highestScore REAL,
  successRank INTEGER,
  sourceFile TEXT NOT NULL,
  rawRow INTEGER NOT NULL,
  CONSTRAINT ProgramYear_programCode_fkey
    FOREIGN KEY (programCode) REFERENCES Program (code)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS ImportRun (
  id TEXT PRIMARY KEY NOT NULL,
  fileName TEXT NOT NULL,
  detectedYear INTEGER NOT NULL,
  importedRows INTEGER NOT NULL,
  skippedRows INTEGER NOT NULL,
  missingFields INTEGER NOT NULL,
  suspiciousRows INTEGER NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ImportIssue (
  id TEXT PRIMARY KEY NOT NULL,
  runId TEXT NOT NULL,
  rowNumber INTEGER,
  severity TEXT NOT NULL,
  field TEXT,
  message TEXT NOT NULL,
  CONSTRAINT ImportIssue_runId_fkey
    FOREIGN KEY (runId) REFERENCES ImportRun (id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ProgramYear_programCode_year_key ON ProgramYear(programCode, year);
CREATE INDEX IF NOT EXISTS Program_universityName_idx ON Program(universityName);
CREATE INDEX IF NOT EXISTS Program_programName_idx ON Program(programName);
CREATE INDEX IF NOT EXISTS Program_scoreType_idx ON Program(scoreType);
CREATE INDEX IF NOT EXISTS Program_city_idx ON Program(city);
CREATE INDEX IF NOT EXISTS ProgramYear_year_idx ON ProgramYear(year);
CREATE INDEX IF NOT EXISTS ProgramYear_successRank_idx ON ProgramYear(successRank);
CREATE INDEX IF NOT EXISTS ImportIssue_severity_idx ON ImportIssue(severity);

CREATE TABLE IF NOT EXISTS UserState (
  id TEXT PRIMARY KEY NOT NULL,
  preferenceStoreJson TEXT NOT NULL DEFAULT '',
  favoritesJson TEXT NOT NULL DEFAULT '[]',
  disabledProgramsJson TEXT NOT NULL DEFAULT '[]',
  savedFiltersJson TEXT NOT NULL DEFAULT '[]',
  explorerStateJson TEXT NOT NULL DEFAULT '{}',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

db.close();
console.log(`SQLite şeması hazır: ${sqlitePathFromUrl(databaseUrl)}`);
