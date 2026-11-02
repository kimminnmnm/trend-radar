# TREND RADAR Studio Import (Figma 플러그인)

Content Studio의 작업을 Figma 프레임으로 만든다. 빌드 과정이 없다(순수 JS). 전체 구조와 검증 범위는 `docs/FIGMA_DIRECT_EXPORT.md`.

## 설치(개발용, 로컬)

1. Figma 데스크톱 앱 → Plugins → Development → **Import plugin from manifest…** → 이 폴더의 `manifest.json`
2. TREND RADAR를 `npm run dev`(http://localhost:3000)로 실행 — 개발 도메인은 `devAllowedDomains`에 있다.
3. 배포 서버를 쓰려면 `manifest.json`의 `allowedDomains`에 그 도메인을 추가하고, 플러그인 **설정 → 서버 주소**를 바꾼다.

## 사용

**TREND RADAR에서 가져오기(기본)**
1. Content Studio에서 **Figma로 보내기** → 작업 코드 확인
2. Figma에서 플러그인 실행 → 처음 1회 **TREND RADAR 연결**(브라우저에서 허용)
3. 가장 최근 작업이 자동 선택된다(코드 확인) → **카드뉴스 만들기**

**JSON 파일**: Studio의 “Figma JSON 내보내기” 파일을 선택하거나 붙여넣는다(계정 불필요).

한 번 만든 파일에는 “TREND RADAR 작업 가져오기” 재실행 버튼이 생긴다.

## 만들어지는 것

| 데이터 | Figma |
|---|---|
| 슬라이드·장면 | 프레임(캔버스 크기 그대로), 이름 `TR <코드> · 01 · cover`. 현재 페이지 기존 내용의 오른쪽에 추가(기존 노드는 그대로) |
| 텍스트 | 텍스트 레이어. 글꼴: 토큰 → fallback → Noto Sans KR → Inter, 대체 내역 표시 |
| AI 생성 이미지 | IMAGE fill, 레이어 이름 "AI 생성 이미지 — 실제 사진 아님" |
| REAL REFERENCE | **복제하지 않음** — 원본 링크가 적힌 점선 자리표시 |
| 근거 ID·디자인 메모 | 프레임 plugin data(`trend-radar`), 작업 ID는 `trend-radar-handoff` |
| 캡션·해시태그·이미지 권리 | 왼쪽 NOTES 프레임 |

같은 작업을 같은 페이지에 다시 만들려 하면 막고, 확인 버튼을 눌러야 한 번 더 만든다.

## 검증 범위

`tests/figma-plugin.spec.ts`, `tests/figma-direct.spec.ts`가 실제 `ui.html`·`code.js`를 가짜 `figma` API로 실행해 검사한다. **실제 Figma 앱에서의 실행·편집·PNG 내보내기는 사용자가 확인해야 한다.**
