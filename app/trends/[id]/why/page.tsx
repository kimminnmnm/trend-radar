import { notFound } from "next/navigation";
import { WhyView } from "@/components/why-view";
import { resolveTrend } from "@/lib/demo-data";
export default async function WHYPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const trend=resolveTrend(id);if(!trend)notFound();return <WhyView trend={trend}/>}
