import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { programToDto } from "@/lib/program-dto";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const program = await prisma.program.findUnique({
    where: { code },
    include: { years: { orderBy: { year: "asc" } } },
  });

  if (!program) {
    return NextResponse.json({ message: "Program bulunamadı." }, { status: 404 });
  }

  return NextResponse.json(programToDto(program));
}
