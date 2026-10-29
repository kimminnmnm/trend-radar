import "server-only";

export class NaverDataLabError extends Error {
  constructor(message: string, public readonly status = 502, public readonly code?: string) { super(message); }
}

const NAVER_API_HUB_ENDPOINT = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";

export type NaverTrendSignal = {
  source: "live_naver_datalab";
  sourceName: "NAVER DataLab Search Trend";
  collectedAt: string;
  startDate: string;
  endDate: string;
  timeUnit: "date" | "week" | "month";
  title: string;
  keywords: string[];
  data: Array<{ period: string; ratio: number }>;
  series: Array<{ title: string; keywords: string[]; data: Array<{ period: string; ratio: number }> }>;
  methodology: string;
};

function formatDate(date: Date) { return date.toISOString().slice(0, 10); }

/** ages: NAVER 연령 구간 코드("3"=19–24, "4"=25–29, "5"=30–34, "6"=35–39 …). 생략하면 전체 연령. */
export async function collectNaverTrend(trend: string, keywords: string[] = [trend], periodMonths: 1 | 3 | 12 = 12, filters: { ages?: string[] } = {}): Promise<NaverTrendSignal> {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new NaverDataLabError("NAVER DataLab 키가 설정되지 않았습니다.", 503, "NAVER_NOT_CONFIGURED");
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - periodMonths, end.getUTCDate()));
  const cleanKeywords = [...new Set([trend, ...keywords].map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 5);
  const timeUnit: NaverTrendSignal["timeUnit"] = periodMonths === 1 ? "date" : periodMonths === 3 ? "week" : "month";
  const requestBody = {
    startDate: formatDate(start),
    endDate: formatDate(end),
    timeUnit,
    keywordGroups: cleanKeywords.map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
    ...(filters.ages?.length ? { ages: filters.ages } : {}),
  };
  let response: Response;
  try {
    response = await fetch(NAVER_API_HUB_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new NaverDataLabError(timedOut ? "NAVER DataLab 응답 시간이 초과됐습니다. 잠시 후 다시 시도하세요." : "NAVER DataLab에 연결할 수 없습니다.", 504, timedOut ? "NAVER_TIMEOUT" : "NAVER_NETWORK_ERROR");
  }
  const raw = await response.json().catch(() => ({})) as {
    errorCode?: string;
    errorMessage?: string;
    error?: { errorCode?: string; message?: string; details?: string };
    errMsg?: string;
    errId?: string;
    startDate?: string;
    endDate?: string;
    timeUnit?: "date" | "week" | "month";
    results?: Array<{ title: string; keywords: string[]; data: Array<{ period: string; ratio: number }> }>;
  };
  if (!response.ok) {
    const apiCode = raw.error?.errorCode || raw.errorCode || raw.errId;
    const apiMessage = raw.error?.message || raw.error?.details || raw.errorMessage || raw.errMsg;
    const message = response.status === 401
      ? "NAVER API HUB 인증에 실패했습니다. Application의 Client ID, Client Secret 및 검색어 트렌드 권한을 확인하세요."
      : response.status === 403
        ? "NAVER API HUB Application에서 검색어 트렌드 API 권한과 HTTPS 호출 설정을 확인하세요."
        : response.status === 429
          ? "NAVER API HUB 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요."
          : apiMessage || "NAVER DataLab 요청에 실패했습니다.";
    throw new NaverDataLabError(message, response.status, apiCode);
  }
  const result = raw.results?.[0];
  if (!result) throw new NaverDataLabError("NAVER DataLab에서 검색 추이 데이터를 반환하지 않았습니다.", 502, "NAVER_EMPTY_RESULT");
  return {
    source: "live_naver_datalab",
    sourceName: "NAVER DataLab Search Trend",
    collectedAt: new Date().toISOString(),
    startDate: raw.startDate || requestBody.startDate,
    endDate: raw.endDate || requestBody.endDate,
    timeUnit: raw.timeUnit || requestBody.timeUnit,
    title: result.title,
    keywords: result.keywords,
    data: result.data.map((item) => ({ period: item.period, ratio: Number(item.ratio) })),
    series: (raw.results ?? []).map((series) => ({
      title: series.title,
      keywords: series.keywords,
      data: series.data.map((item) => ({ period: item.period, ratio: Number(item.ratio) })),
    })),
    methodology: "요청 기간 중 검색 관심도가 가장 높은 시점을 100으로 환산한 상대 지수이며 절대 검색량이 아닙니다.",
  };
}
