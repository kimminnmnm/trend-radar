import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Trend } from "@/lib/types";
import { StatusPill } from "./ui";

export function TrendCard({ trend }: { trend: Trend }) {
  return (
    <Link href={`/trends/${trend.id}/why`} className="trend-card panel" style={{ "--card-accent": trend.accent } as React.CSSProperties}>
      <div className="card-top"><span className="category">{trend.category}</span><ArrowUpRight size={15} color={trend.accent} /></div>
      <h3>{trend.name}<small>{trend.en}</small></h3>
      <p>{trend.summary}</p>
      <div className="tags">{trend.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      <div style={{ marginTop: 14 }}><StatusPill status={trend.status} /></div>
    </Link>
  );
}
