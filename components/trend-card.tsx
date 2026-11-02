import Link from "next/link";
import { MediaThumb } from "./media-thumb";
import { ArrowUpRight } from "lucide-react";
import type { Trend } from "@/lib/types";
import { StatusPill } from "./ui";

export function TrendCard({ trend }: { trend: Trend }) {
  return (
    <Link href={`/trends/${trend.id}/why`} className="trend-card panel" style={{ "--card-accent": trend.accent } as React.CSSProperties}>
      {/* DEMO 트렌드에는 출처가 확인된 실제 이미지가 없다. 장식용 이미지를 넣지 않고 DEMO 그래픽만 쓴다. */}
      <MediaThumb media={null} label={trend.name} demo={trend.category !== "Live"} ratio="16 / 7"/>
      <div className="card-top"><span className="category">{trend.category}</span><ArrowUpRight size={15} color={trend.accent} /></div>
      <h3>{trend.name}<small>{trend.en}</small></h3>
      <p>{trend.summary}</p>
      <div className="tags">{trend.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      <div style={{ marginTop: 14 }}><StatusPill status={trend.status} /></div>
    </Link>
  );
}
