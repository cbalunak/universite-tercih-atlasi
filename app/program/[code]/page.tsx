import Link from "next/link";
import { notFound } from "next/navigation";
import ProgramDetail from "@/components/ProgramDetail";
import { prisma } from "@/lib/prisma";
import { programToDto } from "@/lib/program-dto";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const program = await prisma.program.findUnique({
    where: { code },
    include: { years: { orderBy: { year: "asc" } } },
  });

  if (!program) notFound();

  return (
    <main className="min-h-screen bg-[#f8faf9] px-4 py-6 text-[#18201d] md:px-8">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="focus-ring mb-5 inline-flex items-center gap-2 rounded-md border border-[#ccd8d2] bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary-text)] hover:border-[var(--color-primary)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Sonuçlara dön
        </Link>
        <ProgramDetail program={programToDto(program)} />
      </div>
    </main>
  );
}
