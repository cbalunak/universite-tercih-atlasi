import type { PreferenceStore } from "@/lib/preference-storage";

export type UserStatePayload = {
  preferenceStore: PreferenceStore;
  favorites: string[];
  disabledPrograms: string[];
  savedFilters: unknown[];
  explorerState: unknown;
  hasServerData: boolean;
  hasPreferenceStore: boolean;
};

export type UserStatePatch = Partial<Omit<UserStatePayload, "hasServerData" | "hasPreferenceStore">>;

export type UserStateBackup = {
  app: "universite-tercih-atlasi";
  version: 1;
  exportedAt: string;
  data: Omit<UserStatePayload, "hasServerData" | "hasPreferenceStore">;
};

export const userStateKeys = {
  preferenceStore: "tercih:lists",
  favorites: "tercih:favorites",
  disabledPrograms: "tercih:disabledPrograms",
  savedFilters: "tercih:savedFilters",
  explorerState: "tercih:programExplorerState",
} as const;

export async function fetchUserState() {
  const response = await fetch("/api/user-state", { cache: "no-store" });
  if (!response.ok) throw new Error("Kullanıcı verileri alınamadı.");
  return (await response.json()) as UserStatePayload;
}

export async function persistUserState(patch: UserStatePatch) {
  const response = await fetch("/api/user-state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("Kullanıcı verileri kaydedilemedi.");
  return (await response.json()) as UserStatePayload;
}

export function createUserStateBackup(payload: UserStatePayload): UserStateBackup {
  return {
    app: "universite-tercih-atlasi",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      preferenceStore: payload.preferenceStore,
      favorites: payload.favorites,
      disabledPrograms: payload.disabledPrograms,
      savedFilters: payload.savedFilters,
      explorerState: payload.explorerState,
    },
  };
}

export function parseUserStateBackup(input: unknown): UserStatePatch | null {
  const candidate = input as Partial<UserStateBackup> & Partial<UserStatePatch>;
  const data = candidate.data ?? candidate;

  if (!data || typeof data !== "object") return null;
  if (!("preferenceStore" in data) || !data.preferenceStore) return null;
  if (!Array.isArray(data.preferenceStore.lists) || typeof data.preferenceStore.activeListId !== "string") return null;

  return {
    preferenceStore: data.preferenceStore,
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    disabledPrograms: Array.isArray(data.disabledPrograms) ? data.disabledPrograms : [],
    savedFilters: Array.isArray(data.savedFilters) ? data.savedFilters : [],
    explorerState: data.explorerState && typeof data.explorerState === "object" ? data.explorerState : {},
  };
}
