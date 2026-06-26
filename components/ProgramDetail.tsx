"use client";

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
import { formatNumber, formatScore } from "@/lib/format";
import { atlasYears } from "@/lib/year-config";
import type { ProgramDto, ProgramYearDto } from "@/types/program";

type Props = {
  program: ProgramDto;
};

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
  return (
    <section className="rounded-md border border-[#d9e2de] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-[#36443f]">{title}</h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid stroke="#e5ece8" />
              <XAxis dataKey="year" tickLine={false} />
              <YAxis tickLine={false} width={72} reversed={reversedYAxis} />
              <Tooltip />
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.16} connectNulls />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid stroke="#e5ece8" />
              <XAxis dataKey="year" tickLine={false} />
              <YAxis tickLine={false} width={72} reversed={reversedYAxis} />
              <Tooltip />
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot connectNulls />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function ProgramDetail({ program }: Props) {
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

  const hasRanking = years.some((year) => year.successRank !== null);

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
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4 lg:min-w-[520px]">
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
          </div>
        </div>
      </section>

      {!hasRanking ? (
        <div className="rounded-md border border-[#ead7a8] bg-[#fff9e8] p-4 text-sm text-[#6d5522]">
          Atlas kaydında başarı sırası bulunmadığı için başarı sırası trendi boş gösterilir. Puan, kontenjan ve
          yerleşen trendleri YÖK Atlas verilerinden hesaplanır.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
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
      </div>

      <section className="overflow-hidden rounded-md border border-[#d9e2de] bg-white">
        <div className="border-b border-[#edf2f0] px-4 py-3 font-semibold">Yıllara Göre Veriler</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-[var(--color-primary-soft)] text-xs uppercase tracking-[0.08em] text-[#52645d]">
              <tr>
                <th className="px-4 py-3">Yıl</th>
                <th className="px-4 py-3">Başarı Sırası</th>
                <th className="px-4 py-3">Taban Puan</th>
                <th className="px-4 py-3">Tavan Puan</th>
                <th className="px-4 py-3">Kontenjan</th>
                <th className="px-4 py-3">Yerleşen</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => (
                <tr key={year.year} className="border-t border-[#edf2f0]">
                  <td className="px-4 py-3 font-semibold">{year.year}</td>
                  <td className="px-4 py-3">{formatNumber(year.successRank)}</td>
                  <td className="px-4 py-3">{formatScore(year.lowestScore)}</td>
                  <td className="px-4 py-3">{formatScore(year.highestScore)}</td>
                  <td className="px-4 py-3">{formatNumber(year.quota)}</td>
                  <td className="px-4 py-3">{formatNumber(year.placed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
