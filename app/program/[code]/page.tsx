import { notFound } from "next/navigation";
import BackToResultsButton from "@/components/BackToResultsButton";
import ProgramDetail from "@/components/ProgramDetail";
import { fetchAtlasProgramDetails } from "@/lib/atlas-details";
import { prisma } from "@/lib/prisma";
import { programToDto } from "@/lib/program-dto";

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const program = await prisma.program.findUnique({
    where: { code },
    include: { years: { orderBy: { year: "asc" } } },
  });

  if (!program) notFound();

  const atlasDetails = await fetchAtlasProgramDetails(code);

  return (
    <main className="min-h-screen bg-[#f8faf9] px-4 py-6 text-[#18201d] md:px-8">
      <div className="mx-auto max-w-[1760px]">
        <BackToResultsButton />
        <ProgramDetail program={{ ...programToDto(program), ...atlasDetails }} />
      </div>
    </main>
  );
}
