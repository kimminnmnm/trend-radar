"use client";

import { useEffect, useRef, useState } from "react";

/**
 * MOTION V4 (Editorial Web) 공용 도구. 라이브러리 없이 IntersectionObserver + CSS로 움직인다(docs/MOTION_V4_IMPLEMENTATION.md).
 * - 화면에 들어오면 class `is-in`을 붙인다(once면 한 번만). 숨김·등장 스타일은 CSS가 맡고, 동작 줄이기에서는 처음부터 보인다.
 * - IntersectionObserver가 없는 환경에서는 바로 보이게 한다(내용이 숨겨진 채 남지 않게).
 */
export function useInView<T extends Element>({ once = true, rootMargin = "0px 0px -10% 0px", threshold = 0 }: { once?: boolean; rootMargin?: string; threshold?: number } = {}) {
  // 콜백 ref: 요소가 나중에 생겨도(데이터를 읽은 뒤 그리는 경우) 그때 관찰을 시작한다.
  const [node, ref] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { const frame = requestAnimationFrame(() => setInView(true)); return () => cancelAnimationFrame(frame); }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); if (once) observer.disconnect(); }
      else if (!once) setInView(false);
    }, { rootMargin, threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, once, rootMargin, threshold]);
  return [ref, inView] as const;
}

/** 스크롤해서 화면에 들어오면 한 번 등장한다. variant는 섹션 성격에 맞춘 등장 방식(CSS: .ed-reveal--{variant}). */
export function Reveal({ variant = "rise", className = "", children, ...rest }: { variant?: "rise" | "stagger" | "cards" | "mask" | "draw"; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return <div ref={ref} className={`ed-reveal ed-reveal--${variant} ${inView ? "is-in" : ""} ${className}`.trim()} {...rest}>{children}</div>;
}

/** 화면에 들어온 뒤에만 그린다(무거운 차트를 처음부터 그리지 않고, 보일 때 그려지는 모습이 전환 애니메이션이 되게). */
export function MountInView({ children, minHeight = 0, testId }: { children: React.ReactNode; minHeight?: number; testId?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: "0px 0px 120px 0px" });
  return <div ref={ref} style={inView ? undefined : { minHeight }} data-testid={testId} data-mounted={inView ? "true" : "false"}>{inView ? children : null}</div>;
}

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * 저장된 실제 값까지 숫자를 올린다. 화면에 처음 들어올 때 한 번, 값이 바뀌면 이전 값에서 새 값으로. 동작 줄이기면 즉시 실제 값.
 * 화면 읽기 도구에는 처음부터 실제 값만 읽힌다(움직이는 숫자는 aria-hidden).
 */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  // 한 픽셀이라도 보이면 시작한다(화면 아래 가장자리에서 0으로 멈춰 보이지 않게).
  const [ref, inView] = useInView<HTMLSpanElement>({ rootMargin: "0px" });
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setReduced(prefersReduced())); return () => cancelAnimationFrame(frame); }, []);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (prefersReduced() || duration <= 0) { const frame = requestAnimationFrame(() => { setShown(value); from.current = value; }); return () => cancelAnimationFrame(frame); }
    const start = performance.now(), origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + (value - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration]);
  // 동작 줄이기면 보이든 말든 실제 값을 바로 보여 준다.
  return <span ref={ref} className="ed-count" data-value={value}><span aria-hidden="true">{reduced ? value : inView ? shown : 0}</span><span className="ed-sr">{value}</span></span>;
}

/** 목록 항목 중 화면 가운데 띠를 지나는 항목의 번호(스크롤에 따라 바뀜). 강제 스크롤 없이 관찰만 한다. */
export function useActiveIndex(count: number) {
  const refs = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { const index = refs.current.indexOf(entry.target as HTMLElement); if (index >= 0) setActive(index); }
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    refs.current.slice(0, count).forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [count]);
  return { active, setActive, bind: (index: number) => (node: HTMLElement | null) => { refs.current[index] = node; } };
}
