import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PreferenceStore } from "@/lib/preference-storage";
import type { UserStatePatch, UserStatePayload } from "@/lib/user-state";

export const dynamic = "force-dynamic";

const defaultUserId = "default";

type UserStateRow = {
  preferenceStoreJson: string;
  favoritesJson: string;
  disabledProgramsJson: string;
  savedFiltersJson: string;
  explorerStateJson: string;
};

function createId() {
  return `liste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackPreferenceStore(): PreferenceStore {
  const id = createId();
  return {
    activeListId: id,
    lists: [{ id, name: "Liste 1", items: [], createdAt: new Date().toISOString() }],
  };
}

function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function isNonEmpty(value: string | null | undefined) {
  return Boolean(value && value !== "[]" && value !== "{}");
}

async function ensureUserStateTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS UserState (
      id TEXT PRIMARY KEY NOT NULL,
      preferenceStoreJson TEXT NOT NULL DEFAULT '',
      favoritesJson TEXT NOT NULL DEFAULT '[]',
      disabledProgramsJson TEXT NOT NULL DEFAULT '[]',
      savedFiltersJson TEXT NOT NULL DEFAULT '[]',
      explorerStateJson TEXT NOT NULL DEFAULT '{}',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureDefaultRecord() {
  await prisma.$executeRaw`
    INSERT INTO UserState (id)
    VALUES (${defaultUserId})
    ON CONFLICT(id) DO NOTHING
  `;
}

async function readRecord() {
  const rows = await prisma.$queryRaw<UserStateRow[]>`
    SELECT preferenceStoreJson, favoritesJson, disabledProgramsJson, savedFiltersJson, explorerStateJson
    FROM UserState
    WHERE id = ${defaultUserId}
    LIMIT 1
  `;

  return rows[0];
}

function toPayload(record: {
  preferenceStoreJson: string;
  favoritesJson: string;
  disabledProgramsJson: string;
  savedFiltersJson: string;
  explorerStateJson: string;
}): UserStatePayload {
  const preferenceStore = safeParse<PreferenceStore>(record.preferenceStoreJson, fallbackPreferenceStore());
  const hasValidPreferenceStore = preferenceStore.lists.length > 0 && preferenceStore.lists.some((list) => list.id === preferenceStore.activeListId);
  const normalizedPreferenceStore = hasValidPreferenceStore ? preferenceStore : fallbackPreferenceStore();

  return {
    preferenceStore: normalizedPreferenceStore,
    favorites: safeParse<string[]>(record.favoritesJson, []),
    disabledPrograms: safeParse<string[]>(record.disabledProgramsJson, []),
    savedFilters: safeParse<unknown[]>(record.savedFiltersJson, []),
    explorerState: safeParse<unknown>(record.explorerStateJson, {}),
    hasPreferenceStore: isNonEmpty(record.preferenceStoreJson),
    hasServerData:
      isNonEmpty(record.preferenceStoreJson) ||
      isNonEmpty(record.favoritesJson) ||
      isNonEmpty(record.disabledProgramsJson) ||
      isNonEmpty(record.savedFiltersJson) ||
      isNonEmpty(record.explorerStateJson),
  };
}

export async function GET() {
  await ensureUserStateTable();
  await ensureDefaultRecord();
  const record = await readRecord();

  return NextResponse.json(toPayload(record));
}

export async function PATCH(request: Request) {
  await ensureUserStateTable();
  const body = (await request.json()) as UserStatePatch;
  await ensureDefaultRecord();

  if ("preferenceStore" in body) {
    await prisma.$executeRaw`
      UPDATE UserState
      SET preferenceStoreJson = ${json(body.preferenceStore)}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${defaultUserId}
    `;
  }
  if ("favorites" in body) {
    await prisma.$executeRaw`
      UPDATE UserState
      SET favoritesJson = ${json(body.favorites)}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${defaultUserId}
    `;
  }
  if ("disabledPrograms" in body) {
    await prisma.$executeRaw`
      UPDATE UserState
      SET disabledProgramsJson = ${json(body.disabledPrograms)}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${defaultUserId}
    `;
  }
  if ("savedFilters" in body) {
    await prisma.$executeRaw`
      UPDATE UserState
      SET savedFiltersJson = ${json(body.savedFilters)}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${defaultUserId}
    `;
  }
  if ("explorerState" in body) {
    await prisma.$executeRaw`
      UPDATE UserState
      SET explorerStateJson = ${json(body.explorerState)}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${defaultUserId}
    `;
  }

  const record = await readRecord();

  return NextResponse.json(toPayload(record));
}
