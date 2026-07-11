import type { ProgramSpecialConditionDto } from "@/types/program";

type AtlasConditionRecord = Record<string, string>;

type AtlasDetailRecord = {
  akreditasyon?: string | null;
  birimHiyerarsi?: string | null;
  minBasariSirasi?: number | string | null;
  kosulList?: AtlasConditionRecord[] | null;
};

type AtlasSearchResponse = {
  content?: AtlasDetailRecord[];
};

export type AtlasProgramDetails = {
  specialConditions: ProgramSpecialConditionDto[];
  minSuccessRankCondition: number | null;
  accreditation: string | null;
  academicStaffUrl: string | null;
};

function normalizeConditionText(value: string) {
  return value.replace(/\r\n|\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function conditionsFromAtlasRecord(record: AtlasDetailRecord | undefined): ProgramSpecialConditionDto[] {
  return (record?.kosulList ?? [])
    .flatMap((condition) =>
      Object.entries(condition).map(([code, description]) => ({
        code,
        description: normalizeConditionText(description),
      })),
    )
    .filter((condition) => condition.code && condition.description);
}

function toInt(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "0") return null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim() || null;
}

function buildAcademicStaffUrl(value: unknown) {
  const link = cleanText(value);
  return link
    ? `https://yokatlas.yok.gov.tr/api/yokakademik-redirect?akademikLink=${encodeURIComponent(link)}`
    : null;
}

function emptyDetails(): AtlasProgramDetails {
  return {
    specialConditions: [],
    minSuccessRankCondition: null,
    accreditation: null,
    academicStaffUrl: null,
  };
}

export async function fetchAtlasProgramDetails(code: string): Promise<AtlasProgramDetails> {
  try {
    const response = await fetch("https://yokatlas.yok.gov.tr/api/tercih-kilavuz/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Tercih-Uygulama/0.1",
      },
      body: JSON.stringify({
        filters: { kilavuzKodu: code },
        page: 0,
        size: 20,
        sortBy: "basariSirasi",
        direction: "ASC",
      }),
      cache: "no-store",
    });

    if (!response.ok) return emptyDetails();

    const payload = (await response.json()) as AtlasSearchResponse;
    const record = payload.content?.[0];
    return {
      specialConditions: conditionsFromAtlasRecord(record),
      minSuccessRankCondition: toInt(record?.minBasariSirasi),
      accreditation: cleanText(record?.akreditasyon),
      academicStaffUrl: buildAcademicStaffUrl(record?.birimHiyerarsi),
    };
  } catch (error) {
    console.error("Atlas detayları alınamadı:", error);
    return emptyDetails();
  }
}
