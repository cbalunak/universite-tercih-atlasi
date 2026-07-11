"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileDown, GripVertical, Home, Pencil, Plus, Share2, Trash2, Upload, X } from "lucide-react";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { formatNumber, formatScore } from "@/lib/format";
import { estimateSuccessRank } from "@/lib/rank-estimate";
import { atlasYears } from "@/lib/year-config";
import type { ProgramDto } from "@/types/program";
import {
  activePreferenceList,
  createPreferenceList,
  readPreferenceStore,
  writePreferenceStore,
  type PreferenceItem,
  type PreferenceListRecord,
} from "@/lib/preference-storage";
import { createUserStateBackup, fetchUserState, parseUserStateBackup, persistUserState, userStateKeys } from "@/lib/user-state";

type PreferenceListProps = {
  mode?: "page" | "overlay";
  onChange?: () => void;
};

type PreferenceSortKey = "universityName" | "programName" | "successRank2025" | "successRank2024" | "successRank2023" | "estimatedRank2026" | "quota";
type PreferenceSortDir = "asc" | "desc";

const preferenceSortableHeaders: Array<{ key: PreferenceSortKey; label: string; align?: "left" | "center"; initialDir: PreferenceSortDir }> = [
  { key: "universityName", label: "Üniversite", initialDir: "asc" },
  { key: "programName", label: "Program", initialDir: "asc" },
  { key: "successRank2025", label: "2025", align: "center", initialDir: "asc" },
  { key: "successRank2024", label: "2024", align: "center", initialDir: "asc" },
  { key: "successRank2023", label: "2023", align: "center", initialDir: "asc" },
  { key: "estimatedRank2026", label: "26 Tah.", align: "center", initialDir: "asc" },
  { key: "quota", label: "Kont.", align: "center", initialDir: "desc" },
];

const collator = new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });

function createPreferenceListId() {
  return `liste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function addPdfFont(pdf: jsPDF) {
  const fontName = "Geist";
  const fontFile = "geist-regular.ttf";
  const response = await fetch("/fonts/geist-regular.ttf");
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  pdf.addFileToVFS(fontFile, btoa(binary));
  pdf.addFont(fontFile, fontName, "normal");
  pdf.addFont(fontFile, fontName, "bold");
  pdf.setFont(fontName, "normal");

  return fontName;
}

function exportRows(programs: ProgramDto[], list: PreferenceItem[]) {
  return list
    .map((entry, index) => {
      const program = programs.find((item) => item.code === entry.code);
      if (!program) return null;
      const row: Record<string, string | number> = {
        Sıra: index + 1,
        "Program Kodu": program.code,
        Üniversite: program.universityName,
        Şehir: program.city ?? "",
        Program: program.programName,
        "Puan Türü": program.scoreType,
        "Üniversite Türü": program.universityType,
        "Ücret / Burs": program.feeType,
        "Öğretim Türü": program.educationType,
        Not: entry.note,
      };
      for (const year of atlasYears) {
        const data = program.years.find((item) => item.year === year);
        row[`${year} Başarı Sırası`] = data?.successRank ?? "";
        row[`${year} Taban Puan`] = data?.lowestScore ?? "";
      }
      return row;
    })
    .filter((row): row is Record<string, string | number> => row !== null);
}

function yearValue(program: ProgramDto, year: number, field: "successRank" | "lowestScore" | "quota") {
  return program.years.find((item) => item.year === year)?.[field] ?? null;
}

function sortableValue(program: ProgramDto, key: PreferenceSortKey) {
  if (key === "universityName") return program.universityName;
  if (key === "programName") return program.programName;
  if (key === "successRank2025") return yearValue(program, 2025, "successRank");
  if (key === "successRank2024") return yearValue(program, 2024, "successRank");
  if (key === "successRank2023") return yearValue(program, 2023, "successRank");
  if (key === "estimatedRank2026") return estimateSuccessRank(program);
  return yearValue(program, 2025, "quota");
}

function comparePrograms(a: ProgramDto, b: ProgramDto, key: PreferenceSortKey, dir: PreferenceSortDir) {
  const aValue = sortableValue(a, key);
  const bValue = sortableValue(b, key);

  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  const result =
    typeof aValue === "string" && typeof bValue === "string"
      ? collator.compare(aValue, bValue)
      : Number(aValue) - Number(bValue);

  return dir === "asc" ? result : -result;
}

function SortableProgramRow({
  program,
  index,
  onRemove,
}: {
  program: ProgramDto;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: program.code });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr ref={setNodeRef} style={style} className="h-7 border-t border-[#edf2f0] bg-white align-middle">
      <td className="px-2 py-0.5 text-center leading-none">
        <button
          type="button"
          className="focus-ring inline-flex cursor-grab rounded p-0.5 text-[#52645d] hover:bg-[var(--color-primary-soft)]"
          title="Sürükle"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </td>
      <td className="px-2 py-0.5 text-center font-semibold leading-3 tabular-nums">{index + 1}</td>
      <td className="px-2 py-0.5 leading-3">{program.universityName}</td>
      <td className="px-2 py-0.5 leading-3">
        <div className="font-semibold">{program.programName}</div>
      </td>
      <td className="px-2 py-0.5 text-center leading-3 whitespace-nowrap tabular-nums">
        {formatNumber(program.years.find((item) => item.year === 2025)?.successRank)}
      </td>
      <td className="px-2 py-0.5 text-center leading-3 whitespace-nowrap tabular-nums">
        {formatNumber(program.years.find((item) => item.year === 2024)?.successRank)}
      </td>
      <td className="px-2 py-0.5 text-center leading-3 whitespace-nowrap tabular-nums">
        {formatNumber(program.years.find((item) => item.year === 2023)?.successRank)}
      </td>
      <td className="px-2 py-0.5 text-center font-semibold leading-3 whitespace-nowrap text-[#dc2626] tabular-nums">
        {formatNumber(estimateSuccessRank(program))}
      </td>
      <td className="px-2 py-0.5 text-center leading-3 whitespace-nowrap tabular-nums">{formatNumber(program.latest?.quota)}</td>
      <td className="px-1.5 py-0.5 text-center leading-none whitespace-nowrap">
        <button
          type="button"
          onClick={onRemove}
          className="focus-ring rounded p-0.5 text-[#9f1239] hover:bg-[#fff1f2]"
          title="Listeden çıkar"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
}

export default function PreferenceList({ mode = "page", onChange }: PreferenceListProps) {
  const [lists, setLists] = useState<PreferenceListRecord[]>([]);
  const [activeListId, setActiveListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [mergePickerOpen, setMergePickerOpen] = useState(false);
  const [mergeSelectedListIds, setMergeSelectedListIds] = useState<string[]>([]);
  const [editingListId, setEditingListId] = useState("");
  const [editingListName, setEditingListName] = useState("");
  const [programs, setPrograms] = useState<ProgramDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [preferenceSort, setPreferenceSort] = useState<{ key: PreferenceSortKey; dir: PreferenceSortDir } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    const store = readPreferenceStore();
    setLists(store.lists);
    setActiveListId(store.activeListId);

    fetchUserState()
      .then((serverState) => {
        if (!serverState.hasServerData) {
          void persistUserState({ preferenceStore: store }).catch((error: unknown) => console.error(error));
          return;
        }

        if (serverState.hasPreferenceStore) {
          window.localStorage.setItem(userStateKeys.preferenceStore, JSON.stringify(serverState.preferenceStore));
          setLists(serverState.preferenceStore.lists);
          setActiveListId(serverState.preferenceStore.activeListId);
        }
      })
      .catch((error: unknown) => console.error(error));
  }, []);

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeListId) ?? lists[0],
    [activeListId, lists],
  );

  const list = activeList?.items ?? [];

  useEffect(() => {
    if (list.length === 0) {
      setPrograms([]);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      codes: list.map((item) => item.code).join(","),
      limit: "1000",
    });

    fetch(`/api/programs?${params.toString()}`)
      .then((response) => response.json())
      .then((payload: { items: ProgramDto[] }) => setPrograms(payload.items))
      .finally(() => setLoading(false));
  }, [list]);

  const programByCode = useMemo(() => new Map(programs.map((program) => [program.code, program])), [programs]);

  const orderedPrograms = useMemo(
    () => list.map((entry) => programByCode.get(entry.code)).filter(Boolean) as ProgramDto[],
    [list, programByCode],
  );
  const totalPreferenceItems = useMemo(
    () => lists.reduce((total, item) => total + item.items.length, 0),
    [lists],
  );
  const selectedMergeLists = useMemo(
    () => lists.filter((item) => mergeSelectedListIds.includes(item.id)),
    [lists, mergeSelectedListIds],
  );
  const selectedMergeItemCount = useMemo(
    () => selectedMergeLists.reduce((total, item) => total + item.items.length, 0),
    [selectedMergeLists],
  );

  function updateList(next: PreferenceItem[]) {
    if (!activeList) return;
    const nextLists = lists.map((item) => (item.id === activeList.id ? { ...item, items: next } : item));
    setLists(nextLists);
    writePreferenceStore({ activeListId: activeList.id, lists: nextLists });
    onChange?.();
  }

  function sortPreferenceList(key: PreferenceSortKey, label: string, initialDir: PreferenceSortDir) {
    if (list.length <= 1) return;

    const dir = preferenceSort?.key === key ? (preferenceSort.dir === "asc" ? "desc" : "asc") : initialDir;
    const directionLabel = dir === "asc" ? "artan" : "azalan";
    const confirmed = window.confirm(`Tercih listeniz "${label}" kolonuna göre ${directionLabel} sıralanacak. Emin misiniz?`);
    if (!confirmed) return;

    const sorted = list
      .map((entry, index) => ({ entry, index, program: programByCode.get(entry.code) }))
      .sort((a, b) => {
        if (!a.program && !b.program) return a.index - b.index;
        if (!a.program) return 1;
        if (!b.program) return -1;

        const result = comparePrograms(a.program, b.program, key, dir);
        return result === 0 ? a.index - b.index : result;
      })
      .map((item) => item.entry);

    setPreferenceSort({ key, dir });
    updateList(sorted);
  }

  function changeActiveList(id: string) {
    setActiveListId(id);
    writePreferenceStore({ activeListId: id, lists });
    onChange?.();
  }

  function addList() {
    const name = newListName.trim() || `Liste ${lists.length + 1}`;
    const store = createPreferenceList(name);
    setLists(store.lists);
    setActiveListId(store.activeListId);
    setNewListName("");
    onChange?.();
  }

  function openMergePicker() {
    if (totalPreferenceItems === 0) {
      window.alert("Birleştirilecek tercih bulunmuyor.");
      return;
    }

    setMergeSelectedListIds(lists.filter((item) => item.items.length > 0).map((item) => item.id));
    setMergePickerOpen(true);
  }

  function toggleMergeSelection(listId: string) {
    setMergeSelectedListIds((current) =>
      current.includes(listId) ? current.filter((item) => item !== listId) : [...current, listId],
    );
  }

  function mergeListsIntoNewList() {
    if (selectedMergeItemCount === 0) {
      window.alert("Birleştirmek için en az bir dolu liste seçin.");
      return;
    }

    const knownCodes = new Set<string>();
    const mergedItems: PreferenceItem[] = [];
    selectedMergeLists.forEach((preferenceList) => {
      preferenceList.items.forEach((item) => {
        if (knownCodes.has(item.code)) return;
        knownCodes.add(item.code);
        mergedItems.push({ ...item });
      });
    });

    const id = createPreferenceListId();
    const dateLabel = new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
    })
      .format(new Date())
      .replaceAll(".", "-");
    const nextList: PreferenceListRecord = {
      id,
      name: `Birleşik Liste ${dateLabel}`,
      items: mergedItems,
      createdAt: new Date().toISOString(),
    };
    const nextLists = [...lists, nextList];

    setLists(nextLists);
    setActiveListId(id);
    setPreferenceSort(null);
    setMergePickerOpen(false);
    setMergeSelectedListIds([]);
    writePreferenceStore({ activeListId: id, lists: nextLists });
    onChange?.();
  }

  function startRenameList(list: PreferenceListRecord) {
    setEditingListId(list.id);
    setEditingListName(list.name);
  }

  function commitRenameList(listId: string) {
    const current = lists.find((item) => item.id === listId);
    if (!current) return;

    const nextName = editingListName.trim() || current.name;
    const nextLists = lists.map((item) => (item.id === listId ? { ...item, name: nextName } : item));
    const nextActiveId = activeListId || activeList?.id || listId;
    setLists(nextLists);
    setEditingListId("");
    setEditingListName("");
    writePreferenceStore({ activeListId: nextActiveId, lists: nextLists });
    onChange?.();
  }

  function cancelRenameList() {
    setEditingListId("");
    setEditingListName("");
  }

  function removeList(listId: string) {
    const target = lists.find((item) => item.id === listId);
    if (!target || lists.length <= 1) return;
    const confirmed = window.confirm(`"${target.name}" listesini silmek istediğinize emin misiniz?`);
    if (!confirmed) return;

    const nextLists = lists.filter((item) => item.id !== listId);
    const nextActive = target.id === activeListId ? nextLists[0] : activeList;
    if (!nextActive) return;

    setLists(nextLists);
    setActiveListId(nextActive.id);
    writePreferenceStore({ activeListId: nextActive.id, lists: nextLists });
    onChange?.();
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((item) => item.code === active.id);
    const newIndex = list.findIndex((item) => item.code === over.id);
    updateList(arrayMove(list, oldIndex, newIndex));
  }

  function exportCsv() {
    const rows = exportRows(programs, list);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${activeList?.name ?? "tercih-listem"}.csv`);
  }

  function exportXlsx() {
    const rows = exportRows(programs, list);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Tercih Listem");
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([output], { type: "application/octet-stream" }), `${activeList?.name ?? "tercih-listem"}.xlsx`);
  }

  async function backupUserData() {
    setBackupBusy(true);
    try {
      const state = await fetchUserState();
      const backup = createUserStateBackup(state);
      const date = new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
        .format(new Date())
        .replaceAll(".", "-");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      saveAs(blob, `universite-tercih-atlasi-yedek-${date}.json`);
    } catch (error) {
      console.error(error);
      window.alert("Yedek alınamadı. Lütfen tekrar deneyin.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreUserData(file: File | undefined) {
    if (!file) return;
    const confirmed = window.confirm("Bu işlem mevcut tercih listelerini, favorileri ve kayıtlı filtreleri yedek dosyasındaki verilerle değiştirecek. Devam edilsin mi?");
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
      window.localStorage.setItem(userStateKeys.preferenceStore, JSON.stringify(saved.preferenceStore));
      window.localStorage.setItem(userStateKeys.favorites, JSON.stringify(saved.favorites));
      window.localStorage.setItem(userStateKeys.disabledPrograms, JSON.stringify(saved.disabledPrograms));
      window.localStorage.setItem(userStateKeys.savedFilters, JSON.stringify(saved.savedFilters));
      window.localStorage.setItem(userStateKeys.explorerState, JSON.stringify(saved.explorerState));
      setLists(saved.preferenceStore.lists);
      setActiveListId(saved.preferenceStore.activeListId);
      onChange?.();
      window.alert("Yedek geri yüklendi.");
    } catch (error) {
      console.error(error);
      window.alert("Yedek geri yüklenemedi. Dosya bozuk ya da uyumsuz olabilir.");
    } finally {
      setBackupBusy(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  async function createPdfDocument() {
    const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
    const pdfFont = await addPdfFont(pdf);
    const title = activeList?.name ?? "Tercih Listem";
    const generatedAt = new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
    const marginX = 10;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const bottomY = pageHeight - 12;
    const columns = [
      { label: "Sıra", x: marginX, width: 12, align: "center" as const },
      { label: "Üniversite", x: marginX + 12, width: 48, align: "left" as const },
      { label: "Program", x: marginX + 60, width: 76, align: "left" as const },
      { label: "2025 Sıralama", x: marginX + 136, width: 28, align: "right" as const },
      { label: "2025 Puan", x: marginX + 164, width: 26, align: "right" as const },
    ];

    const pdfRows = orderedPrograms.map((program, index) => {
      const latest2025 = program.years.find((item) => item.year === 2025);
      return {
        order: String(index + 1),
        university: program.universityName,
        program: program.programName,
        rank: formatNumber(latest2025?.successRank),
        score: formatScore(latest2025?.lowestScore),
      };
    });

    function drawPageHeader() {
      pdf.setTextColor(24, 32, 29);
      pdf.setFont(pdfFont, "bold");
      pdf.setFontSize(14);
      pdf.text(title, marginX, 14);
      pdf.setFont(pdfFont, "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(82, 100, 93);
      pdf.text(`Tarih: ${generatedAt}`, pageWidth - marginX, 14, { align: "right" });

      pdf.setFont(pdfFont, "normal");
      pdf.setFontSize(7.2);
    }

    function drawCellText(text: string, x: number, y: number, width: number, align: "center" | "left" | "right") {
      const textX = align === "right" ? x + width - 2 : align === "center" ? x + width / 2 : x + 2;
      pdf.text(text, textX, y, { align });
    }

    drawPageHeader();
    let y = 30;
    pdf.setFont(pdfFont, "normal");
    pdf.setFontSize(7.2);
    pdfRows.forEach((row) => {
      const universityLines = pdf.splitTextToSize(row.university, columns[1].width - 4) as string[];
      const programLines = pdf.splitTextToSize(row.program, columns[2].width - 4) as string[];
      const rowHeight = Math.max(7, Math.max(universityLines.length, programLines.length) * 3.7 + 3);

      if (y + rowHeight > bottomY) {
        pdf.addPage();
        drawPageHeader();
        y = 30;
        pdf.setFont(pdfFont, "normal");
        pdf.setFontSize(7.2);
      }

      pdf.setDrawColor(237, 242, 240);
      pdf.line(marginX, y, pageWidth - marginX, y);
      pdf.setTextColor(24, 32, 29);
      drawCellText(row.order, columns[0].x, y + 4.8, columns[0].width, "center");
      pdf.text(universityLines, columns[1].x + 2, y + 4.8, { lineHeightFactor: 1.1 });
      pdf.setFont(pdfFont, "bold");
      pdf.text(programLines, columns[2].x + 2, y + 4.8, { lineHeightFactor: 1.1 });
      pdf.setFont(pdfFont, "normal");
      drawCellText(row.rank, columns[3].x, y + 4.8, columns[3].width, "right");
      drawCellText(row.score, columns[4].x, y + 4.8, columns[4].width, "right");
      y += rowHeight;
    });

    pdf.setDrawColor(217, 226, 222);
    pdf.line(marginX, y, pageWidth - marginX, y);
    return pdf;
  }

  function pdfFileName() {
    return `${activeList?.name ?? "tercih-listem"}.pdf`;
  }

  async function exportPdf() {
    const pdf = await createPdfDocument();
    pdf.save(pdfFileName());
  }

  async function sharePdf() {
    const pdf = await createPdfDocument();
    const file = new File([pdf.output("blob")], pdfFileName(), { type: "application/pdf" });
    const shareData: ShareData = {
      title: activeList?.name ?? "Tercih Listem",
      text: "Tercih listem PDF",
      files: [file],
    };

    if (typeof navigator.canShare === "function" && navigator.canShare(shareData) && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    saveAs(file, pdfFileName());
  }

  const isOverlay = mode === "overlay";

  return (
    <div className={isOverlay ? "text-[#18201d]" : "min-h-screen bg-[#f8faf9] px-4 py-6 text-[#18201d] md:px-8"}>
      <div className={isOverlay ? "grid gap-4" : "mx-auto max-w-[1500px]"}>
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {!isOverlay ? (
            <div>
              <h1 className="text-2xl font-semibold md:text-3xl">Tercih Listem</h1>
            </div>
          ) : null}
          <div className="ml-auto flex flex-wrap justify-end gap-1.5">
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void restoreUserData(event.target.files?.[0])}
            />
            {!isOverlay ? (
              <Link
                href="/"
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ccd8d2] bg-white px-2.5 text-xs font-medium text-[var(--color-primary-text)] hover:border-[var(--color-primary)]"
              >
                <Home className="h-3.5 w-3.5" />
                Aramaya Dön
              </Link>
            ) : null}
            <button
              type="button"
              onClick={backupUserData}
              disabled={backupBusy}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ccd8d2] bg-white px-2.5 text-xs font-medium text-[#36443f] hover:border-[var(--color-primary)] disabled:opacity-50"
              title="Tercih listeleri, favoriler ve filtreleri JSON olarak yedekle"
            >
              <FileDown className="h-3.5 w-3.5" />
              Yedekle
            </button>
            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              disabled={backupBusy}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ccd8d2] bg-white px-2.5 text-xs font-medium text-[#36443f] hover:border-[var(--color-primary)] disabled:opacity-50"
              title="Daha önce alınmış JSON yedeğini geri yükle"
            >
              <Upload className="h-3.5 w-3.5" />
              Geri Yükle
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={list.length === 0}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ccd8d2] bg-white px-2.5 text-xs font-medium text-[#36443f] hover:border-[var(--color-primary)] disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={exportXlsx}
              disabled={list.length === 0}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-2.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" />
              Excel
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={list.length === 0}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ccd8d2] bg-white px-2.5 text-xs font-medium text-[#36443f] hover:border-[var(--color-primary)] disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={sharePdf}
              disabled={list.length === 0}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ccd8d2] bg-white px-2.5 text-xs font-medium text-[#36443f] hover:border-[var(--color-primary)] disabled:opacity-50"
              title="Destekleyen cihazlarda paylaşır, destek yoksa PDF indirir"
            >
              <Share2 className="h-3.5 w-3.5" />
              PDF Paylaş
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-md border border-[#d9e2de] bg-white p-4">
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {lists.map((item) => {
                const isActive = item.id === activeList?.id;
                const isEditing = item.id === editingListId;
                return (
                  <div
                    key={item.id}
                    className={[
                      "inline-flex max-w-full items-center rounded-md border text-sm",
                      isActive ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" : "border-[#ccd8d2] bg-white text-[#36443f]",
                    ].join(" ")}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        className="focus-ring h-9 w-40 min-w-0 rounded-l-md bg-transparent px-2.5 font-medium outline-none"
                        value={editingListName}
                        onChange={(event) => setEditingListName(event.target.value)}
                        onBlur={() => commitRenameList(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitRenameList(item.id);
                          if (event.key === "Escape") cancelRenameList();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => changeActiveList(item.id)}
                        onDoubleClick={() => startRenameList(item)}
                        className="focus-ring truncate px-3 py-2 font-medium"
                        title="Düzenlemek için çift tıklayın"
                      >
                        {item.name} ({item.items.length})
                      </button>
                    )}
                    {isEditing ? (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => commitRenameList(item.id)}
                        className="focus-ring border-l border-inherit p-2 text-[var(--color-primary)] hover:bg-[var(--color-primary-soft-hover)]"
                        title="Liste adını kaydet"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRenameList(item)}
                        className="focus-ring border-l border-inherit p-2 text-[#52645d] hover:bg-[var(--color-primary-soft)]"
                        title={`${item.name} adını düzenle`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {lists.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeList(item.id)}
                        className="focus-ring border-l border-inherit p-2 text-[#9f1239] hover:bg-[#fff1f2]"
                        title={`${item.name} listesini sil`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-[#36443f]">Yeni Liste</span>
                <input
                  className="focus-ring h-10 rounded-md border border-[#ccd8d2] bg-white px-3"
                  value={newListName}
                  placeholder={`Liste ${lists.length + 1}`}
                  onChange={(event) => setNewListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addList();
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addList}
                  className="focus-ring inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                >
                  <Plus className="h-4 w-4" />
                  Liste Oluştur
                </button>
                <button
                  type="button"
                  onClick={openMergePicker}
                  disabled={totalPreferenceItems === 0}
                  className="focus-ring inline-flex items-center gap-2 rounded-md border border-[#ccd8d2] bg-white px-3 py-2 text-sm font-semibold text-[#36443f] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Tüm listeleri sırayla birleştirir ve tekrar eden programları tek kez ekler"
                >
                  <Plus className="h-4 w-4" />
                  Listeleri Birleştir
                </button>
              </div>
            </div>
            {mergePickerOpen ? (
              <div className="rounded-md border border-[#d9e2de] bg-[#f8faf9] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[#36443f]">Birleştirilecek listeler</div>
                  <div className="text-xs text-[#66766f]">{selectedMergeItemCount} tercih seçildi</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lists.map((item) => {
                    const checked = mergeSelectedListIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={[
                          "inline-flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium",
                          checked
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                            : "border-[#ccd8d2] bg-white text-[#36443f]",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                          checked={checked}
                          onChange={() => toggleMergeSelection(item.id)}
                        />
                        <span>{item.name}</span>
                        <span className="text-[#66766f]">({item.items.length})</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMergePickerOpen(false);
                      setMergeSelectedListIds([]);
                    }}
                    className="focus-ring rounded-md border border-[#ccd8d2] bg-white px-3 py-1.5 text-xs font-medium text-[#36443f] hover:border-[var(--color-primary)]"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={mergeListsIntoNewList}
                    disabled={selectedMergeItemCount === 0}
                    className="focus-ring rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Seçilenleri Birleştir
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-[#d9e2de] bg-white">
          {list.length === 0 ? (
            <div className="grid min-h-80 place-items-center p-8 text-center text-[#52645d]">
              Henüz tercih listesine program eklenmedi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={list.map((item) => item.code)} strategy={verticalListSortingStrategy}>
                  <table className="w-full min-w-[1220px] table-fixed text-left text-xs">
                    <colgroup>
                      <col className="w-[4%]" />
                      <col className="w-[4%]" />
                      <col className="w-[24%]" />
                      <col className="w-[31%]" />
                      <col className="w-[7%]" />
                      <col className="w-[7%]" />
                      <col className="w-[7%]" />
                      <col className="w-[7%]" />
                      <col className="w-[6%]" />
                      <col className="w-[3%]" />
                    </colgroup>
                    <thead className="bg-[var(--color-primary-soft)] text-[11px] uppercase tracking-[0.06em] text-[#52645d]">
                      <tr>
                        <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">Taşı</th>
                        <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">Sıra</th>
                        {preferenceSortableHeaders.map((header) => {
                          const isActiveSort = preferenceSort?.key === header.key;
                          return (
                            <th
                              key={header.key}
                              className={[
                                "px-2 py-2 font-semibold whitespace-nowrap",
                                header.key === "estimatedRank2026" ? "text-[#dc2626]" : "",
                                header.align === "center" ? "text-center" : "",
                              ].join(" ")}
                            >
                              <button
                                type="button"
                                onClick={() => sortPreferenceList(header.key, header.label, header.initialDir)}
                                className={[
                                  "focus-ring inline-flex max-w-full items-center gap-1 rounded-sm hover:text-[var(--color-primary-text)]",
                                  header.align === "center" ? "justify-center" : "text-left",
                                  isActiveSort ? "text-[var(--color-primary-text)]" : "",
                                ].join(" ")}
                              >
                                <span className="min-w-0">{header.label}</span>
                              </button>
                            </th>
                          );
                        })}
                        <th className="px-1.5 py-2 text-center font-semibold whitespace-nowrap">Sil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && orderedPrograms.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-10 text-center text-[#52645d]">
                            Liste yükleniyor
                          </td>
                        </tr>
                      ) : (
                        orderedPrograms.map((program, index) => {
                          return (
                            <SortableProgramRow
                              key={program.code}
                              program={program}
                              index={index}
                              onRemove={() => updateList(list.filter((entry) => entry.code !== program.code))}
                            />
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
