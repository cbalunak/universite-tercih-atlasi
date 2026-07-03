"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { formatNumber, formatScore } from "@/lib/format";
import { atlasYears } from "@/lib/year-config";
import type { ProgramDto, ProgramYearDto } from "@/types/program";

type Props = {
  program: ProgramDto;
};

function atlasProgramUrl(code: string) {
  return `https://yokatlas.yok.gov.tr/lisans.php?y=${encodeURIComponent(code)}`;
}

function TrendBlock({
  title,
  dataKey,
  data,
  color,
  kind = "line",
  reversedYAxis = false,
}: {
  title: string;
  dataKey: keyof ProgramYearDto;
  data: ProgramYearDto[];
  color: string;
  kind?: "line" | "area";
  reversedYAxis?: boolean;
}) {
  const axisTick = { fontSize: 10, fill: "#66766f" };
  const tooltipStyle = { fontSize: 10 };

  return (
    <section className="rounded-md border border-[#d9e2de] bg-white p-3">
      <h2 className="mb-3 text-sm font-semibold text-[#36443f]">{title}</h2>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid stroke="#e5ece8" />
              <XAxis dataKey="year" tickLine={false} tick={axisTick} />
              <YAxis tickLine={false} width={48} reversed={reversedYAxis} tick={axisTick} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipStyle} labelStyle={tooltipStyle} />
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.16} connectNulls />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid stroke="#e5ece8" />
              <XAxis dataKey="year" tickLine={false} tick={axisTick} />
              <YAxis tickLine={false} width={48} reversed={reversedYAxis} tick={axisTick} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipStyle} labelStyle={tooltipStyle} />
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot connectNulls />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function ProgramDetail({ program }: Props) {
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const years = atlasYears.map((year) => {
    const item = program.years.find((entry) => entry.year === year);
    return {
      year,
      quota: item?.quota ?? null,
      placed: item?.placed ?? null,
      lowestScore: item?.lowestScore ?? null,
      highestScore: item?.highestScore ?? null,
      successRank: item?.successRank ?? null,
    };
  });

  const specialConditions = program.specialConditions ?? [];

  return (
    <div className="grid gap-5">
      <section className="rounded-md border border-[#d9e2de] bg-white p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <div className="font-mono text-sm text-[#66766f]">{program.code}</div>
            <h1 className="mt-1 text-2xl font-semibold text-[#18201d]">{program.programName}</h1>
            <p className="mt-2 text-[#52645d]">
              {program.universityName} · {program.facultyName}
            </p>
            <a
              href={atlasProgramUrl(program.code)}
              target="_blank"
              rel="noreferrer"
              className="focus-ring mt-1 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-[var(--color-primary)] hover:underline"
            >
              Web sayfası
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 lg:min-w-[640px]">
            <div className="rounded-md bg-[var(--color-primary-soft)] p-3">
              <div className="text-xs text-[#66766f]">Puan Türü</div>
              <div className="font-semibold">{program.scoreType}</div>
            </div>
            <div className="rounded-md bg-[var(--color-primary-soft)] p-3">
              <div className="text-xs text-[#66766f]">Şehir</div>
              <div className="font-semibold">{program.city ?? "-"}</div>
            </div>
            <div className="rounded-md bg-[var(--color-primary-soft)] p-3">
              <div className="text-xs text-[#66766f]">Üniversite Türü</div>
              <div className="font-semibold">{program.universityType}</div>
            </div>
            <div className="rounded-md bg-[var(--color-primary-soft)] p-3">
              <div className="text-xs text-[#66766f]">Ücret / Burs</div>
              <div className="font-semibold">{program.feeType}</div>
            </div>
            <div className="rounded-md bg-[var(--color-primary-soft)] p-3">
              <div className="text-xs text-[#66766f]">Başarı Sırası Şartı</div>
              <div className="font-semibold">{formatNumber(program.minSuccessRankCondition)}</div>
            </div>
            <div className="rounded-md bg-[var(--color-primary-soft)] p-3">
              <div className="text-xs text-[#66766f]">Akreditasyon</div>
              <div className="truncate font-semibold" title={program.accreditation ?? undefined}>
                {program.accreditation ?? "-"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-3 xl:items-stretch">
        <TrendBlock
          title={`${years.length} Yıllık Başarı Sırası Trendi`}
          data={years}
          dataKey="successRank"
          color="var(--color-primary)"
          reversedYAxis
        />
        <TrendBlock title={`${years.length} Yıllık Taban Puan Trendi`} data={years} dataKey="lowestScore" color="#2563eb" />
        <TrendBlock title={`${years.length} Yıllık Kontenjan Trendi`} data={years} dataKey="quota" color="#a16207" kind="area" />
        <TrendBlock title={`${years.length} Yıllık Yerleşen Sayısı Trendi`} data={years} dataKey="placed" color="#7c3aed" kind="area" />

        <section className="h-full overflow-hidden rounded-md border border-[#d9e2de] bg-white">
          <div className="border-b border-[#edf2f0] px-3 py-2 text-sm font-semibold">Yıllara Göre Veriler</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-xs">
              <thead className="bg-[var(--color-primary-soft)] text-[11px] uppercase tracking-[0.04em] text-[#52645d]">
                <tr>
                  <th className="px-3 py-2">Yıl</th>
                  <th className="px-3 py-2">Sıra</th>
                  <th className="px-3 py-2">Taban</th>
                  <th className="px-3 py-2">Tavan</th>
                  <th className="px-3 py-2">Kont.</th>
                  <th className="px-3 py-2">Yer.</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year.year} className="border-t border-[#edf2f0]">
                    <td className="px-3 py-2 font-semibold">{year.year}</td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(year.successRank)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatScore(year.lowestScore)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatScore(year.highestScore)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(year.quota)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(year.placed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="h-full rounded-md border border-[#d9e2de] bg-white p-4">
          <button
            type="button"
            onClick={() => setConditionsOpen((current) => !current)}
            className="focus-ring mb-3 flex w-full items-center justify-between gap-3 rounded-sm text-left"
            aria-expanded={conditionsOpen}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#36443f]">
              {conditionsOpen ? <ChevronDown className="h-4 w-4 text-[var(--color-primary)]" /> : <ChevronRight className="h-4 w-4 text-[var(--color-primary)]" />}
              Özel Şartlar
            </span>
            <span className="text-xs font-medium text-[#66766f]">
              {specialConditions.length > 0 ? `${specialConditions.length} şart` : "Yok"}
            </span>
          </button>
          {conditionsOpen ? (
            specialConditions.length > 0 ? (
              <div className="grid gap-2">
                {specialConditions.map((condition) => (
                  <div
                    key={condition.code}
                    className="grid gap-2 rounded-md border border-[#edf2f0] bg-[#f8faf9] p-3 text-sm leading-6 text-[#36443f] md:grid-cols-[52px_1fr]"
                  >
                    <div className="font-mono text-xs font-semibold text-[var(--color-primary)]">{condition.code}</div>
                    <p className="whitespace-pre-line">{condition.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[#66766f]">Bu program için özel şart bulunmuyor.</div>
            )
          ) : null}
        </section>
      </div>

    </div>
  );
}
