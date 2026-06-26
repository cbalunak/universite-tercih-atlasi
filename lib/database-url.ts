import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const rootDatabasePath = path.join(projectRoot, "dev.db");
const oldPrismaDatabasePath = path.join(projectRoot, "prisma", "dev.db");

export function resolveDatabaseUrl(rawUrl = process.env.DATABASE_URL) {
  if (!rawUrl) return `file:${rootDatabasePath}`;

  const url = rawUrl.trim().replace(/^["']|["']$/g, "");
  if (!url.startsWith("file:")) return url;

  const filePath = url.replace(/^file:/, "");
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);

  if (path.normalize(absolutePath) === path.normalize(oldPrismaDatabasePath)) {
    return `file:${rootDatabasePath}`;
  }

  return `file:${absolutePath}`;
}

export function sqlitePathFromDatabaseUrl(url = resolveDatabaseUrl()) {
  if (!url.startsWith("file:")) return url;

  return url.replace(/^file:/, "");
}
