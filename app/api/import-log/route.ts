import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await prisma.importRun.findMany({
    orderBy: { detectedYear: "asc" },
    include: {
      issues: {
        orderBy: [{ severity: "asc" }, { rowNumber: "asc" }],
        take: 20,
      },
    },
  });

  return NextResponse.json({ runs });
}
