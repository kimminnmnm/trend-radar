# TREND RADAR 2.0

> From Trends to Cultural Insights.

**한국 2030의 트렌드를 실제 데이터로 찾아내고, 지금 어떤 문화적 행동이 관찰되는지 해석한 뒤 콘텐츠 기획과 Figma 제작까지 이어주는 문화 인텔리전스 도구**입니다.

NAVER 검색 트렌드, Instagram 해시태그, YouTube 공개 영상, OpenAI 분석을 함께 쓰고, 모든 결과에 **어디서 온 데이터인지**를 표시합니다. 데모 데이터를 실제 데이터처럼 보여주지 않는 것이 이 프로젝트의 기본 원칙입니다.

> 화면은 Y2K 레트로 데스크톱 감성의 **Y2K Pixel Desktop** 디자인입니다(하늘·픽셀 잔디 배경, 검은 외곽선 창, 파란 타이틀바, 스티커 그림자, 형광 노랑·초록 포인트, 픽셀 제목 글꼴). 규칙은 [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)에 있습니다.

---

## 서비스 한눈에 보기

TREND RADAR는 단순히 “검색량이 올랐다”를 보여주는 대시보드가 아닙니다. 하나의 키워드를 다음 흐름으로 다룹니다.

```text
발견                   이해                         연결                    제작
Overview / Discover → 세부 문화 현상 → WHY → DNA → Trend Web / Culture Map → Collision / Lab → Content Studio → Figma
        실제 API·저장 자료          관찰·출처·가설 분리        실제 연결과 창작 가설 분리       편집 가능한 결과물
```

### 사용자가 얻는 결과

| 질문 | TREND RADAR에서 확인하는 곳 | 결과 예시 |
|---|---|---|
| 지금 무엇이 움직이는가? | Overview, Discover | 검색 관심도 변화, Instagram 게시 속도, 최근 세부 현상 |
| 왜 지금 주목받는가? | Trend WHY | WHAT · WHY NOW · 문화적 맥락 · 이용자 동기 · 확산 콘텐츠 · 기원 |
| 이 트렌드의 구성 요소는 무엇인가? | Trend DNA, Visual DNA | 미학·감정·행동·오브제·문화·대상, 색·구도·질감·모티프 |
| 주변에 어떤 신호가 연결되는가? | Trend Web | 한 검색 안에서 함께 관찰된 키워드·현상·행동·엔티티 |
| 다른 트렌드와 왜 연결되는가? | Culture Map | 공통 속성, 관찰 연결, 의미 유사, 창작 가설과 각각의 근거 |
| 무엇을 만들 수 있는가? | Creative Collision, Trend Lab | SAFE/BOLD/WILD 아이디어, 브랜드 적합성·위험·실행성 검토 |
| 실제 콘텐츠로 어떻게 구성하는가? | Content Studio | 카드뉴스·숏폼의 편집 방향, 슬라이드 카피, 장면, 이미지 브리프 |
| 디자인 작업으로 어떻게 넘기는가? | Figma Plugin | AUTO DESIGN 또는 MY TEMPLATES 기반의 편집 가능한 Figma 프레임 |

### 대표 사용 시나리오

1. **단일 트렌드 분석**: 키워드 검색 → 현재 세부 현상 선택 → WHY → DNA → 카드뉴스 제작.
2. **두 문화의 실제 접점 조사**: Trend Web에서 노드 2개 선택 → 관찰된 연결 확인 → 관련 현상 콘텐츠 제작.
3. **새로운 콘셉트 개발**: 트렌드 2개 선택 → Creative Collision의 SAFE/BOLD/WILD 중 하나 선택 → Content Studio 제작.
4. **브랜드 적용 검토**: Collision 또는 분석 결과 → Trend Lab에서 근거·적합성·위험 검토 → Studio로 전달.
5. **디자인 제작**: 슬라이드별 이미지 연결 → Figma로 보내기 → 자동 디자인 또는 사용자의 Figma 템플릿에 콘텐츠 적용.

### 데이터에 대한 기본 원칙

- **관찰 사실, 출처 기반 해석, AI 가설을 분리**합니다.
- 검색 관심도·조회수·게시물 수만으로 원인이나 전체 시장 인기를 단정하지 않습니다.
- 근거 원장에 없는 출처 ID는 제거하고, 근거가 부족한 주장은 `Insufficient Evidence`로 낮춥니다.
- 저장 결과·캐시·데모·실시간 API 결과를 서로 다른 상태로 표시합니다.
- 유료 API와 신규 Instagram 해시태그 검색은 사용자 행동 없이 자동 실행하지 않습니다.

---

## 목차

0. [서비스 한눈에 보기](#서비스-한눈에-보기)
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
| **WHAT'S HAPPENING NOW?** | Overview | 키워드의 역사나 정의 대신 최근 실제 자료에서 구체적인 행동·장면·하위 현상을 찾음 | YouTube, 웹 출처, NAVER, 저장 근거 |
| **TREND WEB** | Overview | 한 검색에서 발견된 키워드·현상·엔티티·행동을 근거 상태별 네트워크로 탐색하고 두 노드의 관계를 분석 | 저장된 Discovery 결과, Connection API |
| **TREND WHY** | `/trends/[id]/why` | 트렌드가 왜 뜨는지 근거와 함께 분석 | NAVER 시계열, Instagram 게시물, YouTube 공개 영상, OpenAI |
| **TREND DNA** | `/trends/[id]/dna` | 트렌드를 6개 차원(Aesthetic · Emotion · Behavior · Object · Culture · Audience)으로 분해 | WHY 결과, OpenAI, 임베딩 |
| **DISCOVER** | `/discover` | 키워드를 직접 분석하거나 Instagram 공동 해시태그로 후보 발굴 | NAVER, Instagram |
| **CULTURE MAP** | `/culture-map` | 분석한 트렌드 사이의 관계를 계산해 그래프로 표시. 연결선을 누르면 왜 연결됐는지·관계 점수·근거 확인 | 저장된 WHY·DNA·임베딩·근거 원장 |
| **COLLISION** | `/collision` | 기존 문화 관계 분석 또는 두 트렌드의 SAFE/BOLD/WILD 창작 아이디어 도출 | WHY·DNA·Visual DNA·Culture Map, OpenAI |
| **TREND LAB** | `/lab` | 브랜드 브리프에 트렌드를 적용할 수 있는지 항목별 검토 | 분석 결과, OpenAI |
| **CONTENT STUDIO** | `/studio` | 단일 트렌드 또는 Creative Collision을 카드뉴스·숏폼으로 제작. 현상 잠금, 편집 브리프, 스토리보드, 슬라이드별 이미지 관리 | WHY · DNA · Collision · Lab · Editorial Engine V3 |
| **FIGMA HANDOFF** | Studio + Figma Plugin | 기획안을 편집 가능한 Figma 프레임으로 생성. 자동 디자인과 MY TEMPLATES 지원 | Studio 프로젝트, 슬라이드별 이미지, Figma Plugin API |
| **WORKSPACE** | `/workspace` | 저장한 분석 · Collision · 기획안 모아보기 | 브라우저 / Supabase |

모든 AI 분석에는 근거 ID(예: `NAVER-01`, `IG-03`)가 붙습니다. 서버가 실제로 수집한 근거 목록(근거 원장)에 없는 ID는 지우고, 근거 없이 "검증됨"이라고 주장한 항목은 `Insufficient Evidence`로 낮춥니다.

### 현재 구현·검증 범위 (2026-11-04)

| 영역 | 구현 상태 | 검증 범위 |
|---|---|---|
| Discovery → 세부 현상 → 현상 WHY | 구현 | 저장된 실제 응답 fixture와 브라우저 흐름 테스트. 외부 API 실시간 재호출과 구분 |
| Trend Web 이중 노드 선택·관계 분석 | 구현 | 데스크톱·모바일 자동 테스트, 저장 payload 복원 테스트 |
| Culture Map·Creative Collision·Trend Lab | 구현 | 결정적 관계 규칙, 브라우저 흐름, 저장 복원 테스트 |
| Editorial Engine V3 | 구현 | 현상 중심 방향, 편집 유형 A~F, 독자 가치, 대표 장면, 새 정보·장면 스토리보드, 허위 체험·근거 없는 인기 표현 검사, 사용자 평가 |
| 슬라이드별 AI 이미지 | 구현 | 병렬 생성·재생성·삭제·복제·순서 변경·저장 복원·Figma 매핑 테스트 |
| Figma Direct Export | 구현 | JSON·서버·가짜 Figma API/plugin harness 검증. 실제 Figma 앱 수동 검증은 별도 필요 |
| Figma MY TEMPLATES | 구현 | 템플릿 동기화·썸네일·슬롯·렌더링 미리보기 harness 검증. 실제 앱의 PNG 렌더링은 수동 검증 필요 |
| Supabase 계정 동기화 | 구현 | RLS 마이그레이션과 모의/로컬 검증. 원격 프로젝트에서는 0001~0010 적용 여부에 따라 기능이 달라짐 |

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
| `OPENAI_DAILY_LIMIT` | 서버 프로세스 하루 비용 가중치 상한 (코드 기본 60, 현재 `.env.example` 권장값 100) |

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
2. 새로 뜨는 해시태그를 찾고 싶으면 **신규 해시태그 검색 승인**을 켜고 **RESCAN**을 누릅니다. 한 번에 다음이 진행되고, 화면에 단계가 표시됩니다(약 1~2분).
   1. **새로운 트렌드 탐색**: 웹 검색 1회로 지금 화제인 해시태그 후보를 찾습니다(실제로 조회한 출처가 있는 후보만).
   2. **해시태그 측정**: 지난 스캔에서 기다리던 후보와 **아직 측정하지 않은 신규 후보를 먼저**, 그다음 이미 측정한 태그를 다시 잽니다. 신규는 스캔당 4개·주간 한도(30개 중 6개 예비) 안에서만 조회하고, 넘치는 후보는 **호출하지 않고 다음 스캔 대기열**에 둡니다.
   3. **순위 계산** → 4. **최신 차트 생성 완료**: 두 차트를 이번 스캔 결과로 바꿉니다.
   - 완료 후 요약: 새로 발견한 후보 수 · 실제 측정 수 · 새로 추가된 해시태그 수 · 다음 스캔 대기 수 · 마지막 측정 시각
   - 승인은 RESCAN 한 번마다 다시 켭니다. 승인이 꺼져 있으면 **기존 추적 태그만 다시 재고**(신규 한도·웹 검색 없음) 새 후보 탐색은 하지 않습니다.
3. 결과는 두 칸으로 나뉘어 표시됩니다. **둘 다 가장 최근 스캔 결과만** 씁니다(과거 측정을 섞지 않음). 이번 스캔에서 확인된 태그가 0개면 이전 측정 결과를 보여 주고 **"이전 측정 결과"**라고 표시합니다. 과거 보고서는 지우지 않고 **이전 측정 보고서** 아래에 보관합니다.

| 칸 | 기준 | 무엇을 알 수 있나 |
|---|---|---|
| **▲ 오르는 순** | 전일 대비 변화율 높은 순, 그다음 **NEW** | **지금 뜨고 있는 것**. 같은 태그를 20시간 이상 지나 다시 잰 경우 변화율이 나옵니다. 이전 측정이 없는 신규 태그는 상승률 없이 **NEW**로만 표시합니다 |
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
- 보드는 **가장 최근 스캔에서 측정한 태그만** 보여줍니다. 그 스캔에서 재지 않은 태그는 차트에서 빠지고 **이전 측정 보고서**에서 볼 수 있습니다.
- 직접 추가한 새 태그는 한 번 스캔에 **최대 3개**까지 보냅니다. 신규 태그 전체는 스캔당 4개까지 측정하고, 나머지는 다음 스캔에서 측정합니다.
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

**전일 대비 상승률 보는 법**: 첫날은 **오르는 순** 칸의 태그가 모두 **NEW**입니다. 이전 측정과 20시간이 지나지 않은 태그는 칸 아래에 "다음 측정부터 비교"로 안내됩니다. 그 시각 이후(보통 다음 날) **RESCAN**하면 ▲/▼가 나옵니다. 이전 측정과 방식(24시간 전체 / 최근 표본)이 다른 태그는 비교하지 않습니다. 매일 한 번씩, 가능하면 **비슷한 시각에** 재면 가장 정확합니다.

### 4-2. Overview — 2030 HIGH SCORE (HISCORE.EXE)

1. **PRESS START**를 누릅니다.
2. 웹 검색으로 2030 트렌드 후보 약 10~13개를 찾고, NAVER 검색어 트렌드에 **19–39세 연령 필터**를 걸어 검증합니다. (약 30초)
3. 각 키워드의 **최근 약 3개월 상승률**(최근 1/3 평균 ÷ 초기 1/3 평균) 순으로 순위를 보여줍니다.

- **상승률 순 / 관심도 수준 순**으로 정렬을 바꿀 수 있습니다. 관심도 수준은 NAVER가 한 번에 5개만 비교해 주기 때문에 여러 묶음을 환산한 **추정치**입니다(`≈` 추정, `≈?` 정밀도 낮음).
- 결과는 12시간 캐시되며, 다시 받으려면 **RESCAN**을 누릅니다.
- **HOW THIS SCORE WORKS**를 펼치면 계산 방법과 출처 수가 나옵니다.

### 4-2b. Overview — WHAT'S HAPPENING NOW? · TREND WEB

**WHAT'S HAPPENING NOW?**는 키워드의 기원이나 사전적 정의가 아니라, 선택한 관측 기간 안에서 실제로 발견된 구체적인 장면과 행동을 찾습니다. 예를 들어 `메이크업`이라는 큰 키워드를 그대로 설명하는 대신 `아바타 메이크업을 현실에서 재현`, `특정 캐릭터 분장`, `GRWM 안의 제품 사용 행동`처럼 콘텐츠 소재가 될 수 있는 단위로 나눕니다.

결과는 다음 세 상태로 구분합니다.

| 상태 | 의미 |
|---|---|
| `OBSERVED` | 두 개 이상의 독립 출처에서 확인된 현상 또는 연결 |
| `EMERGING` | 한 출처에서 최근 관찰됐지만 확산 정도를 단정할 수 없는 신호 |
| `SUGGESTED` | 의미상 관련될 수 있으나 실제 동시 출현 근거가 없는 탐색 후보 |

**TREND WEB**은 저장된 Discovery 결과를 추가 유료 호출 없이 네트워크로 바꿉니다.

1. 노드를 누르면 관련 현상, 관측 플랫폼, 기간, 근거 ID와 근거 점수를 확인합니다. 점수는 **독립 출처 수 + 근거 건수 + 최신성**이며 인기 순위가 아닙니다.
2. `EXPAND CONNECTIONS`로 주변 노드를 펼칩니다. 전체 노드는 최대 36개로 제한합니다.
3. `SELECT TWO MODE`에서 노드 두 개를 선택하고 `ANALYZE CONNECTION`을 누릅니다. 저장된 같은 분석이 있으면 재사용하고, 새 API 호출이 필요하면 먼저 비용 안내를 보여 줍니다.
4. 관계는 `OBSERVED CONNECTION`, `EMERGING SIGNAL`, `CREATIVE HYPOTHESIS`로 분리됩니다.
5. 관찰된 관계는 곧바로 Content Studio의 현상 콘텐츠로, 창작 조합은 Creative Collision으로 보낼 수 있습니다.
6. `SAVE TREND WEB`으로 그래프·선택 노드·선택 관계를 Workspace에 저장합니다. 로그인 계정은 Supabase `saved_items`를 통해 다른 브라우저에서 복원할 수 있습니다.

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

### 4-4b. VISUAL EVIDENCE · VISUAL DNA

- **VISUAL EVIDENCE**(TREND WHY): 근거 원장에 있는 실제 YouTube 영상·Instagram 게시물·웹 출처를 썸네일 갤러리로 보여 줍니다. 이미지는 원본 플랫폼에서 직접 불러오며 저장·복제하지 않습니다. YouTube는 "미리보기"를 눌렀을 때만 공식 임베드(자동재생 없음)를 엽니다. 웹 출처 대표 이미지는 버튼을 눌러야 확인합니다(페이지 og:image 메타데이터만 읽음).
- **VISUAL DNA**(TREND DNA): 실제 YouTube 썸네일(최대 6장, 저해상도)을 OpenAI 비전으로 분석해 색·글자·질감·구도·사물·무드·모티프를 보여 줍니다. 이미지에서 보이는 것은 "관찰", 의미·무드는 "AI 해석"으로 나눕니다. 이미지가 없으면 만들지 않습니다. 실행 시 OpenAI 1회(비용 가중치 2), 같은 이미지 조합은 7일 캐시.
- 계정에 Visual DNA를 저장하려면 Supabase SQL Editor에서 `supabase/migrations/202610300006_trend_visual_dna.sql`을 실행하세요(미적용이어도 브라우저 저장은 됩니다).

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

**계정 동기화**: 로그인하면 모든 화면 상단 막대가 계정의 분석·Culture Map·Insights & Plans를 불러오고, 이 브라우저에만 있는 항목 수를 실제 DB와 비교해 보여 줍니다. "계정에 업로드"를 눌러 승인해야 올립니다(삭제·무조건 덮어쓰기 없음). 저장 결과는 '브라우저 저장됨'과 '클라우드 저장됨/실패/로그인 필요'로 따로 표시합니다. 로그아웃하면 그 계정 항목은 숨겨집니다(지워지지 않음). Workspace의 Insights & Plans는 LOCAL/CLOUD를 구분하고, 삭제 시 '이 브라우저에서만' 또는 '브라우저 + 클라우드'를 고를 수 있습니다.

**클라우드 동기화**: 로그인하면 Culture Map 상단 SUPABASE CLOUD 패널에서 "클라우드에 저장"(분석·메타데이터 버전·관계), "클라우드에서 불러오기"(다른 브라우저·기기), "DB 행 확인"(Supabase 실제 행 수와 중복 여부)을 쓸 수 있습니다. 로그인 상태로 지도를 열면 자동으로 한 번 불러옵니다. 같은 분석은 다시 저장해도 행이 늘지 않고, 이 브라우저의 더 최신 데이터는 덮어쓰지 않습니다. 실제 Supabase 검증 방법은 [docs/CULTURE_MAP_VALIDATION.md](docs/CULTURE_MAP_VALIDATION.md)의 Cloud 절을 보세요.

DEMO GRAPH는 미리 작성한 예시입니다. 노드에 주황 줄무늬가 있고, 관계 점수·근거가 없으며 Collision 선택 대상이 아닙니다.

### 4-7. COLLISION → LAB → CONTENT STUDIO

1. **Culture Collision**: DNA가 있는 트렌드 2~4개의 기존 관계와 문화적 긴장·기회를 분석합니다.
2. **Creative Collision**: 트렌드 두 개와 선택 관계를 바탕으로 SAFE/BOLD/WILD 아이디어를 만듭니다. 제품·캠페인·팝업·굿즈·공간·카드뉴스 등 구체적인 결과물 단위로 제안하며, 관찰된 사례와 AI 창작 콘셉트를 구분합니다.
3. **Trend Lab**: 선택한 Collision 또는 분석 결과와 브랜드 브리프를 결합해 적용 가능성을 검토합니다. 각 항목에는 `Data Evidence` / `AI Inference` / `Insufficient Evidence`가 표시됩니다.
4. **Content Studio**: `SINGLE TREND MODE`와 `CREATIVE COLLISION MODE`를 제공합니다. 모드를 바꿔도 작성 상태를 보존하고, Creative Collision에서 고른 아이디어를 제작의 중심 주제로 유지합니다.

**Editorial Engine V3 제작 과정**

1. **편집 방향**: 키워드 자체가 아니라 구체적인 현상·행동·장면을 먼저 고릅니다.
2. **편집 브리프**: 문화 해설·큐레이션·경험 가이드·비교·미시 현상·문화 충돌 중 편집 유형, 독자 가치, 대표 장면, 근거 상태를 정합니다.
3. **현상 잠금(Context Lock)**: 선택한 주제에서 역사·입문·구매 안내 같은 일반론으로 이탈하지 않도록 범위를 고정합니다. 근거가 없으면 사실이 아니라 제한된 해석으로 표시합니다.
4. **스토리보드**: 각 슬라이드가 새로 주는 정보와 보여 줄 장면(주체·행동·대상)을 카피보다 먼저 정합니다.
5. **품질 검사**: 반복, 주제 이탈, 존재하지 않는 근거, 허위 1인칭 체험, 근거 없는 인기·바이럴 표현을 검사합니다.
6. **사용자 평가**: AI 편집 리뷰와 별도로 사용자가 1~5점과 메모를 남기며 프로젝트에 함께 저장됩니다.
7. **이미지**: 모든 이미지 생성·교체·삭제는 고유 `slideId`에 귀속됩니다. 한 슬라이드의 이미지가 다른 슬라이드에 전파되지 않으며, 병렬 요청은 `requestId`가 일치할 때만 반영됩니다.

### 4-8. INSTAGRAM

해시태그 하나를 직접 검색해 최근 게시물과 인기 게시물(캡션 · 게시일 · 미디어 유형 · 원본 링크)을 봅니다. 결과는 서버에 5분간 캐시되고, 클라이언트별로 분당 10회까지 검색할 수 있습니다. 여기서 검색한 태그도 **주간 한도**를 씁니다.

### 4-9. WORKSPACE · SETTINGS · ACCOUNT

- **Workspace**: 저장한 분석, Collision, 기획안 목록입니다. 기획안을 다시 열 수 있습니다.
- **Settings**: API 연결 상태와 오늘의 사용량을 봅니다.
- **Account**: Supabase 로그인. 로그인하면 분석을 클라우드에 저장합니다.

### 4-10. FIGMA DIRECT EXPORT · MY TEMPLATES

Content Studio의 카드뉴스는 두 방식으로 Figma에 전달할 수 있습니다.

| 방식 | 설명 | 적합한 경우 |
|---|---|---|
| `AUTO DESIGN` | Studio의 디자인 엔진이 슬라이드별 레이아웃·색·타이포·이미지 레이어를 생성 | 별도 템플릿 없이 빠르게 초안을 만들 때 |
| `MY TEMPLATES` | Figma 파일의 `Templates` 페이지에 있는 사용자 템플릿을 복제하고 이름이 지정된 슬롯에 콘텐츠를 삽입 | 브랜드·팀 디자인 시스템을 그대로 사용할 때 |

**기본 전송 흐름**

1. Supabase 마이그레이션 `202611020009_figma_handoffs.sql`을 적용합니다.
2. Figma 데스크톱 앱에서 `figma-plugin/manifest.json`을 개발 플러그인으로 가져옵니다.
3. Studio에서 **Figma로 보내기**를 누르고 작업 코드를 확인합니다.
4. Figma 플러그인을 처음 한 번 TREND RADAR 계정과 연결합니다.
5. 최신 작업을 선택해 편집 가능한 프레임을 생성합니다. 기존 Figma 노드는 삭제하거나 덮어쓰지 않고 오른쪽에 추가합니다.

**MY TEMPLATES 추가 흐름**

1. `202611040010_figma_templates.sql`을 적용합니다.
2. Figma의 `Templates` 페이지에 `TEMPLATE_COVER_01~03`, `TEMPLATE_BODY_01~03`, `TEMPLATE_CTA_01~02` 프레임을 둡니다.
3. 텍스트 레이어는 `TITLE`, `SUBTITLE`, `BODY`, `CATEGORY`, `PAGE_NUMBER`, `CTA`, 이미지 슬롯은 `IMAGE_MAIN`, `IMAGE_1~4`, `BG_IMAGE` 등의 이름을 사용합니다.
4. 플러그인의 **SYNC MY TEMPLATES**를 누르면 템플릿 메타데이터와 PNG 썸네일이 본인 계정에 저장됩니다.
5. Studio의 `DESIGN SOURCE → MY TEMPLATES`에서 갤러리를 확인하고 슬라이드별 템플릿을 선택합니다.
6. `TEMPLATE PREVIEW`는 원본 템플릿 모습이고, `RENDERED CONTENT PREVIEW`는 Figma 플러그인이 실제 내용을 넣어 렌더링한 결과입니다. 웹이 Figma 디자인을 HTML로 흉내 내지 않습니다.

실제 근거 이미지는 저작권 보호를 위해 Figma에 복제하지 않고 원본 링크 자리표시만 만듭니다. AI 이미지는 “AI 생성 이미지 — 실제 사진 아님”으로 표시합니다. 전체 템플릿 규칙은 [figma-plugin/README.md](figma-plugin/README.md)를 참고하세요.

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
| Trend Web 그래프 보기·필터·저장 | 추가 외부 호출 없음 | 저장된 Discovery 결과 사용 |
| Trend Web 관계 분석 | 같은 관계 캐시가 없을 때 Connection 분석 1회 | 같은 두 키워드·기간은 재사용 |
| WHY / DNA / Collision / Lab | 기능별 OpenAI 분석 1회 수준(DNA는 임베딩 포함) | 같은 입력은 재사용 |
| Content Studio | 방향 제안 1회 + 제작 1회 + 편집 리뷰 1회. 자동 이미지 생성 없음 | 저장 결과·동일 입력 재사용 |
| Figma 전송·템플릿 동기화 | AI 호출 없음 | Supabase·Figma 플러그인 요청만 사용 |

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
- **로그인하지 않으면 전일 대비 비교 이력은 브라우저에만 저장됩니다.** `202610300007_instagram_pulse_cloud.sql`을 적용하고 로그인하면 Pulse 보고서·추적 태그·제외 태그·수동 검색 이력을 계정에 동기화할 수 있습니다. Meta의 실제 주간 사용량은 로컬 기록이 아니라 Meta API 응답을 기준으로 봅니다.

---

## 8. 저장 위치와 Supabase

| 데이터 | 기본 저장 위치 | Supabase 사용 시 |
|---|---|---|
| WHY · DNA 분석 | 브라우저 (localStorage) | 로그인하면 `trend_analyses` 테이블 |
| Workspace 인사이트·기획안·Creative Collision·Studio Project·Trend Web | 브라우저 | `saved_items` 테이블의 사용자별 JSON payload |
| Culture Map 메타데이터·버전·근거·관계 | 브라우저 | `culture_*` 테이블 |
| Visual DNA | 브라우저 | `trend_visual_dna` 테이블 |
| Instagram Pulse 보고서·추적/제외 태그·수동 검색 | 브라우저 | `instagram_pulse_*`, `instagram_manual_search_history` |
| AI 생성 이미지 | 브라우저 축소본 또는 프로젝트 참조 | 비공개 `creative-assets` Storage 버킷의 사용자 폴더 |
| Figma 전달 작업·플러그인 연결 | 브라우저 상태 | `figma_handoffs`, `figma_plugin_tokens`, `figma_pairings` |
| Figma 템플릿·렌더링 미리보기 | 없음 | `figma_templates`, `figma_rendered_previews` |
| 2030 스캔·일부 임시 캐시 | 브라우저 / 서버 메모리 | 별도 영속 테이블 없음 |

**Supabase를 쓰려면** Supabase 대시보드 → SQL Editor에서 마이그레이션을 **순서대로** 실행합니다.

1. `supabase/migrations/202610280001_live_analysis.sql`
2. `supabase/migrations/202610280002_harden_grants.sql`
3. `supabase/migrations/202610280003_live_dna_pipeline.sql`
4. `supabase/migrations/202610290004_youtube_evidence.sql`
5. `supabase/migrations/202610290005_culture_knowledge.sql`
6. `supabase/migrations/202610300006_trend_visual_dna.sql`
7. `supabase/migrations/202610300007_instagram_pulse_cloud.sql`
8. `supabase/migrations/202610300008_creative_assets_storage.sql`
9. `supabase/migrations/202611020009_figma_handoffs.sql`
10. `supabase/migrations/202611040010_figma_templates.sql`

마이그레이션은 파일 번호 순서대로 적용하세요. 아직 적용하지 않은 기능은 서버가 오류를 숨기고 “완료”로 표시하지 않으며, 가능한 데이터는 브라우저 저장으로 유지합니다. SQL을 여러 번 무작정 실행하기보다 Supabase의 적용 상태를 확인하고 다음 번호만 진행하세요.

모든 사용자 데이터 테이블에는 RLS가 적용되어 로그인한 사용자가 자기 행만 조회하도록 설계되어 있습니다. Figma 플러그인 토큰 원문과 API 비밀키는 DB나 브라우저 로그에 저장하지 않습니다.

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
  happening-now.tsx     최근 세부 문화 현상 탐색
  trend-web.tsx         검색 내부 키워드 네트워크와 이중 노드 선택
  live-why-panel.tsx    LIVE WHY 분석
  dna-view.tsx          DNA 화면
  culture-map.tsx       Culture Map (React Flow)
  creative-collision.tsx SAFE/BOLD/WILD 아이디어
  studio-production.tsx Editorial Engine V3 기반 제작 화면
  template-gallery.tsx Figma MY TEMPLATES 갤러리·미리보기
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
  discovery.ts          최근 현상·관계 스키마와 서버 검증
  trend-web.ts          저장 근거에서 Trend Web 그래프 생성
  creative-collision.ts Creative Collision 입력·결과·검증
  editorial*.ts         편집 방향·현상 잠금·품질 게이트
  content-production.ts Studio 프로젝트·슬라이드·이미지 상태
  figma-export.ts       슬라이드별 Figma 디자인 payload
  figma-templates.ts    MY TEMPLATES 동기화·상태·미리보기 정의
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

분석 API는 주로 `POST` JSON을 사용하고, 상태·목록·이미지는 `GET`, 사용자 저장 항목 해제는 일부 `DELETE`를 사용합니다. 잘못된 입력은 외부 API를 호출하기 전에 `400`으로 거절합니다.

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
| `/api/studio/angles` | 현상 중심 편집 방향·브리프 후보 생성 |
| `/api/studio/production` | 카드뉴스·숏폼 스토리보드와 제작 결과 생성 |
| `/api/creative-collision` | 두 트렌드의 SAFE/BOLD/WILD 아이디어 생성 |
| `/api/creative-collision/image` | 선택 아이디어의 AI 콘셉트 이미지 생성 |
| `/api/discover/phenomena` | 키워드의 최근 세부 문화 현상 탐색 |
| `/api/discover/connections` | 두 키워드의 관찰 연결·떠오르는 신호·창작 가설 분석 |
| `/api/discover/validate` | 후보 키워드 NAVER 일괄 검증 |
| `/api/meta/hashtag` | 해시태그 단건 검색 (Instagram 화면) |
| `/api/meta/status` | Meta 연결 상태 (GET) |
| `/api/integrations/status` | 전체 연동 상태 · 사용량 (GET) |
| `/api/figma/handoffs` | Studio → Figma 작업 생성·목록·가져오기 기록 |
| `/api/figma/pair/*` | Figma 플러그인과 로그인 계정의 1회 연결 |
| `/api/figma/templates` | MY TEMPLATES 동기화·목록·상태·삭제 |
| `/api/figma/templates/image` | 본인 템플릿 썸네일·렌더링 미리보기 PNG |

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

테스트 결과를 읽을 때는 다음을 구분합니다.

| 표현 | 실제 의미 |
|---|---|
| 결정적 단위 테스트 통과 | 점수·상태·근거 필터·저장 병합 같은 순수 규칙을 확인 |
| 브라우저 E2E 통과 | 실제 화면에서 선택·저장·복원·API mock 연결을 확인 |
| recorded real fixture | 과거 실제 API 응답을 저장해 재생. 현재 외부 API가 다시 성공했다는 뜻은 아님 |
| fake Supabase / fake Figma API | payload·권한 계획·노드 구조 확인. 실제 원격 DB나 Figma 앱 검증이 아님 |
| 실제 앱 수동 검증 | 사용자 계정·원격 Supabase·Figma 데스크톱 앱에서 별도 확인한 경우만 이렇게 기록 |

---

## 12. 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 스캔이 `Cannot read properties of undefined`로 실패 | 개발 서버가 예전 코드를 들고 있음 → 서버 재시작 |
| NAVER 401 오류 | NAVER Developers 키를 넣음 → **API HUB** 키로 교체 |
| "Meta 액세스 토큰이 만료" | 토큰 재발급 → `.env.local` 수정 → 서버 재시작 |
| 해시태그가 "보류(다음 스캔)" · "다음 스캔 대기" | 스캔당 새 태그 4개 제한 또는 주간 한도 도달 → 대기열에 보관되어 다음 승인 RESCAN에서 먼저 측정(7일 지나면 대기열에서 빠짐) |
| 해시태그 "측정 실패: Meta API 응답 시간이 초과" | 게시물이 많은 태그의 일시적 지연 → 잠시 후 RESCAN |
| "Instagram에 해시태그가 없음" | 그 태그로 올라온 게시물이 없음 → 더 흔히 쓰는 표기로 추가 |
| "오르는 순"에 NEW만 있음 | 처음 측정한 태그라 비교할 이전 값이 없음 → 20시간 이상 지나 다시 RESCAN |
| "이전 측정 결과를 표시합니다" | 이번 스캔에서 확인된 태그가 0개(후보 없음·측정 실패) → 이전 결과를 보여 주는 중. 다시 RESCAN |
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
| [docs/TREND_DISCOVERY_ENGINE.md](docs/TREND_DISCOVERY_ENGINE.md) | 세부 현상 발견·관계 분석·Context Lock 흐름과 실측 결과 |
| [docs/TREND_WEB_VALIDATION.md](docs/TREND_WEB_VALIDATION.md) | Trend Web 추출·그래프·이중 노드 선택·저장 검증 |
| [docs/CREATIVE_WORKFLOW_ARCHITECTURE.md](docs/CREATIVE_WORKFLOW_ARCHITECTURE.md) | Creative Collision → Studio → 이미지 → Workspace → Figma 구조 |
| [docs/EDITORIAL_ENGINE_V3_PLAN.md](docs/EDITORIAL_ENGINE_V3_PLAN.md) | Editorial Engine V3의 편집 유형·브리프·스토리보드·평가 설계와 구현 상태 |
| [docs/EDITORIAL_V3_RESULTS.md](docs/EDITORIAL_V3_RESULTS.md) | V3 실측 비교 조건·결과·한계 |
| [docs/FIGMA_DIRECT_EXPORT.md](docs/FIGMA_DIRECT_EXPORT.md) | Figma 직접 전송의 인증·보안·노드 생성·검증 범위 |
| [figma-plugin/README.md](figma-plugin/README.md) | 플러그인 설치, AUTO DESIGN, MY TEMPLATES 슬롯·동기화·미리보기 사용법 |

---

### 보안 메모

- `.env.local`은 `.gitignore`로 제외돼 있습니다. **API 키를 코드나 이슈에 붙여넣지 마세요.**
- 토큰과 키는 서버 로그에 출력하지 않습니다.
- 공식 API 제한을 우회하는 스크래핑은 하지 않습니다.
