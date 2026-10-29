import { notFound } from "next/navigation";
import { DNAView } from "@/components/dna-view";
import { resolveTrend } from "@/lib/demo-data";
export default async function DNAPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const trend=resolveTrend(id);if(!trend)notFound();return <DNAView trend={trend}/>}
