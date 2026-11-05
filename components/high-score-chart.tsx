"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NowTrendItem, NowTrendReport } from "@/lib/types";

const COLORS = ["#303cff", "#111111", "#753bff"];
const MAX = 3;
const precisionMark: Record<NowTrendItem["levelPrecision"], string> = { exact: "", estimated: "≈", low: "≈?" };

/** 운영체제의 '동작 줄이기'를 따른다. 켜져 있으면 차트 전환 애니메이션을 끈다. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    const frame = requestAnimationFrame(update);
    query.addEventListener("change", update);
    return () => { cancelAnimationFrame(frame); query.removeEventListener("change", update); };
  }, []);
  return reduced;
}

/**
 * Editorial Web · 2030 HIGH SCORE 시계열 비교(V3.1). 저장된 보고서의 시계열만 쓰고 새로 조회하지 않는다.
 * 값은 NAVER 19–39세 상대 관심도를 첫 요청 묶음의 척도로 맞춘 지수다(실제 검색량 아님). 다른 묶음의 키워드는 앵커로 환산한 추정치라 ≈로 표시한다.
 * 애니메이션은 데이터(선택·기간)가 바뀔 때만 실행된다.
 */
export default function HighScoreChart({ report }: { report: NowTrendReport }) {
  const [picked, setPicked] = useState<string[]>(() => report.items.slice(0, 1).map((item) => item.keyword));
  const [range, setRange] = useState<"all" | "recent">("all");
  const reduced = useReducedMotion();
  const chosen = report.items.filter((item) => picked.includes(item.keyword));
  const periods = report.items[0]?.series.map((point) => point.period) ?? [];
  const shown = range === "all" ? periods : periods.slice(Math.floor(periods.length / 2));
  const data = useMemo(() => shown.map((period) => Object.fromEntries([["period", period], ...chosen.map((item) => [item.keyword, item.series.find((point) => point.period === period)?.value ?? null])])), [shown, chosen]);
  const estimated = chosen.some((item) => item.levelPrecision !== "exact") || new Set(chosen.map((item) => item.batch)).size > 1;
  const toggle = (keyword: string) => setPicked((current) => current.includes(keyword) ? (current.length > 1 ? current.filter((item) => item !== keyword) : current) : [...current, keyword].slice(-MAX));
  return <div className="hs-chart" data-testid="high-score-chart">
    <div className="hs-chart-head">
      <div><b>INTEREST OVER TIME</b><small>NAVER 19–39세 상대 관심도 지수 · 실제 검색량 아님 · 최대 {MAX}개 비교</small></div>
      <div className="chip-select" role="group" aria-label="기간"><button type="button" aria-pressed={range === "all"} onClick={() => setRange("all")}>전체 {report.period.startDate}~</button><button type="button" aria-pressed={range === "recent"} onClick={() => setRange("recent")}>최근 절반</button></div>
    </div>
    <div className="hs-picks" role="group" aria-label="비교할 키워드">{report.items.map((item) => { const index = picked.indexOf(item.keyword); return <button type="button" key={item.keyword} aria-pressed={index >= 0} onClick={() => toggle(item.keyword)} style={index >= 0 ? { borderColor: COLORS[index], boxShadow: `inset 0 -4px 0 ${COLORS[index]}` } : undefined} data-testid="hs-pick">{item.keyword}{precisionMark[item.levelPrecision] && <i title="다른 요청 묶음의 값을 앵커로 환산한 추정치">{precisionMark[item.levelPrecision]}</i>}</button>; })}</div>
    <div className="hs-plot" role="img" aria-label={`${chosen.map((item) => item.keyword).join(", ")} 상대 관심도 ${shown[0]}부터 ${shown[shown.length - 1]}까지`}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="rgba(17,17,17,.12)" vertical={false}/>
          <XAxis dataKey="period" tick={{ fontSize: 11 }} tickFormatter={(value: string) => value.slice(5)} interval="preserveStartEnd"/>
          <YAxis tick={{ fontSize: 11 }} width={44}/>
          <Tooltip formatter={(value, name) => [`${precisionMark[report.items.find((item) => item.keyword === name)?.levelPrecision ?? "exact"]}${value}`, String(name)]} labelFormatter={(label) => `${label} 주`} contentStyle={{ border: "2px solid #111", borderRadius: 0, fontSize: 12 }}/>
          {chosen.map((item) => <Line key={item.keyword} type="linear" dataKey={item.keyword} stroke={COLORS[picked.indexOf(item.keyword)]} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} isAnimationActive={!reduced} animationDuration={420} connectNulls={false}/>)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <p className="hs-note" data-testid="hs-note">{estimated ? "≈ 표시가 있거나 다른 요청 묶음의 키워드가 섞여 있어, 높이 비교는 앵커 키워드로 환산한 추정치입니다." : "같은 요청 묶음의 키워드끼리라 높이를 직접 비교할 수 있습니다."} 빈 구간은 이어 그리지 않습니다.</p>
  </div>;
}
