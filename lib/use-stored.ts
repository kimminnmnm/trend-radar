"use client";

import { useEffect, useState } from "react";
import { STORAGE_EVENT } from "./storage";

/** localStorage 값을 읽고 같은 탭·다른 탭의 변경을 구독한다. 첫 렌더는 SSR과 동일하게 null. */
export function useStored<T>(reader: () => T): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    const refresh = () => setValue(reader());
    const frame = requestAnimationFrame(refresh);
    window.addEventListener(STORAGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { cancelAnimationFrame(frame); window.removeEventListener(STORAGE_EVENT, refresh); window.removeEventListener("storage", refresh); };
    // reader는 모듈 수준 함수만 전달한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}
