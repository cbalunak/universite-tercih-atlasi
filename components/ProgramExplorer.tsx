"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownUp,
  ArrowDown,
  ArrowUp,
  Ban,
  BookmarkPlus,
  ClipboardList,
  FileDown,
  Heart,
  ListPlus,
  Loader2,
  RotateCcw,
  Search,
  Star,
  Upload,
  X,
} from "lucide-react";
import { saveAs } from "file-saver";
import { filterConfig } from "@/lib/filter-config";
import { formatNumber, formatScore, riskLabel } from "@/lib/format";
import type { ProgramDto, ProgramFilters } from "@/types/program";
import ProgramDetailOverlay from "@/components/ProgramDetailOverlay";
import PreferenceListOverlay from "@/components/PreferenceListOverlay";
import {
  activePreferenceList,
  readPreferenceStore,
  removeProgramFromActivePreferenceList,
  writePreferenceStore,
  type PreferenceStore,
  type PreferenceListRecord,
  type PreferenceItem,
} from "@/lib/preference-storage";
import { createUserStateBackup, fetchUserState, parseUserStateBackup, persistUserState, userStateKeys } from "@/lib/user-state";

type ApiResponse = {
  items: ProgramDto[];
  total: number;
  options: Record<string, string[]>;
  meta?: {
    hasSuccessRank: boolean;
  };
};

type ExplorerState = {
  filters: ProgramFilters;
  sort: { key: string; dir: string };
  onlyFavorites: boolean;
  generalSearch: string;
  userRank: string;
  updatedAt: number;
};

type SavedFilterPreset = {
  id: string;
  name: string;
  state: Omit<ExplorerState, "updatedAt">;
  createdAt: string;
};

const emptyResponse: ApiResponse = {
  items: [],
  total: 0,
  options: {},
  meta: { hasSuccessRank: false },
};

const explorerStateKey = "tercih:programExplorerState";
const savedFiltersKey = "tercih:savedFilters";
const disabledProgramsKey = "tercih:disabledPrograms";
const defaultSort = { key: "successRank", dir: "asc" };
const defaultFilters: ProgramFilters = { scoreType: ["SAY"] };

const filterKeys: Array<keyof ProgramFilters> = [
  "scoreType",
  "universityName",
  "programName",
  "city",
  "universityType",
  "feeType",
  "educationType",
  "minRank",
  "maxRank",
];

const multiFilterKeys = [
  "scoreType",
  "universityName",
  "programName",
  "city",
  "universityType",
  "feeType",
  "educationType",
] as const;

type MultiFilterKey = (typeof multiFilterKeys)[number];
type SingleFilterKey = Exclude<keyof ProgramFilters, MultiFilterKey>;

function isMultiFilterKey(key: keyof ProgramFilters): key is MultiFilterKey {
  return (multiFilterKeys as readonly string[]).includes(key);
}

function readQueryValues(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function appendFilterParams(params: URLSearchParams, filters: ProgramFilters) {
  filterKeys.forEach((key) => {
    const value = filters[key];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) params.append(key, item);
      });
    } else if (value) {
      params.set(key, value);
    }
  });
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function compactUniversityName(value: string) {
  return value
    .replace(/\s+(ÜNİVERSİTESİ|Üniversitesi|üniversitesi)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactProgramName(value: string) {
  return value
    .replace(/\s+(MÜHENDİSLİĞİ|Mühendisliği|mühendisliği)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function latestRank(program: ProgramDto | undefined) {
  return program?.latest?.successRank ?? null;
}

function hasUrlState(params: URLSearchParams) {
  return filterKeys.some((key) => params.has(key)) || params.has("sort") || params.has("dir") || params.has("favorites") || params.has("q");
}

function readFiltersFromParams(params: URLSearchParams) {
  const nextFilters: ProgramFilters = {};
  filterKeys.forEach((key) => {
    if (isMultiFilterKey(key)) {
      const values = readQueryValues(params, key);
      if (values.length > 0) nextFilters[key] = values;
      return;
    }

    const value = params.get(key);
    if (value) nextFilters[key] = value;
  });
  return nextFilters;
}

function normalizeFilters(input: Partial<ProgramFilters> | undefined) {
  const next: ProgramFilters = {};
  if (!input) return next;

  filterKeys.forEach((key) => {
    const value = input[key];
    if (isMultiFilterKey(key)) {
      const values = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
      if (values.length > 0) next[key] = values;
      return;
    }

    if (typeof value === "string" && value) next[key] = value;
  });

  return next;
}

function hasActiveFilters(filters: ProgramFilters) {
  return filterKeys.some((key) => {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  if (key === userStateKeys.favorites) {
    void persistUserState({ favorites: value as string[] }).catch((error: unknown) => console.error(error));
  }
  if (key === userStateKeys.disabledPrograms) {
    void persistUserState({ disabledPrograms: value as string[] }).catch((error: unknown) => console.error(error));
  }
  if (key === userStateKeys.savedFilters) {
    void persistUserState({ savedFilters: value as unknown[] }).catch((error: unknown) => console.error(error));
  }
  if (key === userStateKeys.explorerState) {
    void persistUserState({ explorerState: value }).catch((error: unknown) => console.error(error));
  }
}

function cacheJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createId() {
  return `filtre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `İstek başarısız oldu: ${response.status}`);
  }
  if (!text.trim()) {
    throw new Error("Sunucudan boş yanıt geldi.");
  }
  return JSON.parse(text) as T;
}

export default function ProgramExplorer() {
  const [filters, setFilters] = useState<ProgramFilters>({});
  const [data, setData] = useState<ApiResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState(defaultSort);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [disabledPrograms, setDisabledPrograms] = useState<string[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [generalSearch, setGeneralSearch] = useState("");
  const debouncedGeneralSearch = useDebouncedValue(generalSearch, 350);
  const [userRank, setUserRank] = useState("");
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [activeList, setActiveList] = useState<PreferenceListRecord | null>(null);
  const [preferencePrograms, setPreferencePrograms] = useState<ProgramDto[]>([]);
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);
  const [filterSearches, setFilterSearches] = useState<Partial<Record<MultiFilterKey, string>>>({});
  const [openFilterKey, setOpenFilterKey] = useState<MultiFilterKey | null>(null);
  const [savedFilters, setSavedFilters] = useState<SavedFilterPreset[]>([]);
  const [filterPresetName, setFilterPresetName] = useState("");
  const [preferenceOverlayOpen, setPreferenceOverlayOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  function refreshActivePreferenceList() {
    setActiveList(activePreferenceList(readPreferenceStore()));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldUseUrl = hasUrlState(params);
    const cachedState = readJson<Partial<ExplorerState>>(explorerStateKey, {});
    const cachedPreferenceStore = readPreferenceStore();
    const cachedFavorites = readJson<string[]>(userStateKeys.favorites, []);
    const cachedDisabledPrograms = readJson<string[]>(disabledProgramsKey, []);
    const cachedSavedFilters = readJson<SavedFilterPreset[]>(savedFiltersKey, []);

    function applyState(
      savedState: Partial<ExplorerState>,
      preferenceStore: PreferenceStore,
      nextFavorites: string[],
      nextDisabledPrograms: string[],
      nextSavedFilters: SavedFilterPreset[],
    ) {
      const nextFilters = normalizeFilters(shouldUseUrl ? readFiltersFromParams(params) : (savedState.filters ?? defaultFilters));
      const hasSavedResultFilter = hasActiveFilters(nextFilters) || Boolean(savedState.onlyFavorites) || Boolean(savedState.generalSearch);

      setFilters(nextFilters);
      setSort(
        shouldUseUrl
          ? {
              key: params.get("sort") || defaultSort.key,
              dir: params.get("dir") === "asc" ? "asc" : "desc",
            }
          : hasSavedResultFilter
            ? (savedState.sort ?? defaultSort)
            : defaultSort,
      );
      setOnlyFavorites(shouldUseUrl ? params.get("favorites") === "1" : (savedState.onlyFavorites ?? false));
      setGeneralSearch(shouldUseUrl ? (params.get("q") ?? "") : (savedState.generalSearch ?? ""));
      setUserRank(savedState.userRank ?? "");
      setFavorites(nextFavorites);
      setDisabledPrograms(nextDisabledPrograms);
      setSavedFilters(nextSavedFilters);
      setActiveList(activePreferenceList(preferenceStore));
    }

    applyState(cachedState, cachedPreferenceStore, cachedFavorites, cachedDisabledPrograms, cachedSavedFilters);

    fetchUserState()
      .then((serverState) => {
        if (!serverState.hasServerData) {
          void persistUserState({
            preferenceStore: cachedPreferenceStore,
            favorites: cachedFavorites,
            disabledPrograms: cachedDisabledPrograms,
            savedFilters: cachedSavedFilters,
            explorerState: cachedState,
          }).catch((error: unknown) => console.error(error));
          return;
        }

        const nextPreferenceStore = serverState.hasPreferenceStore ? serverState.preferenceStore : cachedPreferenceStore;
        if (serverState.hasPreferenceStore) cacheJson(userStateKeys.preferenceStore, serverState.preferenceStore);
        cacheJson(userStateKeys.favorites, serverState.favorites);
        cacheJson(userStateKeys.disabledPrograms, serverState.disabledPrograms);
        cacheJson(userStateKeys.savedFilters, serverState.savedFilters);
        cacheJson(userStateKeys.explorerState, serverState.explorerState);
        applyState(
          serverState.explorerState as Partial<ExplorerState>,
          nextPreferenceStore,
          serverState.favorites,
          serverState.disabledPrograms,
          serverState.savedFilters as SavedFilterPreset[],
        );
      })
      .catch((error: unknown) => console.error(error))
      .finally(() => setHydratedFromUrl(true));

    window.addEventListener("focus", refreshActivePreferenceList);
    window.addEventListener("storage", refreshActivePreferenceList);
    return () => {
      window.removeEventListener("focus", refreshActivePreferenceList);
      window.removeEventListener("storage", refreshActivePreferenceList);
    };
  }, []);

  useEffect(() => {
    if (!hydratedFromUrl) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    appendFilterParams(params, filters);
    if (debouncedGeneralSearch.trim()) params.set("q", debouncedGeneralSearch.trim());
    params.set("sort", sort.key);
    params.set("dir", sort.dir);

    setLoading(true);
    fetch(`/api/programs?${params.toString()}`, { signal: controller.signal })
      .then((response) => readApiResponse<ApiResponse>(response))
      .then((payload: ApiResponse) => setData(payload))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
        setData(emptyResponse);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedGeneralSearch, filters, hydratedFromUrl, sort]);

  useEffect(() => {
    if (!hydratedFromUrl) return;
    const params = new URLSearchParams();
    appendFilterParams(params, filters);
    if (debouncedGeneralSearch.trim()) params.set("q", debouncedGeneralSearch.trim());
    if (sort.key !== defaultSort.key) params.set("sort", sort.key);
    if (sort.dir !== defaultSort.dir) params.set("dir", sort.dir);
    if (onlyFavorites) params.set("favorites", "1");

    const query = params.toString();
    const nextUrl = query ? `/?${query}` : "/";
    window.history.replaceState(null, "", nextUrl);
    writeJson<ExplorerState>(explorerStateKey, {
      filters,
      sort,
      onlyFavorites,
      generalSearch: debouncedGeneralSearch,
      userRank,
      updatedAt: Date.now(),
    });
  }, [debouncedGeneralSearch, filters, hydratedFromUrl, onlyFavorites, sort, userRank]);

  const visibleItems = useMemo(() => {
    if (!onlyFavorites) return data.items;
    return data.items.filter((item) => favorites.includes(item.code));
  }, [data.items, favorites, onlyFavorites]);
  const activePreferenceItems = useMemo(() => activeList?.items ?? [], [activeList]);
  const activePreferenceCodes = useMemo(
    () => new Set(activePreferenceItems.map((item) => item.code)),
    [activePreferenceItems],
  );
  const activePreferenceCodesKey = useMemo(
    () => activePreferenceItems.map((item) => item.code).join(","),
    [activePreferenceItems],
  );
  const preferenceProgramByCode = useMemo(
    () => new Map(preferencePrograms.map((program) => [program.code, program])),
    [preferencePrograms],
  );
  const orderedPreferencePrograms = useMemo(
    () => activePreferenceItems.map((entry) => preferenceProgramByCode.get(entry.code)).filter(Boolean) as ProgramDto[],
    [activePreferenceItems, preferenceProgramByCode],
  );

  useEffect(() => {
    if (!hydratedFromUrl || activePreferenceItems.length === 0) {
      setPreferencePrograms([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      codes: activePreferenceCodesKey,
      limit: "1000",
    });

    fetch(`/api/programs?${params.toString()}`, { signal: controller.signal })
      .then((response) => readApiResponse<ApiResponse>(response))
      .then((payload) => setPreferencePrograms(payload.items))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
        setPreferencePrograms([]);
      });

    return () => controller.abort();
  }, [activePreferenceCodesKey, activePreferenceItems.length, hydratedFromUrl]);

  function updateFilter(key: SingleFilterKey, value: string) {
    setFilters((current) => {
      const next = { ...current };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function addMultiFilter(key: MultiFilterKey, value: string) {
    if (!value) return;
    setFilters((current) => {
      const selected = current[key] ?? [];
      if (selected.includes(value)) return current;
      return { ...current, [key]: [...selected, value] };
    });
    setFilterSearches((current) => ({ ...current, [key]: "" }));
    setOpenFilterKey(key);
  }

  function removeMultiFilter(key: MultiFilterKey, value: string) {
    setFilters((current) => {
      const nextValues = (current[key] ?? []).filter((item) => item !== value);
      const next = { ...current };
      if (nextValues.length > 0) {
        next[key] = nextValues;
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function updateMultiFilterSearch(key: MultiFilterKey, value: string) {
    setFilterSearches((current) => ({ ...current, [key]: value }));
    setOpenFilterKey(key);
  }

  function toggleFavorite(code: string) {
    const next = favorites.includes(code) ? favorites.filter((item) => item !== code) : [...favorites, code];
    setFavorites(next);
    writeJson("tercih:favorites", next);
  }

  function togglePreference(program: ProgramDto) {
    if (activePreferenceCodes.has(program.code)) {
      const nextStore = removeProgramFromActivePreferenceList(program.code);
      setActiveList(activePreferenceList(nextStore));
      return;
    }

    const store = readPreferenceStore();
    const active = activePreferenceList(store);
    if (active.items.some((item) => item.code === program.code)) {
      setActiveList(active);
      return;
    }

    const knownPrograms = new Map([
      ...preferencePrograms.map((item) => [item.code, item] as const),
      ...data.items.map((item) => [item.code, item] as const),
      [program.code, program] as const,
    ]);
    const inserted: PreferenceItem = { code: program.code, note: "" };
    const newRank = latestRank(program);
    let insertIndex = active.items.length;

    if (newRank !== null) {
      const firstWorseIndex = active.items.findIndex((item) => {
        const currentProgram = knownPrograms.get(item.code);
        if (!currentProgram) return false;

        const currentRank = latestRank(currentProgram);
        return currentRank === null || currentRank > newRank;
      });
      if (firstWorseIndex >= 0) insertIndex = firstWorseIndex;
    }

    const nextItems = [
      ...active.items.slice(0, insertIndex),
      inserted,
      ...active.items.slice(insertIndex),
    ];
    const nextStore = {
      activeListId: store.activeListId,
      lists: store.lists.map((list) => (list.id === active.id ? { ...list, items: nextItems } : list)),
    };

    writePreferenceStore(nextStore);
    setActiveList(activePreferenceList(nextStore));
  }

  function toggleDisabledProgram(code: string) {
    const next = disabledPrograms.includes(code)
      ? disabledPrograms.filter((item) => item !== code)
      : [...disabledPrograms, code];
    setDisabledPrograms(next);
    writeJson(disabledProgramsKey, next);
  }

  function changeSort(key: string) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc",
    }));
  }

  function saveCurrentFilterPreset() {
    const name = filterPresetName.trim();
    if (!name) return;

    const nextPreset: SavedFilterPreset = {
      id: createId(),
      name,
      state: { filters, sort, onlyFavorites, generalSearch, userRank },
      createdAt: new Date().toISOString(),
    };

    const next = [nextPreset, ...savedFilters.filter((preset) => preset.name.toLocaleLowerCase("tr-TR") !== name.toLocaleLowerCase("tr-TR"))];
    setSavedFilters(next);
    writeJson(savedFiltersKey, next);
    setFilterPresetName("");
  }

  function applyFilterPreset(preset: SavedFilterPreset) {
    setFilters(normalizeFilters(preset.state.filters));
    setSort(preset.state.sort);
    setOnlyFavorites(preset.state.onlyFavorites);
    setGeneralSearch(preset.state.generalSearch ?? "");
    setUserRank(preset.state.userRank);
    setFilterSearches({});
    setOpenFilterKey(null);
  }

  function deleteFilterPreset(id: string) {
    const preset = savedFilters.find((item) => item.id === id);
    if (!preset || !window.confirm(`"${preset.name}" filtresi silinsin mi?`)) return;
    const next = savedFilters.filter((item) => item.id !== id);
    setSavedFilters(next);
    writeJson(savedFiltersKey, next);
  }

  function currentExplorerState(): ExplorerState {
    return {
      filters,
      sort,
      onlyFavorites,
      generalSearch,
      userRank,
      updatedAt: Date.now(),
    };
  }

  async function backupUserData() {
    setBackupBusy(true);
    try {
      const serverState = await fetchUserState();
      const backup = createUserStateBackup({
        ...serverState,
        preferenceStore: readPreferenceStore(),
        favorites,
        disabledPrograms,
        savedFilters,
        explorerState: currentExplorerState(),
        hasServerData: true,
        hasPreferenceStore: true,
      });
      const date = new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
        .format(new Date())
        .replaceAll(".", "-");
      saveAs(
        new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }),
        `universite-tercih-atlasi-yedek-${date}.json`,
      );
    } catch (error) {
      console.error(error);
      window.alert("Yedek alınamadı. Lütfen tekrar deneyin.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreUserData(file: File | undefined) {
    if (!file) return;
    const confirmed = window.confirm("Bu işlem mevcut tercih listelerini, favorileri, pasif satırları ve kayıtlı filtreleri yedek dosyasındaki verilerle değiştirecek. Devam edilsin mi?");
    if (!confirmed) return;

    setBackupBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const restored = parseUserStateBackup(parsed);
      if (!restored?.preferenceStore) {
        window.alert("Yedek dosyası okunamadı. Doğru JSON dosyasını seçtiğinizden emin olun.");
        return;
      }

      const saved = await persistUserState(restored);
      const restoredExplorerState = saved.explorerState as Partial<ExplorerState>;
      cacheJson(userStateKeys.preferenceStore, saved.preferenceStore);
      cacheJson(userStateKeys.favorites, saved.favorites);
      cacheJson(userStateKeys.disabledPrograms, saved.disabledPrograms);
      cacheJson(userStateKeys.savedFilters, saved.savedFilters);
      cacheJson(userStateKeys.explorerState, restoredExplorerState);

      setFilters(normalizeFilters(restoredExplorerState.filters));
      setSort(restoredExplorerState.sort ?? defaultSort);
      setOnlyFavorites(restoredExplorerState.onlyFavorites ?? false);
      setGeneralSearch(restoredExplorerState.generalSearch ?? "");
      setUserRank(restoredExplorerState.userRank ?? "");
      setFavorites(saved.favorites);
      setDisabledPrograms(saved.disabledPrograms);
      setSavedFilters(saved.savedFilters as SavedFilterPreset[]);
      setActiveList(activePreferenceList(saved.preferenceStore));
      setFilterSearches({});
      setOpenFilterKey(null);
      window.alert("Yedek geri yüklendi.");
    } catch (error) {
      console.error(error);
      window.alert("Yedek geri yüklenemedi. Dosya bozuk ya da uyumsuz olabilir.");
    } finally {
      setBackupBusy(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  const enteredRank = Number(userRank || "0") || null;
  const hasSuccessRank = data.meta?.hasSuccessRank ?? false;

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#18201d]" style={{ "--color-primary": "#7a7a34" } as CSSProperties}>
      <div
        className="sticky top-0 z-40 border-b border-[var(--color-primary-border)] bg-[var(--color-primary)] text-white shadow-sm"
        style={{
          backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--color-primary) 88%, black), var(--color-primary))",
          borderColor: "var(--color-primary-border)",
        }}
      >
        <div className="mx-auto grid max-w-[1680px] gap-4 px-4 pt-14 pb-5 md:px-6 lg:grid-cols-[minmax(0,290px)_minmax(0,1fr)] lg:items-end xl:grid-cols-[minmax(0,290px)_minmax(760px,1fr)_minmax(0,230px)]">
          <img
            src="/logo.png"
            alt="Üniversite Tercih Atlası"
            className="h-auto w-[190px] max-w-full md:w-[220px]"
          />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:col-start-2">
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void restoreUserData(event.target.files?.[0])}
            />
            <label className="relative block w-full max-w-[360px] min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/75" />
              <input
                className="focus-ring h-7 w-full rounded border border-white/55 bg-white/10 pl-7 pr-7 text-xs font-medium text-white placeholder:text-white/70 hover:bg-white/15"
                value={generalSearch}
                placeholder="Genel arama"
                aria-label="Genel arama"
                onChange={(event) => setGeneralSearch(event.target.value)}
              />
              {generalSearch ? (
                <button
                  type="button"
                  onClick={() => setGeneralSearch("")}
                  className="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/75 hover:bg-white/10 hover:text-white"
                  title="Genel aramayı temizle"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              onClick={backupUserData}
              disabled={backupBusy}
              className="focus-ring inline-flex items-center gap-1 rounded border border-white/55 bg-transparent px-2 py-1 text-[11px] font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              title="Tercih listeleri, favoriler, pasif satırlar ve filtreleri yedekle"
            >
              <FileDown className="h-3 w-3" />
              Yedekle
            </button>
            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              disabled={backupBusy}
              className="focus-ring inline-flex items-center gap-1 rounded border border-white/55 bg-transparent px-2 py-1 text-[11px] font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              title="JSON yedeğini geri yükle"
            >
              <Upload className="h-3 w-3" />
              Geri Yükle
            </button>
            <button
              type="button"
              onClick={() => setPreferenceOverlayOpen(true)}
              className="focus-ring inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
            >
              <ClipboardList className="h-3 w-3" />
              Tercih Listem: {activeList?.name ?? "Liste 1"} ({activeList?.items.length ?? 0})
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,290px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,290px)_minmax(760px,1fr)_minmax(0,230px)]">
        <aside className="h-fit min-w-0 overflow-hidden rounded-md border border-[#d9e2de] bg-white p-4 lg:sticky lg:top-5 lg:max-h-[calc(100vh-40px)] lg:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Search className="h-4 w-4 text-[var(--color-primary)]" />
              Filtreler
            </div>
            <button
              type="button"
              onClick={() => {
                setFilters(defaultFilters);
                setFilterSearches({});
                setOpenFilterKey(null);
                setSort(defaultSort);
                setOnlyFavorites(false);
                setGeneralSearch("");
                setUserRank("");
                window.localStorage.removeItem(explorerStateKey);
              }}
              className="focus-ring rounded-md p-2 text-[#52645d] hover:bg-[var(--color-primary-soft)]"
              title="Filtreleri sıfırla"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-4 text-xs text-[#66766f]">
            2025 kayıtları içinde <span className="font-semibold text-[#18201d]">{formatNumber(data.total)}</span> program bulundu
          </div>

          <div className="mb-4 grid gap-2 border-b border-[#e2ebe7] pb-4">
            <div className="flex min-w-0 gap-2">
              <input
                className="focus-ring h-9 min-w-0 flex-1 rounded-md border border-[#ccd8d2] bg-white px-3 text-sm"
                value={filterPresetName}
                placeholder="Filtre adı"
                aria-label="Filtre adı"
                onChange={(event) => setFilterPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveCurrentFilterPreset();
                  }
                }}
              />
              <button
                type="button"
                onClick={saveCurrentFilterPreset}
                disabled={!filterPresetName.trim()}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-2.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                title="Filtreyi kaydet"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Kaydet
              </button>
            </div>
            {savedFilters.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {savedFilters.map((preset) => (
                  <span
                    key={preset.id}
                    className="inline-flex max-w-full items-center overflow-hidden rounded border border-[var(--color-primary-tag-border)] bg-[var(--color-primary-tag)] text-[10px] font-medium leading-3 text-[var(--color-primary-text)]"
                  >
                    <button
                      type="button"
                      onClick={() => applyFilterPreset(preset)}
                      className="focus-ring min-w-0 truncate px-1.5 py-1 hover:bg-white"
                      title={`${preset.name} filtresini uygula`}
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFilterPreset(preset.id)}
                      className="focus-ring px-1 py-1 text-[var(--color-primary)] hover:bg-white"
                      title={`${preset.name} filtresini sil`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3">
            {filterConfig.map((filter) => {
              const singleValue = typeof filters[filter.key] === "string" ? filters[filter.key] : "";
              const multiKey = isMultiFilterKey(filter.key) ? filter.key : null;
              const selectedValues = multiKey ? (filters[multiKey] ?? []) : [];
              const options = data.options[filter.key] ?? [];
              const searchValue = multiKey ? (filterSearches[multiKey] ?? "") : "";
              const normalizedSearch = normalizeSearch(searchValue);
              const shouldBuildOptions = Boolean(multiKey && openFilterKey === multiKey);
              const matchingOptions = multiKey && shouldBuildOptions
                ? options
                    .filter((option) => !selectedValues.includes(option))
                    .filter((option) => !normalizedSearch || normalizeSearch(option).includes(normalizedSearch))
                    .slice(0, 30)
                : [];
              return (
                <div
                  key={filter.key}
                  className="relative grid min-w-0 gap-1 text-sm"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setOpenFilterKey((current) => (current === multiKey ? null : current));
                    }
                  }}
                >
                  {filter.type === "select" && multiKey ? (
                    <>
                      <input
                        className="focus-ring h-10 w-full max-w-full min-w-0 rounded-md border border-[#ccd8d2] bg-white px-3 text-sm"
                        type="text"
                        value={searchValue}
                        aria-label={filter.label}
                        placeholder={`${filter.label} ara`}
                        onFocus={() => setOpenFilterKey(multiKey)}
                        onChange={(event) => updateMultiFilterSearch(multiKey, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && multiKey === "programName" && searchValue.trim()) {
                            event.preventDefault();
                            addMultiFilter(multiKey, searchValue.trim());
                          } else if (event.key === "Enter" && matchingOptions[0]) {
                            event.preventDefault();
                            addMultiFilter(multiKey, matchingOptions[0]);
                          }
                          if (event.key === "Backspace" && !searchValue && selectedValues.length > 0) {
                            removeMultiFilter(multiKey, selectedValues[selectedValues.length - 1]);
                          }
                        }}
                      />
                      {openFilterKey === multiKey ? (
                        <div className="absolute left-0 right-0 top-[42px] z-20 max-h-56 overflow-auto rounded-md border border-[#ccd8d2] bg-white py-1 shadow-lg">
                          {matchingOptions.length > 0 ? (
                            matchingOptions.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => addMultiFilter(multiKey, option)}
                                className="focus-ring block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]"
                              >
                                {option}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-[#66766f]">
                              {multiKey === "programName" && searchValue.trim() ? "Enter ile metni ara" : "Eşleşen seçenek yok"}
                            </div>
                          )}
                        </div>
                      ) : null}
                      {selectedValues.length > 0 ? (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {selectedValues.map((selectedValue) => (
                            <span
                              key={selectedValue}
                              className="inline-flex max-w-full items-center gap-0.5 rounded border border-[var(--color-primary-tag-border)] bg-[var(--color-primary-tag)] px-1.5 py-0.5 text-[10px] font-medium leading-3 text-[var(--color-primary-text)]"
                            >
                              <span className="truncate">{selectedValue}</span>
                              <button
                                type="button"
                                onClick={() => removeMultiFilter(multiKey, selectedValue)}
                                className="focus-ring -mr-0.5 rounded-sm p-0.5 text-[var(--color-primary)] hover:bg-white"
                                title={`${selectedValue} filtresini kaldır`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : filter.type === "select" ? (
                    <select
                      className="focus-ring h-10 w-full max-w-full min-w-0 truncate rounded-md border border-[#ccd8d2] bg-white px-3 text-sm"
                      value={singleValue}
                      onChange={(event) => updateFilter(filter.key as SingleFilterKey, event.target.value)}
                    >
                      <option value="">{filter.placeholder}</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="focus-ring h-10 w-full max-w-full min-w-0 rounded-md border border-[#ccd8d2] bg-white px-3 text-sm"
                      type={filter.type}
                      min={filter.type === "number" ? 0 : undefined}
                      disabled={(filter.key === "minRank" || filter.key === "maxRank") && !hasSuccessRank}
                      value={singleValue}
                      aria-label={filter.label}
                      placeholder={!hasSuccessRank && (filter.key === "minRank" || filter.key === "maxRank") ? "Veri yok" : filter.placeholder}
                      onChange={(event) => updateFilter(filter.key as SingleFilterKey, event.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 border-t border-[#e2ebe7] pt-4">
            <div className="grid min-w-0 gap-1 text-sm">
              <input
                className="focus-ring h-10 w-full max-w-full min-w-0 rounded-md border border-[#ccd8d2] bg-white px-3 text-sm"
                type="number"
                min={1}
                value={userRank}
                aria-label="Benim Başarı Sıram"
                placeholder="Benim başarı sıram"
                onChange={(event) => setUserRank(event.target.value)}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-[#66766f]">
              Güvenli, Makul, Riskli ve Çok Riskli etiketleri yalnızca geçmiş veriye dayalı tahmindir; yerleşme
              garantisi değildir.
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          {!hasSuccessRank ? (
            <div className="mb-3 rounded-md border border-[#ead7a8] bg-[#fff9e8] p-3 text-sm text-[#6d5522]">
              YÖK Atlas kaydında başarı sırası bulunmuyor. Bu nedenle 2025 Başarı Sırası ve başarı sırası filtreleri
              veri gelene kadar pasif gösterilir.
            </div>
          ) : null}

          {loading ? (
            <div className="grid min-h-[420px] place-items-center rounded-md border border-[#d9e2de] bg-white">
              <div className="flex items-center gap-2 text-[#52645d]">
                <Loader2 className="h-5 w-5 animate-spin" />
                Veriler yükleniyor
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-[#d9e2de] bg-white">
              <div className="scrollbar-hidden max-h-[calc(100vh-160px)] overflow-auto">
                <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-xs">
                  <colgroup>
                    <col className="w-[24%]" />
                    <col className="w-[28%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-20 bg-[var(--color-primary)] text-xs uppercase tracking-[0.06em] text-white">
                    <tr>
                      {[
                        ["universityName", "ÜNİVERSİTE"],
                        ["programName", "PROGRAM"],
                        ["successRank", "2025"],
                        ["successRank2024", "2024"],
                        ["successRank2023", "2023"],
                        ["lowestScore", "T. Puan"],
                        ["quota", "Kont."],
                      ].map(([key, label]) => (
                        <th key={key} className="px-2 py-2.5 font-semibold">
                          <button
                            type="button"
                            onClick={() => changeSort(key)}
                            className="focus-ring inline-flex max-w-full items-center gap-1 rounded-sm text-left whitespace-nowrap hover:text-white/80"
                          >
                            <span className="min-w-0">{label}</span>
                            <ArrowDownUp className="h-3.5 w-3.5 shrink-0" />
                          </button>
                        </th>
                      ))}
                      <th className="px-1.5 py-2.5 text-center font-semibold whitespace-nowrap">DISABLE</th>
                      <th className="px-1.5 py-2.5 text-center font-semibold whitespace-nowrap">FAVORİ</th>
                      <th className="px-1.5 py-2.5 text-center font-semibold whitespace-nowrap">EKLE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((program) => {
                      const risk = riskLabel(
                        enteredRank,
                        program.years.map((year) => year.successRank),
                      );
                      const rank2024 = program.years.find((year) => year.year === 2024)?.successRank ?? null;
                      const rank2023 = program.years.find((year) => year.year === 2023)?.successRank ?? null;
                      const isInPreferenceList = activePreferenceCodes.has(program.code);
                      const isFavorite = favorites.includes(program.code);
                      const isDisabled = disabledPrograms.includes(program.code);
                      const rank2025 = program.latest?.successRank ?? null;
                      const rankDirection2025 =
                        rank2025 && rank2024 ? (rank2025 < rank2024 ? "up" : rank2025 > rank2024 ? "down" : null) : null;
                      const rankDirection2024 =
                        rank2024 && rank2023 ? (rank2024 < rank2023 ? "up" : rank2024 > rank2023 ? "down" : null) : null;
                      const trendUpClass = isDisabled ? "text-[#a9b1ad]" : "text-[#dc2626]";
                      const trendDownClass = isDisabled ? "text-[#a9b1ad]" : "text-[#16a34a]";
                      return (
                        <tr
                          key={program.code}
                          tabIndex={isDisabled ? -1 : 0}
                          onClick={() => {
                            if (!isDisabled) setDetailCode(program.code);
                          }}
                          onKeyDown={(event) => {
                            if (isDisabled) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setDetailCode(program.code);
                            }
                          }}
                          className={`border-t border-[#edf2f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] ${
                            isDisabled
                              ? "cursor-default bg-white text-[#b6beb9]"
                              : `cursor-pointer ${
                                  isFavorite ? "bg-[var(--color-primary-tag)]" : ""
                                } hover:bg-[var(--color-primary-tag)] hover:shadow-[inset_4px_0_0_var(--color-primary)] ${isInPreferenceList ? "font-bold" : ""}`
                          }`}
                          title={isDisabled ? "Program pasif" : `${program.programName} detayını aç`}
                        >
                          <td
                            className={`px-2 py-1 leading-4 ${isDisabled ? "line-through" : ""} ${
                              !isDisabled && isInPreferenceList ? "font-bold" : "font-medium"
                            }`}
                          >
                            {program.universityName}
                          </td>
                          <td className="px-2 py-1 leading-4">
                            <div
                              className={`${isDisabled ? "line-through" : ""} ${
                                !isDisabled && isInPreferenceList ? "font-bold" : "font-medium"
                              }`}
                            >
                              {program.programName}
                            </div>
                            {risk ? <div className="text-[11px] font-normal leading-3 text-[#66766f]">{risk}</div> : null}
                          </td>
                          <td className="px-2 py-1 text-center leading-4 whitespace-nowrap tabular-nums">
                            <span className="inline-grid grid-cols-[auto_16px_16px] items-center justify-center gap-1">
                              <span>{rank2025 ? formatNumber(rank2025) : "Dosyada yok"}</span>
                              <span className="grid h-4 w-4 place-items-center">
                                {rankDirection2025 === "up" ? (
                                  <ArrowUp className={`h-3.5 w-3.5 ${trendUpClass}`} aria-label="2025 sıralaması 2024'e göre iyileşti" />
                                ) : rankDirection2025 === "down" ? (
                                  <ArrowDown className={`h-3.5 w-3.5 ${trendDownClass}`} aria-label="2025 sıralaması 2024'e göre geriledi" />
                                ) : (
                                  <span className="h-3 w-px bg-[#aab8b2]" aria-hidden="true" />
                                )}
                              </span>
                              <span className="grid h-4 w-4 place-items-center">
                                {rankDirection2024 === "up" ? (
                                  <ArrowUp className={`h-3.5 w-3.5 ${trendUpClass}`} aria-label="2024 sıralaması 2023'e göre iyileşti" />
                                ) : rankDirection2024 === "down" ? (
                                  <ArrowDown className={`h-3.5 w-3.5 ${trendDownClass}`} aria-label="2024 sıralaması 2023'e göre geriledi" />
                                ) : (
                                  <span className="h-3 w-px bg-[#aab8b2]" aria-hidden="true" />
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="px-2 py-1 text-center leading-4 whitespace-nowrap tabular-nums">{rank2024 ? formatNumber(rank2024) : "-"}</td>
                          <td className="px-2 py-1 text-center leading-4 whitespace-nowrap tabular-nums">{rank2023 ? formatNumber(rank2023) : "-"}</td>
                          <td className="px-2 py-1 text-center leading-4 whitespace-nowrap tabular-nums">{formatScore(program.latest?.lowestScore)}</td>
                          <td className="px-2 py-1 text-center leading-4 whitespace-nowrap tabular-nums">{formatNumber(program.latest?.quota)}</td>
                          <td className="px-1.5 py-1 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleDisabledProgram(program.code);
                              }}
                              className={`focus-ring rounded-md p-1 hover:bg-[var(--color-primary-soft)] ${
                                isDisabled ? "text-[#66766f]" : "text-[var(--color-primary)]"
                              }`}
                              title={isDisabled ? "Satırı tekrar aktif et" : "Satırı pasifleştir"}
                              aria-pressed={isDisabled}
                            >
                              <Ban className="h-3.5 w-3.5" strokeWidth={isDisabled ? 2.5 : 2} />
                            </button>
                          </td>
                          <td className="px-1.5 py-1 text-center whitespace-nowrap">
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavorite(program.code);
                              }}
                              className="focus-ring rounded-md p-1 text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:text-[#a9b1ad] disabled:hover:bg-transparent"
                              title={isFavorite ? "Favoriden çıkar" : "Favorilere ekle"}
                            >
                              <Heart
                                className="h-3.5 w-3.5"
                                fill={isFavorite ? "currentColor" : "none"}
                              />
                            </button>
                          </td>
                          <td className="px-1.5 py-1 text-center whitespace-nowrap">
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={(event) => {
                                event.stopPropagation();
                                togglePreference(program);
                              }}
                              className={`focus-ring rounded-md p-1 hover:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:text-[#a9b1ad] disabled:hover:bg-transparent ${
                                isInPreferenceList ? "text-[var(--color-primary)]" : "text-[var(--color-primary-text)]"
                              }`}
                              title={isInPreferenceList ? "Tercih listesinden çıkar" : "Tercih listesine ekle"}
                            >
                              <ListPlus className="h-3.5 w-3.5" strokeWidth={isInPreferenceList ? 3 : 2} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <aside className="min-w-0 text-[10px] leading-4 text-[#66766f] lg:col-start-2 xl:col-start-auto">
          <div className="h-fit lg:sticky lg:top-[150px]">
            {orderedPreferencePrograms.length > 0 ? (
              <ol className="grid gap-1">
                {orderedPreferencePrograms.map((program, index) => (
                  <li key={program.code} className="min-w-0 truncate">
                    <span className="mr-1 text-[#9aa7a1] tabular-nums">{index + 1}.</span>
                    <span>{compactUniversityName(program.universityName)}</span>{" "}
                    <strong className="font-semibold text-[#18201d]">{compactProgramName(program.programName)}</strong>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </aside>
      </div>
      <ProgramDetailOverlay code={detailCode} onClose={() => setDetailCode(null)} />
      <PreferenceListOverlay
        open={preferenceOverlayOpen}
        onClose={() => {
          setPreferenceOverlayOpen(false);
          refreshActivePreferenceList();
        }}
        onChange={refreshActivePreferenceList}
      />
    </main>
  );
}
