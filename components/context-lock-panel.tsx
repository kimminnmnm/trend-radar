"use client";

import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import { lockEvidenceLimited, type DriftItem, type EditorialContextLock } from "@/lib/editorial-lock";

/**
 * T6 CONTEXT LOCK 패널. 선택한 현상·핵심 행동·문화 맥락·관측 근거는 읽기 전용(WHY·발견 결과에서 옴),
 * 편집 초점·창작 가설·금지 이탈·사용자 자료는 사용자가 고친다. 근거가 부족하면 주제를 바꾸지 않고 추가 조사·자료를 요청한다.
 */
export function ContextLockPanel({ lock, onChange, whyHref, research, discoveryIds = [] }: { lock: EditorialContextLock; onChange: (next: EditorialContextLock) => void; whyHref?: string; research: boolean; discoveryIds?: string[] }) {
  const limited = lockEvidenceLimited(lock);
  const set = (patch: Partial<EditorialContextLock>) => onChange({ ...lock, ...patch });
  const setDrift = (text: string) => {
    const known = new Map(lock.prohibitedTopicDrift.map((item) => [item.label, item.id]));
    let custom = 0;
    const items: DriftItem[] = text.split("\n").map((line) => line.trim().slice(0, 120)).filter(Boolean).slice(0, 10).map((label) => ({ id: known.get(label) ?? `custom-${(custom += 1)}`, label }));
    set({ prohibitedTopicDrift: items });
  };
  return <section className={`lock ${lock.enabled ? "on" : "off"}`} data-testid="context-lock" aria-label="Editorial context lock">
    <header>
      <small>{lock.enabled ? <Lock size={12}/> : <LockOpen size={12}/>} CONTEXT LOCK · 현상 고정</small>
      <label className="toggle"><input type="checkbox" checked={lock.enabled} onChange={(event) => set({ enabled: event.target.checked })} data-testid="context-lock-toggle"/>{lock.enabled ? "잠금 켜짐" : "잠금 꺼짐(일반 주제로 생성)"}</label>
    </header>
    <dl>
      <div><dt>SELECTED PHENOMENON</dt><dd data-testid="lock-phenomenon"><b>{lock.selectedPhenomenon}</b> <span className="muted">· {lock.parentKeyword} · {lock.evidenceStatus}</span></dd></div>
      <div><dt>CORE BEHAVIOR</dt><dd>{lock.coreBehavior || "—"}</dd></div>
      {lock.culturalContext && <div><dt>CULTURAL CONTEXT</dt><dd>{lock.culturalContext}</dd></div>}
      <div><dt>OBSERVED EVIDENCE</dt><dd data-testid="lock-evidence">{lock.observedEvidenceIds.length ? lock.observedEvidenceIds.join(", ") : "없음"}</dd></div>
    </dl>
    {limited && <div className="limited" role="status" data-testid="lock-limited">
      <p>제작에 쓸 근거 중 이 현상을 직접 보여 주는 것이 <b>{lock.observedEvidenceIds.length}건</b>입니다.{discoveryIds.length > 0 && lock.observedEvidenceIds.length === 0 ? ` 발견 단계 근거(${discoveryIds.join(", ")})는 있지만 아직 제작 원장에 들어오지 않았습니다(이 현상의 WHY 분석을 실행하면 들어옵니다).` : ""} 근거가 없다고 다른 주제로 바꾸지 않습니다. 사실은 확인 필요로 표시하고, 부족한 자료는 편집 메모에 적습니다.</p>
      <p>더 정확하게 만들려면: {whyHref && <><Link href={whyHref}>이 현상의 WHY 분석 실행</Link> · </>}{research ? "디테일 조사가 켜져 있습니다" : "아래 \"디테일 조사\"를 켜기"} · 아래에 직접 자료 넣기</p>
    </div>}
    <label>EDITORIAL FOCUS · 편집 초점<input value={lock.editorialFocus} maxLength={300} onChange={(event) => set({ editorialFocus: event.target.value })} data-testid="lock-focus"/></label>
    <label>CREATIVE HYPOTHESIS · 창작 가설(선택, 사실로 쓰지 않음)<input value={lock.creativeHypothesis} maxLength={300} onChange={(event) => set({ creativeHypothesis: event.target.value })} placeholder="예: 아바타 룩이 현실 메이크업의 새 레퍼런스가 된다면?" data-testid="lock-hypothesis"/></label>
    <label>PROHIBITED TOPIC DRIFT · 다루지 않을 주제(줄마다 하나)<textarea rows={4} value={lock.prohibitedTopicDrift.map((item) => item.label).join("\n")} onChange={(event) => setDrift(event.target.value)} data-testid="lock-drift"/></label>
    <label>USER MATERIALS · 직접 제공하는 자료(메모·링크, 검증 전 자료로 사용)<textarea rows={3} value={lock.userMaterials} maxLength={1500} onChange={(event) => set({ userMaterials: event.target.value })} placeholder="예: 참고 영상 링크, 직접 해 본 재현 메모" data-testid="lock-materials"/></label>
    <style jsx>{`
      .lock{display:grid;gap:8px;padding:10px;border:2px solid #7b3fb5;background:#faf6ff;font-size:12px}.lock.off{border-style:dashed;border-color:#9aa0b4;background:#f6f7fa}
      header{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}header small{display:inline-flex;gap:5px;align-items:center;font-weight:900;letter-spacing:.08em;color:#7b3fb5}.toggle{display:inline-flex;gap:5px;align-items:center;font-size:11px;font-weight:700}
      dl{margin:0;display:grid;gap:4px}dl div{display:grid;gap:1px}dt{font-size:10px;font-weight:900;letter-spacing:.06em;color:#7b3fb5}dd{margin:0;line-height:1.5;overflow-wrap:anywhere}.muted{color:var(--muted)}
      .limited{border:1.5px solid #c98a00;background:#fff6d6;padding:6px 8px;color:#6b4a00}.limited p{margin:0 0 3px;line-height:1.5}.limited :global(a){font-weight:800;text-decoration:underline}
      label{display:grid;gap:3px;font-size:10.5px;font-weight:800;color:var(--blue)}input,textarea{font:inherit;font-size:12px;font-weight:400;color:var(--text);padding:6px;border:1.5px solid var(--ink);border-radius:4px;background:#fff;min-width:0;max-width:100%;resize:vertical}
    `}</style>
  </section>;
}
