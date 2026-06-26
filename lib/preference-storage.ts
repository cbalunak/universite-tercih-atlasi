import { persistUserState } from "@/lib/user-state";

export type PreferenceItem = {
  code: string;
  note: string;
};

export type PreferenceListRecord = {
  id: string;
  name: string;
  items: PreferenceItem[];
  createdAt: string;
};

export type PreferenceStore = {
  activeListId: string;
  lists: PreferenceListRecord[];
};

const storeKey = "tercih:lists";
const legacyKey = "tercih:list";

function createId() {
  return `liste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackStore(): PreferenceStore {
  const id = createId();
  return {
    activeListId: id,
    lists: [{ id, name: "Liste 1", items: [], createdAt: new Date().toISOString() }],
  };
}

export function readPreferenceStore(): PreferenceStore {
  if (typeof window === "undefined") return fallbackStore();

  try {
    const stored = window.localStorage.getItem(storeKey);
    if (stored) {
      const parsed = JSON.parse(stored) as PreferenceStore;
      if (parsed.lists.length > 0 && parsed.lists.some((list) => list.id === parsed.activeListId)) return parsed;
    }
  } catch {
    // Fall through to migration/default.
  }

  const migrated = fallbackStore();
  try {
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy) {
      migrated.lists[0].items = JSON.parse(legacy) as PreferenceItem[];
    }
  } catch {
    // Empty default is fine when legacy data is malformed.
  }

  window.localStorage.setItem(storeKey, JSON.stringify(migrated));
  return migrated;
}

export function writePreferenceStore(store: PreferenceStore) {
  window.localStorage.setItem(storeKey, JSON.stringify(store));
  void persistUserState({ preferenceStore: store }).catch((error: unknown) => console.error(error));
}

export function activePreferenceList(store: PreferenceStore) {
  return store.lists.find((list) => list.id === store.activeListId) ?? store.lists[0];
}

export function addProgramsToActivePreferenceList(codes: string[]) {
  const store = readPreferenceStore();
  const active = activePreferenceList(store);
  const known = new Set(active.items.map((item) => item.code));
  const additions = codes.filter((code) => !known.has(code)).map((code) => ({ code, note: "" }));
  if (additions.length === 0) return store;

  const next = {
    ...store,
    lists: store.lists.map((list) =>
      list.id === active.id ? { ...list, items: [...list.items, ...additions] } : list,
    ),
  };
  writePreferenceStore(next);
  return next;
}

export function removeProgramFromActivePreferenceList(code: string) {
  const store = readPreferenceStore();
  const active = activePreferenceList(store);
  const next = {
    ...store,
    lists: store.lists.map((list) =>
      list.id === active.id ? { ...list, items: list.items.filter((item) => item.code !== code) } : list,
    ),
  };
  writePreferenceStore(next);
  return next;
}

export function createPreferenceList(name: string) {
  const store = readPreferenceStore();
  const id = createId();
  const next = {
    activeListId: id,
    lists: [...store.lists, { id, name, items: [], createdAt: new Date().toISOString() }],
  };
  writePreferenceStore(next);
  return next;
}
