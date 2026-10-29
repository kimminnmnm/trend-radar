# TREND RADAR 2.0

> From Trends to Cultural Insights.

**한국 2030의 트렌드를 실제 데이터로 찾아내고, 왜 뜨는지(WHY)와 무엇으로 이루어졌는지(DNA)를 분석해 콘텐츠 기획까지 이어주는 문화 인텔리전스 도구**입니다.

NAVER 검색 트렌드, Instagram 해시태그, YouTube 공개 영상, OpenAI 분석을 함께 쓰고, 모든 결과에 **어디서 온 데이터인지**를 표시합니다. 데모 데이터를 실제 데이터처럼 보여주지 않는 것이 이 프로젝트의 기본 원칙입니다.

> 화면은 Y2K 레트로 데스크톱 감성의 **Y2K Pixel Desktop** 디자인입니다(하늘·픽셀 잔디 배경, 검은 외곽선 창, 파란 타이틀바, 스티커 그림자, 형광 노랑·초록 포인트, 픽셀 제목 글꼴). 규칙은 [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)에 있습니다.

---

## 목차

1. [주요 기능](#1-주요-기능)
2. [빠른 시작](#2-빠른-시작)
3. [환경변수 설정](#3-환경변수-설정)
4. [화면별 사용법](#4-화면별-사용법)
5. [데이터 상태 표시 읽는 법](#5-데이터-상태-표시-읽는-법)
6. [비용과 호출 한도](#6-비용과-호출-한도)
7. [데이터의 한계 (꼭 읽어 주세요)](#7-데이터의-한계-꼭-읽어-주세요)
8. [저장 위치와 Supabase](#8-저장-위치와-supabase)
9. [프로젝트 구조](#9-프로젝트-구조)
10. [API 목록](#10-api-목록)
11. [테스트와 품질 검사](#11-테스트와-품질-검사)
12. [문제 해결](#12-문제-해결)
13. [관련 문서](#13-관련-문서)

---

## 1. 주요 기능

| 기능 | 화면 | 하는 일 | 사용하는 데이터 |
|---|---|---|---|
| **지금 뜨는 해시태그** | Overview | Instagram 해시태그의 최근 게시 속도(시간당 게시물 수)와 전일 대비 변화 측정 | Instagram Graph API, OpenAI 웹 검색 |
| **2030 HIGH SCORE** | Overview | 웹에서 찾은 2030 트렌드 후보를 NAVER 19–39세 검색 관심도로 검증해 상승률 순위 제공 | OpenAI 웹 검색, NAVER DataLab |
| **TREND WHY** | `/trends/[id]/why` | 트렌드가 왜 뜨는지 근거와 함께 분석 | NAVER 시계열, Instagram 게시물, YouTube 공개 영상, OpenAI |
| **TREND DNA** | `/trends/[id]/dna` | 트렌드를 6개 차원(Aesthetic · Emotion · Behavior · Object · Culture · Audience)으로 분해 | WHY 결과, OpenAI, 임베딩 |
| **DISCOVER** | `/discover` | 키워드를 직접 분석하거나 Instagram 공동 해시태그로 후보 발굴 | NAVER, Instagram |
| **CULTURE MAP** | `/culture-map` | 분석한 트렌드 사이의 관계를 계산해 그래프로 표시. 연결선을 누르면 왜 연결됐는지·관계 점수·근거 확인 | 저장된 WHY·DNA·임베딩·근거 원장 |
| **COLLISION** | `/collision` | 트렌드 2~4개를 섞어 새로운 기획 아이디어 도출 | DNA 결과, OpenAI |
| **TREND LAB** | `/lab` | 브랜드 브리프에 트렌드를 적용할 수 있는지 항목별 검토 | 분석 결과, OpenAI |
| **CONTENT STUDIO** | `/studio` | 분석 결과로 콘텐츠 기획안 작성 | WHY · DNA · Collision · Lab |
| **WORKSPACE** | `/workspace` | 저장한 분석 · Collision · 기획안 모아보기 | 브라우저 / Supabase |

모든 AI 분석에는 근거 ID(예: `NAVER-01`, `IG-03`)가 붙습니다. 서버가 실제로 수집한 근거 목록(근거 원장)에 없는 ID는 지우고, 근거 없이 "검증됨"이라고 주장한 항목은 `Insufficient Evidence`로 낮춥니다.

---

## 2. 빠른 시작

### 필요한 것

- **Node.js 20 이상** (개발 환경: Node 24)
- API 키 (아래 [환경변수 설정](#3-환경변수-설정) 참고). 키가 없어도 화면과 데모 데이터는 볼 수 있습니다.

### 설치와 실행

```bash
git clone https://github.com/kimminnmnm/trend-radar.git
cd trend-radar
npm install

# 환경변수 파일 만들기 (.env.local은 Git에 올라가지 않습니다)
cp .env.example .env.local
# .env.local을 열어 API 키 입력

npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

> **`.env.local`을 수정하거나 코드를 크게 바꾼 뒤에는 개발 서버를 껐다 켜세요** (`Ctrl+C` → `npm run dev`). 서버가 예전 설정을 들고 있으면 스캔이 실패할 수 있습니다.

### 배포용 실행

```bash
npm run build
npm run start
```

---

## 3. 환경변수 설정

`.env.local`에 입력합니다. 모든 키는 **서버에서만** 쓰이고 브라우저로 전달되지 않습니다(`NEXT_PUBLIC_`로 시작하는 Supabase 공개 키 제외).

### OpenAI (WHY · DNA · Collision · Lab · Studio · 트렌드 후보 검색)

| 변수 | 설명 |
|---|---|
| `OPENAI_API_KEY` | OpenAI API 키 |
| `OPENAI_MODEL` | 분석 모델 (기본 `gpt-6-luna`) |
| `OPENAI_RATE_PER_MINUTE` | 클라이언트별 분당 호출 상한 (기본 6) |
| `OPENAI_DAILY_LIMIT` | 서버 프로세스 하루 호출 상한 (기본 60) |

### NAVER (검색어 트렌드)

| 변수 | 설명 |
|---|---|
| `NAVER_CLIENT_ID` | **NAVER Cloud API HUB** 애플리케이션의 API Key ID |
| `NAVER_CLIENT_SECRET` | **NAVER Cloud API HUB** 애플리케이션의 API Key |

> ⚠️ NAVER Developers(`openapi.naver.com`)의 키가 아니라 **NAVER Cloud Platform API HUB**(`naverapihub.apigw.ntruss.com`)의 키입니다. Developers 키를 넣으면 401 오류가 납니다.

### Meta / Instagram (해시태그)

| 변수 | 설명 |
|---|---|
| `META_ACCESS_TOKEN` | Facebook 사용자 액세스 토큰 (`pages_show_list`, `instagram_basic`, `pages_read_engagement` 권한 필요) |
| `META_IG_USER_ID` | Instagram 프로페셔널 계정 ID. 비워 두면 연결된 Facebook 페이지에서 자동으로 찾습니다 |
| `META_GRAPH_API_VERSION` | Graph API 버전 (기본 `v26.0`) |
| `META_PUBLIC_CONTENT_ACCESS` | `approved` / `pending` / `unknown`. `pending`이면 해시태그 검색을 막습니다 |

- Instagram 계정은 **비즈니스 또는 크리에이터 계정**이어야 하고, Facebook 페이지에 연결돼 있어야 합니다.
- Meta 앱 심사 중에는 `META_PUBLIC_CONTENT_ACCESS=pending`을 유지하고, 승인되면 `approved`로 바꾼 뒤 서버를 재시작하세요.
- 토큰은 만료됩니다. 만료되면 화면에 "토큰이 만료" 오류가 뜨니, 새로 발급해 `.env.local`에 넣고 서버를 재시작하세요.

### YouTube Data API v3 (WHY 영상 근거)

| 변수 | 설명 |
|---|---|
| `YOUTUBE_API_KEY` | Google Cloud에서 YouTube Data API v3를 활성화한 서버용 API 키 |
| `YOUTUBE_DAILY_SEARCH_LIMIT` | 앱 프로세스의 일일 `search.list` 실행 상한(기본 20, 캐시 적중 제외) |

키는 서버에서만 사용합니다. WHY 분석은 최근 30일 관련 공개 영상 최대 10개를 수집하고, 제목·게시일·공개 조회수·한국 시간대별 게시 분포를 `YT-xx` 근거로 연결합니다. 검색 결과는 6시간 캐시합니다.

> Google Trends API는 Alpha 접근 승인 전입니다. 현재 앱은 Google Trends를 연결된 것으로 표시하지 않으며 비공식 스크래핑을 사용하지 않습니다.

### Supabase (선택: 클라우드 저장 · 로그인)

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 공개 키 |

`NEXT_PUBLIC_SUPABASE_URL`에는 `/rest/v1`이 붙지 않은 프로젝트 루트(`https://프로젝트참조.supabase.co`)를 넣으세요. REST 경로를 넣어도 앱이 루트로 고쳐 쓰지만, 환경변수 자체를 고치는 것을 권장합니다.

Supabase 없이도 모든 기능이 동작하며, 결과는 브라우저에 저장됩니다. 자세한 내용은 [8. 저장 위치와 Supabase](#8-저장-위치와-supabase)를 보세요.

### 비용 API 접근 제어 (배포 전 필수)

| 변수 | 설명 |
|---|---|
| `PAID_API_ACCESS` | `open`(누구나) · `auth`(Supabase 로그인 사용자) · `allowlist`(지정 이메일만). 비워 두면 `npm run dev`는 `open`, `npm run start`는 `auth` |
| `PAID_API_ALLOWED_EMAILS` | `allowlist` 모드에서 실제 분석을 허용할 이메일(쉼표 구분) |
| `EXTERNAL_RATE_PER_MINUTE` | OpenAI 전에 NAVER·Meta를 부르는 요청의 분당 상한(기본 10) |

- 실제 분석 버튼(WHY·DNA·Collision·Lab·Studio·해시태그·2030 스캔·Instagram 검색)은 로그인 토큰을 붙여 호출합니다. 권한이 없으면 저장된 결과와 DEMO만 볼 수 있습니다.
- **공개 배포에는 `allowlist`를 쓰세요.** Supabase는 누구나 가입할 수 있어 `auth`만으로는 비용 남용을 막지 못합니다.
- 요청 한도와 캐시는 서버 메모리 기반이라, 여러 인스턴스로 배포하면 인스턴스마다 따로 셉니다.

### 연결 상태 확인

앱의 **Settings** 화면에서 각 API가 설정됐는지, Supabase 테이블이 준비됐는지, 오늘 OpenAI를 몇 번 호출했는지 확인할 수 있습니다.

---

## 4. 화면별 사용법

처음이라면 Overview의 **WELCOME.EXE 안내**와 모든 화면 상단의 **진행 막대**(① 찾기 → ② 왜 뜨나 → ③ DNA 분해 → ④ 섞어 보기 → ⑤ 기획안)를 따라가세요. 진행 막대는 지금 분석 중인 트렌드와 다음 단계 버튼을 보여 주고, DEMO 트렌드를 보고 있으면 실제 데이터가 아니라고 알려 줍니다. 안내를 닫은 뒤에는 사이드바 **사용 가이드**로 다시 열 수 있습니다.

### 4-1. Overview — 지금 뜨는 해시태그 (INSTA.EXE)

Instagram 해시태그가 **지금 얼마나 활발하게 올라오는지** 측정합니다.

**처음 사용할 때**

1. 추적 중인 기존 해시태그가 있으면 **START**를 누릅니다. 기본 동작은 Meta가 이미 검색한 해시태그 ID의 게시물만 갱신하며 신규 한도를 쓰지 않습니다.
2. 새 해시태그를 검색할 때만 **신규 해시태그 검색 승인**을 켭니다. 웹 후보까지 필요하면 승인 후 **승인 범위에서 웹 후보도 찾기**를 별도로 켭니다. (약 1~2분)
3. 결과는 두 칸으로 나뉘어 표시됩니다.

| 칸 | 기준 | 무엇을 알 수 있나 |
|---|---|---|
| **▲ 오르는 순** | 전일 대비 변화율 높은 순 | **지금 뜨고 있는 것**. 같은 태그를 20시간 이상 지나 다시 잰 경우만 나옵니다 (내린 태그는 아래쪽) |
| **● 많이 올라오는 순** | 시간당 게시물 수 | **지금 많이 올라오는 것**. 팬층이 큰 대상은 새롭지 않아도 위에 옵니다 |

게시물이 많다고 뜨는 중인 것은 아닙니다. 예를 들어 #치이카와가 많이 올라오는 순 1위라도, 꾸준히 인기 있는 것인지 요즘 급상승 중인 것인지는 **오르는 순** 칸에서 확인하세요.

**추적할 해시태그 직접 추가하기**

1. 보드 가운데의 **"추적 중"** 줄 오른쪽 입력칸(`#치이카와`라고 흐리게 적힌 칸)에 해시태그를 입력합니다.
   - `#`은 붙여도, 빼도 됩니다. 띄어쓰기는 자동으로 지워집니다 (`#새 태그` → `새태그`).
   - 문자 · 숫자 · 밑줄(`_`)만 쓸 수 있습니다.
2. **추가** 버튼을 누르거나 Enter를 칩니다.
3. 태그가 **점선 테두리 칩**으로 나타납니다. 점선은 "아직 측정 안 함"이라는 뜻입니다.
4. **RESCAN**(처음이면 **START**)을 누르면 측정되고, 칩이 **실선 테두리**로 바뀝니다.

| 칩 모양 | 의미 | 주간 한도 |
|---|---|---|
| 실선 테두리 | 이미 측정한 태그. 다음 스캔에서 다시 측정 | 쓰지 않음 |
| 점선 테두리 | 아직 측정하지 않은 새 태그 | 측정할 때 1개 사용 |

- 추적 목록은 **최대 10개**입니다. 칩의 **✕**를 누르면 추적을 해제하고, 그 태그는 **보드에서도 사라집니다**. 직접 다시 추가하거나 이후 웹 검색이 그 태그를 다시 찾아오면 다시 나타납니다.
- 보드는 **최근 24시간 동안의 스캔을 합쳐서** 태그마다 가장 최근 측정을 보여줍니다. 그래서 웹 검색을 끄고 추적 태그만 다시 재도, 앞서 웹 검색으로 찾은 후보가 함께 보입니다. 이전 스캔에서 가져온 행에는 `N시간 전 측정`이 표시됩니다.
- 새 태그는 한 번 스캔에 **최대 3개**까지 측정하고, 나머지는 다음 스캔에서 측정합니다.
- **추가** 버튼이 회색으로 눌리지 않으면, 입력칸이 비어 있거나 이미 10개를 추적 중인 것입니다.
- 기존 태그만 재고 싶으면 신규 검색 승인을 끈 기본 상태로 두세요. OpenAI 비용이 들지 않고, 고유 해시태그 한도도 추가로 쓰지 않습니다.
- 자동 신규 검색은 기본적으로 꺼져 있습니다. 점선 태그는 승인을 켜지 않으면 보류되며, 검색 전에 예상 신규 사용량이 표시됩니다.
- 주간 한도 상세를 펼치면 Meta API가 반환한 최근 고유 해시태그 목록을 볼 수 있습니다. Meta는 과거 검색 시각을 제공하지 않으므로, 앱에서 새로 검색한 항목만 검색 시각과 7일 후 반환 예정 시각을 기록합니다.
- 측정된 태그 중 **시간당 1개 이상** 올라오는 태그는 자동으로 추적 목록에 들어갑니다.

**표 읽는 법**

| 열 | 의미 |
|---|---|
| `20 /h` | 시간당 게시물 수. `*`가 붙으면 게시물이 많아 최근 일부만 받은 표본 속도 |
| `24h 9개` | 최근 24시간 게시물을 끝까지 센 **정확한 값** |
| `24h 300+개` | 게시물이 많아 300개까지만 받음. 실제로는 더 많음 |
| `▲ 35%` / `▼ 12%` | (오르는 순) 20시간 이상 전의 측정과 비교한 변화율 |
| `0.4/h → 0.6/h · 24시간 간격` | (오르는 순) 이전 → 지금 속도와 두 측정 사이 간격 |
| `▶` | 해당 키워드의 WHY 분석으로 이동 |

**전일 대비 상승률 보는 법**: 첫날은 **오르는 순** 칸이 비어 있고, 언제 RESCAN하면 비교되는지 시각이 안내됩니다. 그 시각 이후(보통 다음 날) **RESCAN**하면 ▲/▼가 나옵니다. 이전 측정과 방식(24시간 전체 / 최근 표본)이 다른 태그는 비교하지 않습니다. 매일 한 번씩, 가능하면 **비슷한 시각에** 재면 가장 정확합니다.

### 4-2. Overview — 2030 HIGH SCORE (HISCORE.EXE)

1. **PRESS START**를 누릅니다.
2. 웹 검색으로 2030 트렌드 후보 약 10~13개를 찾고, NAVER 검색어 트렌드에 **19–39세 연령 필터**를 걸어 검증합니다. (약 30초)
3. 각 키워드의 **최근 약 3개월 상승률**(최근 1/3 평균 ÷ 초기 1/3 평균) 순으로 순위를 보여줍니다.

- **상승률 순 / 관심도 수준 순**으로 정렬을 바꿀 수 있습니다. 관심도 수준은 NAVER가 한 번에 5개만 비교해 주기 때문에 여러 묶음을 환산한 **추정치**입니다(`≈` 추정, `≈?` 정밀도 낮음).
- 결과는 12시간 캐시되며, 다시 받으려면 **RESCAN**을 누릅니다.
- **HOW THIS SCORE WORKS**를 펼치면 계산 방법과 출처 수가 나옵니다.

### 4-3. TREND WHY — 왜 뜨는가

1. **Discover**에서 키워드를 입력해 분석을 시작하거나, Overview 순위의 **▶ / WHY 분석**을 누릅니다.
2. 비교 키워드를 고르고 분석을 실행하면, NAVER 시계열·Instagram 게시물·YouTube 공개 영상·**뉴스 등 공개 자료(웹 출처)**를 근거로 모은 뒤 OpenAI가 원인 가설을 만듭니다. YouTube와 웹 출처 수집은 각각 끌 수 있습니다.
3. **CONTEXT** 영역에 배경, 실제 문화적 사건, 브랜드 활용 사례(출처와 날짜), 확산에 영향을 줬을 수 있는 콘텐츠가 나옵니다. 각 영역에는 성격 라벨이 붙습니다: `데이터 관찰` · `출처 보도` · `AI 가설`.
4. 각 주장 옆의 근거 ID(`NAVER-01`, `IG-03`, `WEB-02`)를 누르면 원본(게시물·기사 링크)을 볼 수 있습니다. WEB 요약은 AI가 출처를 요약한 것이므로 원문을 확인하세요.

상태 표시:

- `Verified Signal`: 데이터에서 직접 관찰된 사실 (인과관계까지 검증됐다는 뜻은 아님)
- `Supported Hypothesis`: 근거가 있는 가설
- `Creative Hypothesis`: 근거가 약한 창의적 해석
- `Insufficient Evidence`: 근거 부족

### 4-4. TREND DNA — 무엇으로 이루어졌나

WHY 분석이 끝난 트렌드에서 **Analyze DNA**를 누르면 6개 차원으로 분해합니다. 차원 카드를 누르면 설명, 근거, 한계가 나옵니다. WHY 없이는 DNA를 만들지 않습니다(`NOT ANALYZED` 표시).

### 4-5. DISCOVER

- 키워드를 직접 입력해 LIVE 분석을 시작합니다.
- Instagram 공동 해시태그에서 함께 쓰이는 후보를 찾고 NAVER로 일괄 검증할 수 있습니다.
- 하단의 **DEMO** 섹션은 예시 데이터이며 실제 분석이 아닙니다.

### 4-6. CULTURE MAP

LIVE 분석한 트렌드가 노드가 되고, 관계 엔진(`lib/cultural-relationship-engine.ts`)이 두 트렌드마다 관계를 계산합니다. **설명할 수 있는 신호가 하나도 없으면 선을 그리지 않습니다.** 같은 두 트렌드 사이의 여러 신호는 선 하나로 묶이고, 가장 강한 근거 유형의 모양으로 그려집니다.

| 선 모양 | 관계 유형 | 의미 | 검증 상태 |
|---|---|---|---|
| 굵은 초록 실선 | 관찰된 연결 `observed_connection` | 수집한 게시물·자료에서 상대 트렌드 이름이 실제로 언급됨(자기 분석의 수집 키워드는 제외) | Verified Signal (수집 표본 안에서만) |
| 파란 실선 | 공통 속성 `shared_attribute` | 두 DNA가 근거가 있는 같은 표준 속성을 가짐. 다른 표현은 검토된 동의어 규칙(`lib/culture-alias-rules.ts`)으로만 묶음 | Supported Hypothesis |
| 파란 점선 | 의미 유사 `semantic_similarity` | DNA 임베딩 코사인 유사도가 보정 기준 이상: `max(0.65, 내 트렌드 쌍들의 평균 + 표준편차)`. 범례에 현재 기준이 표시됨 | Creative Hypothesis |
| 흐린 주황 점선 | AI 가설 `creative_hypothesis` | 저장된 Collision에서 AI가 제안한 연결 | Creative Hypothesis |

**사용법**

1. **검색**: 트렌드 이름·키워드·DNA 속성을 한글/영문으로 입력하면 일치하는 노드가 노랗게 강조되고 목록이 뜹니다. 목록에서 고르면(또는 Enter) 그 노드로 화면이 이동하고 상세 패널이 열립니다.
2. **필터**: 카테고리는 여러 개 고를 수 있습니다. LIVE 분석에는 처음에 분류가 없으므로(미분류) 노드 상세 패널에서 직접 지정합니다. 지정한 분류는 "사용자 지정"으로 표시되고 관계 계산에는 쓰지 않습니다. **최소 관계 점수** 슬라이더로 기준 미만의 선을 숨깁니다. 필터는 화면에서만 숨기며 저장된 데이터는 지우지 않습니다.
3. **노드 클릭**: DNA 요약, 6개 차원 속성(근거 연결 / AI 가설 구분), 분석 시각, 데이터 출처 수, 관련 트렌드, WHY·DNA 바로가기가 나옵니다.
4. **연결선 클릭**: 관계 유형, 관계 점수(0~100)와 구성 요소, 공통 속성, 서로 다른 속성, 연결 이유, 근거(원문 링크·출처·날짜), AI 가설 여부가 나옵니다. 근거가 없는 관계에는 "이 관계는 AI가 제안한 문화적 연결 가설이며, 실제 확산 관계가 확인된 것은 아닙니다."가 표시됩니다.
5. **Collision으로 보내기**: 노드 패널의 "Collision 비교에 추가"를 두 번 누르거나, 연결선 패널의 "이 두 트렌드로 Collision 준비"를 누른 뒤 **Explore Collision**을 누릅니다. `/collision?trend=<trendId>&trend=<trendId>`로 이동하고, Collision 화면이 저장된 실제 DNA로 그 조합을 미리 선택합니다. 이동만으로는 OpenAI를 호출하지 않습니다.
6. **관계 평가·숨기기**: 연결선 패널에서 4개 항목(이해도·설득력·아이디어 발견·기획 활용도)을 1~5점으로 평가하고, 부적절한 연결은 지도에서 숨길 수 있습니다(데이터는 지우지 않으며 "숨긴 관계 보기"로 되돌림). 평가는 "평가 내보내기 (JSON)"로 받을 수 있습니다.
7. **보기 조작**: Fit view / Reset view, 확대·축소 버튼, 드래그로 노드 이동. 모바일에서는 상세 정보가 아래에서 올라오는 시트로 열리고(닫기 버튼 또는 Esc), 필터는 "필터" 버튼으로 펼칩니다.

**관계 점수(Relationship Score)** = 0.45 × 공통 속성 일치(Jaccard) + 0.30 × DNA 임베딩 의미 유사 + 0.25 × 수집 자료 교차 언급. 알고리즘 기반 유사성 지표이며 **트렌드가 실제로 연결되거나 함께 유행할 확률이 아닙니다.** 그래프 위치도 유사도의 증거가 아닙니다. 자세한 내용은 [docs/CULTURE_MAP_ARCHITECTURE.md](docs/CULTURE_MAP_ARCHITECTURE.md)를 보세요.

**자동 반영(PHASE 5)**: 트렌드의 DNA 분석이 끝나면 별도 입력 없이 표준 메타데이터 버전이 기록되고, 기존 트렌드와의 관계가 계산되어 지도에 노드와 선이 추가됩니다. DNA를 다시 분석하면 새 버전(v2, v3…)이 생기고 이전 버전은 보존됩니다(노드 패널에서 확인). 이 과정은 유료 API를 호출하지 않습니다. 로그인한 상태에서 Supabase 마이그레이션 `202610290005_culture_knowledge.sql`이 적용돼 있으면 메타데이터와 관계가 Supabase에도 저장됩니다.

**Culture Map 테이블 적용**: Supabase SQL Editor에서 `supabase/migrations/202610290005_culture_knowledge.sql`을 실행하세요. 이 마이그레이션은 로컬 Postgres에서 저장·버전·중복 방지·사용자 간 격리(RLS)를 검증했지만, 원격 프로젝트에는 아직 적용되지 않았습니다.

DEMO GRAPH는 미리 작성한 예시입니다. 노드에 주황 줄무늬가 있고, 관계 점수·근거가 없으며 Collision 선택 대상이 아닙니다.

### 4-7. COLLISION → LAB → STUDIO

1. **Collision**: DNA가 있는 트렌드 2~4개를 골라 섞으면 새로운 기획 기회를 제안합니다.
2. **Trend Lab**: 브랜드 브리프를 입력하면 트렌드 적용 가능성을 항목별로 검토합니다. 각 항목에는 `Data Evidence` / `AI Inference` / `Insufficient Evidence`가 표시됩니다.
3. **Content Studio**: 위 결과를 골라 플랫폼, 형식, 톤을 정하면 콘텐츠 기획안을 만듭니다. 💾 버튼으로 Workspace에 저장합니다.

### 4-8. INSTAGRAM

해시태그 하나를 직접 검색해 최근 게시물과 인기 게시물(캡션 · 게시일 · 미디어 유형 · 원본 링크)을 봅니다. 결과는 서버에 5분간 캐시되고, 클라이언트별로 분당 10회까지 검색할 수 있습니다. 여기서 검색한 태그도 **주간 한도**를 씁니다.

### 4-9. WORKSPACE · SETTINGS · ACCOUNT

- **Workspace**: 저장한 분석, Collision, 기획안 목록입니다. 기획안을 다시 열 수 있습니다.
- **Settings**: API 연결 상태와 오늘의 사용량을 봅니다.
- **Account**: Supabase 로그인. 로그인하면 분석을 클라우드에 저장합니다.

---

## 5. 데이터 상태 표시 읽는 법

모든 결과에는 출처 배지가 붙습니다.

| 배지 | 의미 |
|---|---|
| `LIVE ANALYSIS` | 방금 실제 API로 받은 결과 |
| `CACHED` | 서버가 최근 같은 요청의 결과를 재사용 (비용 절약) |
| `SAVED ANALYSIS` | 이전에 저장한 결과를 보여주는 중 (API 호출 없음) |
| `DEMO` | 예시 데이터. 실제 분석이 아님 |
| `ERROR` | 실패. 데모로 대신 채우지 않음 |
| `NOT ANALYZED` | 아직 분석하지 않음 |
| `NOT AVAILABLE` | 해당 데이터를 쓸 수 없음 |

API가 연결돼 있다는 이유만으로 LIVE를 표시하지 않습니다. 존재하지 않는 기사나 가상의 URL도 만들지 않습니다.

---

## 6. 비용과 호출 한도

| 작업 | 외부 호출 | 캐시 |
|---|---|---|
| 해시태그 스캔 (웹 검색 켬) | OpenAI 웹 검색 1회 + 태그당 Meta 호출 최대 7회 | 6시간 |
| 해시태그 스캔 (웹 검색 끔) | 태그당 Meta 호출 최대 7회 | 6시간 |
| 2030 HIGH SCORE | OpenAI 웹 검색 1회 + NAVER 최대 3회 | 12시간 |
| WHY / DNA / Collision / Lab / Studio | OpenAI 1회 (DNA는 임베딩 포함) | 같은 입력은 재사용 |

**OpenAI 보호 장치**

- 같은 요청이 동시에 오면 1번만 호출합니다.
- 분당 6회, 하루 60회를 넘기면 거절합니다. 환경변수로 조정할 수 있습니다.
- 저장된 결과가 있으면 먼저 보여주고, **재분석 / RESCAN** 버튼을 눌렀을 때만 새로 호출합니다.
- 웹 검색 1회는 입력 토큰이 약 2만 개로, 일반 분석보다 비쌉니다.

**Instagram 주간 해시태그 한도 (중요)**

- Meta는 **7일 동안 고유 해시태그 30개**까지만 조회를 허용합니다. 넘기면 일주일 동안 새 태그를 조회할 수 없습니다.
- **이미 조회한 태그는 다시 조회해도 한도를 쓰지 않습니다.** 추적 중인 태그를 매일 재는 것은 무료입니다.
- 앱은 Meta에 실제 사용량을 물어보고 다음과 같이 지킵니다.
  - 새 태그는 스캔당 최대 4개
  - 30개 중 6개는 Instagram 화면의 수동 검색용으로 남김
  - 측정에 실패한 조회도 한도를 쓸 수 있어 사용으로 셈
- 현재 사용량은 해시태그 보드의 **주간 한도** 막대에 표시됩니다.

---

## 7. 데이터의 한계 (꼭 읽어 주세요)

- **Instagram 전체 게시물 수는 알 수 없습니다.** Graph API가 해시태그의 총 게시물 수를 주지 않습니다(`media_count` 요청이 거절됨). 앱의 숫자는 최근 24시간 게시물을 직접 센 값이며, 좋아요 · 댓글 · 조회수도 만들어 넣지 않습니다.
- **게시물이 많은 태그의 속도는 표본입니다.** 300개까지만 받으므로 최근 몇 시간의 속도이고, 낮과 밤에 따라 달라집니다.
- **NAVER 수치는 상대 지수**(0~100)이지 실제 검색 횟수가 아닙니다.
- **YouTube 결과는 최근 30일 최대 10개 검색 표본**입니다. 전체 YouTube 트렌드를 대표하지 않으며, 높은 조회수나 게시 시각 집중이 트렌드의 원인이라는 뜻도 아닙니다.
- **2030 순위는 수집한 후보 안에서의 상대 비교**입니다. 한국 2030 전체의 공식 순위가 아닙니다.
- **NAVER 순위는 계절 영향을 받습니다.** 3개월 비교라 가을 옷처럼 계절 상품이 상승으로 보일 수 있습니다. 전년 동기 비교는 아직 없습니다.
- **트렌드 후보는 웹 검색에 의존합니다.** 검색 도구가 실제로 연 URL을 인용한 후보만 남기지만, 어떤 후보가 잡히는지는 검색 결과에 따라 달라집니다.
- **AI 분석은 해석입니다.** 근거 ID로 확인할 수 있는 부분과 AI 추론을 구분해 표시하니, 기획에 쓰기 전에 근거를 확인하세요.
- **전일 대비 비교 이력은 브라우저에 저장됩니다.** 다른 기기나 다른 브라우저에서는 기준선부터 다시 시작합니다.

---

## 8. 저장 위치와 Supabase

| 데이터 | 기본 저장 위치 | Supabase 사용 시 |
|---|---|---|
| WHY · DNA 분석 | 브라우저 (localStorage) | 로그인하면 `trend_analyses` 테이블 |
| 콘텐츠 기획안 | 브라우저 | `saved_items` 테이블 |
| Collision · Lab 결과 | 브라우저 | (아직 브라우저만) |
| 해시태그 · 2030 스캔 이력 | 브라우저 | (브라우저만) |

**Supabase를 쓰려면** Supabase 대시보드 → SQL Editor에서 마이그레이션을 **순서대로** 실행합니다.

1. `supabase/migrations/202610280001_live_analysis.sql`
2. `supabase/migrations/202610280002_harden_grants.sql`
3. `supabase/migrations/202610280003_live_dna_pipeline.sql`
4. `supabase/migrations/202610290004_youtube_evidence.sql`

실행 전에는 클라우드 저장이 동작하지 않고, 자동으로 브라우저 저장으로 대신합니다. 브라우저 데이터를 지우면 저장 결과도 사라집니다.

---

## 9. 프로젝트 구조

```
app/                    Next.js App Router 페이지와 API 라우트
  api/                  서버 API (아래 10번 참고)
  trends/[id]/why|dna   트렌드별 WHY · DNA 페이지
  globals.css           디자인 토큰과 공통 스타일 (Y2K Pixel Desktop)
components/             화면 컴포넌트
  overview.tsx          Overview
  ig-pulse.tsx          지금 뜨는 해시태그 보드
  now-trending.tsx      2030 HIGH SCORE 보드
  live-why-panel.tsx    LIVE WHY 분석
  dna-view.tsx          DNA 화면
  culture-map.tsx       Culture Map (React Flow)
  ui.tsx                공통 UI (PageHeader, DataBadge, StatusPill, EvidenceRefs …)
lib/                    서버 · 공용 로직
  meta.ts               Instagram Graph API (해시태그 검색, 게시 속도 측정, 한도 조회)
  ig-pulse.ts           해시태그 스캔 (후보 검색 → 측정 → 한도 관리)
  ig-pulse-view.ts      전일 대비 비교, 추적 목록 규칙
  naver.ts              NAVER API HUB 검색어 트렌드
  trend-now.ts          2030 스캔 (웹 검색 → NAVER 검증 → 순위)
  openai-client.ts      OpenAI Responses API (Structured Outputs, 웹 검색, 임베딩)
  openai-analysis.ts    WHY 분석
  openai-dna.ts         DNA 분석
  openai-insight.ts     Collision · Lab · Studio
  evidence-ledger.ts    근거 원장(NAVER-xx, IG-xx) 생성
  signal.ts             시계열 통계, 근거 ID 검증, 상태 하향 규칙
  ai-guard.ts           캐시 · 중복 요청 병합 · 호출 상한
  storage.ts            브라우저 저장소
  schemas.ts            Zod 스키마
supabase/migrations/    DB 스키마
tests/                  Playwright E2E 테스트와 실측 데이터 fixture
docs/                   설계 · 감사 · 디자인 문서
```

**기술 스택**: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Zod 4 · Recharts · React Flow · Supabase · Playwright

---

## 10. API 목록

모든 API는 `POST`에 JSON 본문을 받습니다(상태 조회 제외). 잘못된 입력은 외부 API를 호출하지 않고 `400`으로 거절합니다.

| 경로 | 용도 |
|---|---|
| `/api/trends/instagram` | 해시태그 게시 속도 스캔 `{ force, discover, allowNew, track[], add[] }` |
| `/api/meta/quota` | 최근 7일 고유 해시태그 목록과 Meta 실측 사용량 조회(신규 검색 없음) |
| `/api/youtube/search` | 키워드 관련 최근 공개 영상·통계·시간대별 게시 분포 조회 |
| `/api/trends/now` | 2030 HIGH SCORE 스캔 `{ force }` |
| `/api/analyze` | TREND WHY 분석 |
| `/api/dna` | TREND DNA 분석 |
| `/api/collision` | Collision 분석 |
| `/api/lab` | Trend Lab 검토 |
| `/api/studio` | 콘텐츠 기획안 생성 |
| `/api/discover/validate` | 후보 키워드 NAVER 일괄 검증 |
| `/api/meta/hashtag` | 해시태그 단건 검색 (Instagram 화면) |
| `/api/meta/status` | Meta 연결 상태 (GET) |
| `/api/integrations/status` | 전체 연동 상태 · 사용량 (GET) |

---

## 11. 테스트와 품질 검사

```bash
npm run typecheck   # TypeScript 검사
npm run lint        # ESLint
npm run build       # 프로덕션 빌드
npm run test:e2e    # Playwright E2E (데스크톱 + 모바일)
```

- E2E 테스트는 `127.0.0.1:3100`에서 빌드된 앱을 띄워 실행합니다. 먼저 `npm run build`를 하세요.
- 테스트는 **실제 외부 API를 호출하지 않습니다.** 실제 측정 결과를 저장한 fixture(`tests/fixtures/`)를 사용하고, 게시물 링크와 캡션은 익명화했습니다.
- 처음 실행할 때는 브라우저 설치가 필요할 수 있습니다: `npx playwright install chromium`

---

## 12. 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 스캔이 `Cannot read properties of undefined`로 실패 | 개발 서버가 예전 코드를 들고 있음 → 서버 재시작 |
| NAVER 401 오류 | NAVER Developers 키를 넣음 → **API HUB** 키로 교체 |
| "Meta 액세스 토큰이 만료" | 토큰 재발급 → `.env.local` 수정 → 서버 재시작 |
| 해시태그가 "보류(다음 스캔)" | 스캔당 새 태그 4개 제한 또는 주간 한도 도달 → 다음 스캔 / 다음 주 |
| 해시태그 "측정 실패: Meta API 응답 시간이 초과" | 게시물이 많은 태그의 일시적 지연 → 잠시 후 RESCAN |
| "Instagram에 해시태그가 없음" | 그 태그로 올라온 게시물이 없음 → 더 흔히 쓰는 표기로 추가 |
| "오르는 순" 칸이 비어 있음 | 같은 태그를 20시간 이상 지나 다시 재야 비교됨 → 칸에 안내된 시각 이후 RESCAN |
| 분석 결과가 사라짐 | 브라우저 저장소를 지움 → Supabase를 설정하면 클라우드에 보관 |
| 클라우드 저장 실패 (PGRST205) | Supabase 마이그레이션 미적용 → [8번](#8-저장-위치와-supabase) 참고 |
| "호출 한도 초과" | 분당 6회 / 하루 60회 초과 → 잠시 후 다시, 또는 환경변수 조정 |

---

## 13. 관련 문서

| 문서 | 내용 |
|---|---|
| [docs/LIVE_DATA_AUDIT.md](docs/LIVE_DATA_AUDIT.md) | 외부 API 실측 결과, 기능별 데이터 출처, 알려진 한계 |
| [docs/CULTURE_MAP_ARCHITECTURE.md](docs/CULTURE_MAP_ARCHITECTURE.md) | Culture Map 메타데이터·DB·관계 엔진·지도 화면 구조 |
| [docs/CULTURE_MAP_VALIDATION.md](docs/CULTURE_MAP_VALIDATION.md) | Culture Map 검증 결과와 미검증 항목 |
| [docs/CULTURE_MAP_PHASE4_REPORT.md](docs/CULTURE_MAP_PHASE4_REPORT.md) | PHASE 4 인터랙티브 지도 개발 보고 |
| [docs/CULTURE_MAP_PHASE5_REPORT.md](docs/CULTURE_MAP_PHASE5_REPORT.md) | PHASE 5 분석→지도 자동 반영 파이프라인 보고 |
| [docs/CULTURE_MAP_PHASE6_REPORT.md](docs/CULTURE_MAP_PHASE6_REPORT.md) | PHASE 6 실측 8개 트렌드 관계 검증과 수정 |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Y2K Pixel Desktop 디자인 토큰과 컴포넌트 규칙 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 시스템 구조 |
| [docs/PRODUCT.md](docs/PRODUCT.md) | 제품 개요 |
| [docs/STATUS.md](docs/STATUS.md) | 진행 상황 |
| [docs/VALIDATION.md](docs/VALIDATION.md) | 검증 기록 |

---

### 보안 메모

- `.env.local`은 `.gitignore`로 제외돼 있습니다. **API 키를 코드나 이슈에 붙여넣지 마세요.**
- 토큰과 키는 서버 로그에 출력하지 않습니다.
- 공식 API 제한을 우회하는 스크래핑은 하지 않습니다.
