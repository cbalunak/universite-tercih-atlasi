"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import PreferenceList from "@/components/PreferenceList";

type Props = {
  open: boolean;
  onClose: () => void;
  onChange?: () => void;
};

export default function PreferenceListOverlay({ open, onClose, onChange }: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#18201d]/45 p-3 backdrop-blur-sm md:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-md border border-[#d9e2de] bg-[#f8faf9] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#d9e2de] bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-[#18201d]">Tercih Listem</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-md p-2 text-[#52645d] hover:bg-[var(--color-primary-soft)]"
            title="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          <PreferenceList mode="overlay" onChange={onChange} />
        </div>
      </div>
    </div>
  );
}
