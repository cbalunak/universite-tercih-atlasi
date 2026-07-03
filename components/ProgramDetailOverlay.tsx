"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import ProgramDetail from "@/components/ProgramDetail";
import type { ProgramDto } from "@/types/program";

type Props = {
  code: string | null;
  onClose: () => void;
};

export default function ProgramDetailOverlay({ code, onClose }: Props) {
  const [program, setProgram] = useState<ProgramDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code) {
      setProgram(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setProgram(null);

    fetch(`/api/programs/${code}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Program detayı alınamadı.");
        return response.json();
      })
      .then((payload: ProgramDto) => setProgram(payload))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [code]);

  useEffect(() => {
    if (!code) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [code, onClose]);

  if (!code) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start bg-[#18201d]/45 p-2 backdrop-blur-sm md:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="mx-auto flex max-h-[calc(100vh-1rem)] w-full max-w-[1500px] flex-col overflow-hidden rounded-md border border-[#d9e2de] bg-[#f8faf9] shadow-2xl md:max-h-[calc(100vh-2rem)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#d9e2de] bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-primary)]">Program Detayı</div>
            <div className="truncate text-sm text-[#52645d]">{program ? `${program.code} · ${program.universityName}` : code}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/program/${code}`}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-[#ccd8d2] bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary-text)] hover:border-[var(--color-primary)]"
            >
              <ExternalLink className="h-4 w-4" />
              Sayfa
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-md p-2 text-[#52645d] hover:bg-[var(--color-primary-soft)]"
              title="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 md:p-5">
          {loading ? (
            <div className="grid min-h-[360px] place-items-center text-[#52645d]">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Detay yükleniyor
              </div>
            </div>
          ) : program ? (
            <ProgramDetail program={program} />
          ) : (
            <div className="rounded-md border border-[#ead7a8] bg-[#fff9e8] p-4 text-sm text-[#6d5522]">
              Program detayı alınamadı.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
