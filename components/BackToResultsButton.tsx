"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export default function BackToResultsButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
      className="focus-ring mb-5 inline-flex items-center gap-2 rounded-md border border-[#ccd8d2] bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary-text)] hover:border-[var(--color-primary)]"
    >
      <ChevronLeft className="h-4 w-4" />
      Sonuçlara dön
    </button>
  );
}
