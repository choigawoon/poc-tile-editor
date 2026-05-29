# 역기획서 — POC Tile Editor

> 완성된 코드를 기준으로 재구성한 기획서. **두괄식 + 점진적 공개**: 아래 요약·목차만 봐도 전체가 잡히고, 궁금한 섹션을 펼치면 세부가 나온다.
> 기준: `main` · 곁문서: [README](README.md) · [ARCHITECTURE](ARCHITECTURE.md) · [ROADMAP](ROADMAP.md)

---

## ⭐ 결론 (TL;DR)

**탑다운 타일맵을 그리고 → 번들로 뽑고 → 게임이 그대로 돌리는 모노레포.** 셋은 공유 SDK(`@poc/core`)로 묶이고, 그 위에 **메타·계층태그 · 멀티맵 · 패턴 · PCG 던전 · AI 타일셋 · 도킹 UI**가 얹혀 있다.

- **핵심 불변식 3가지**: ① 툴·번들·게임은 *번들*로만 소통 · ② 셀은 픽셀이 아니라 *인덱스(gid)* · ③ 게임플레이 의미는 코드가 아니라 *선언적 데이터(메타·태그)*.
- **데이터 모델**: 하나의 *워크스페이스*가 타일셋·태그를 공유하고 그 위에 여러 *맵*·*패턴*을 둔다. `state.project`는 Proxy라 기존 코드·exporter 무수정.
- **차별점**: 인덱스 기반이라 *리스킨 공짜*, Unreal식 *계층 태그*로 게임이 질의, 패턴+문 규격으로 *PCG 던전 자동 조립*, genai MCP로 *에디터 안에서 타일셋 생성*.
- **상태**: 전 기능 `main`에 머지·푸시, 빌드 green. 검증은 결정적 Node 테스트 + turbo 빌드.

---

## 🧭 목차 (한 줄 요약)

| # | 섹션 | 한 줄 |
|---|---|---|
| 1 | 목적·문제의식 | 저작 의도와 런타임 해석을 *번들*로 분리한다 |
| 2 | 설계 원칙 | 3역할 분리 · 인덱스 셀 · 선언적 데이터 · 공유 SDK/워크스페이스 |
| 3 | 아키텍처 | Turborepo 3패키지 + 워크스페이스 데이터 모델 + `state.project` Proxy |
| 4 | 기능 명세 | 에디터·메타/태그·SDK·패턴/PCG·AI·도킹UI 6영역 |
| 5 | 번들 포맷 | `map.json`(gid 격자 + 희소 메타) + 타일셋 PNG |
| 6 | 사용자 플로우 | 그리기→의미부여→패턴→자동던전→AI→Play |
| 7 | 설계 결정 로그 | 왜 Proxy·왜 계층태그·왜 dev브리지… |
| 8 | 검증 방식 | Node 결정적 테스트 + turbo 빌드 |
| 9 | 현황·다음 | 완료 항목과 선택 폴리시 |

---

<details>
<summary><b>1. 목적·문제의식</b> — 저작 의도와 런타임 해석은 책임이 다르므로 *번들*로 분리한다</summary>

- 맵 저작(사람의 의도)과 게임 소비(런타임 해석)는 변하는 이유가 다르다 → **번들**이라는 단일 계약으로 끊는다. 툴을 바꿔도 유효한 번들만 내면 게임은 무관.
- 타일은 픽셀이 아니라 **인덱스(gid)** 다 → 같은 격자 PNG 교체로 리스킨이 공짜.
- 충돌·위험·문 같은 의미는 코드에 박지 말고 **선언적 데이터**(메타/태그)로 두고, 해석은 소비자(게임/엔진)가 한다.

**목표** ① 여러 맵을 탭으로 다루고 저장 ② 타일에 메타+태그+속성 부여하고 게임이 질의 ③ 패턴으로 PCG 던전 자동 조립 ④ AI로 타일셋 생성해 즉시 사용 ⑤ 도킹+메뉴바로 UI 자유 구성.
</details>

<details>
<summary><b>2. 설계 원칙</b> — 3역할 분리 · 인덱스 셀 · 선언적 데이터 · 공유 SDK/워크스페이스</summary>

| 원칙 | 의미 | 위치 |
|---|---|---|
| 3역할 분리 | 툴 → 번들 → 게임, 번들로만 소통 | `apps/editor` · `bundles` · `apps/game` |
| 인덱스 기반 셀 | 셀 = `gid = firstId+localIndex` | `@poc/core/gid.js` |
| 선언적 데이터 | 의미는 데이터로, 해석은 소비자가 | 메타/태그 + 게임 |
| 공유 SDK | 툴·게임이 같은 정의 import → 드리프트 불가 | `packages/core` |
| 공유 워크스페이스 | 타일셋·태그 공유, 위에 여러 맵·패턴 | `editor/js/state.js` |
</details>

<details>
<summary><b>3. 아키텍처</b> — Turborepo 3패키지 + 워크스페이스 모델 + `state.project` Proxy</summary>

**모노레포 (Turborepo + npm workspaces)**
```
packages/core   @poc/core   공유 SDK (gid·meta·tags·query·exporters), DOM/상태 없음
apps/editor     @poc/editor 저작 툴 (Vite)
apps/game       @poc/game   런타임 (Vite + PixiJS), 번들만 소비
bundles/        계약물 (map.json + tileset PNG)
tools/          번들 생성·동기화·타일셋 생성 스크립트
```
`turbo run build/dev`로 의존성 그래프+캐시 오케스트레이션. 게임 빌드는 `bundle:demo → vite build → sync` 자체 포함.

**데이터 모델 — 워크스페이스**
```jsonc
workspace = {
  format, version, name,
  tileWidth, tileHeight, nextGid,         // 공유 격자 + gid 할당기
  tilesets:  [ { id, name, image, tileW/H, columns, rows, tileCount, firstgid,
                 tiles?: { "<localIndex>": { solid?, tags?:[], ...props } } } ],
  tagRegistry: [ "terrain.water", ... ],  // 소문자 정규화, 자동완성/트리용
  maps:     [ { id, name, mapWidth, mapHeight, layers[], objects?, game? } ],
  patterns: [ { id, name, mapWidth, mapHeight, layers[], doors:{n,e,s,w} } ],
}
```
- **`state.project`는 Proxy** — 공유 필드는 `workspace`, 맵 필드(name/size/layers/objects)는 `activeDoc()`(활성 *맵 또는 패턴*)으로 라우팅 → 기존 호출부·exporter·▶Play 무수정, 에디터가 패턴도 맵처럼 편집.
- 구버전 단일 project 저장본은 로드 시 `maps:[그 맵]`으로 자동 마이그레이션.
</details>

<details>
<summary><b>4. 기능 명세</b> — 에디터 · 메타/태그 · SDK · 패턴/PCG · AI · 도킹UI</summary>

<details>
<summary>4.1 에디터(저작)</summary>

| 기능 | 설명 |
|---|---|
| 그리기 | 브러시·지우개·채우기·사각형·스포이드, 다중 레이어, undo/redo, autosave |
| 팔레트 | 줌(−/＋), 메타 보유 타일에 카테고리 구슬(🔴solid·🔵tags·🟢props) |
| 멀티 맵 탭 | 전환·새 맵·이름변경·닫기, 맵 간 격리, 타일셋 공유 |
| 저장/로드 | 워크스페이스 전체를 단일 `.json`(타일셋 base64 내장) |
| Export | Generic·Tiled(.tmj)·Godot4·Unity (+엔진 임포터) |
| 이미지→타일 | 한 장을 격자로 슬라이스해 타일셋화, 픽셀해시 **dedupe** 옵션 |
</details>

<details>
<summary>4.2 타일 메타데이터 + 계층 태그</summary>

- **타입 메타**(타일셋 `tiles[localIndex]`): `solid`, 자유 props(`friction`·`damage`…). 인덱스 기반이라 리스킨 보존.
- **인스턴스 객체**(맵 `objects[]`): 좌표 고유 데이터(spawn·문 목적지), 희소.
- **계층 태그**(Unreal GameplayTag): `terrain.water.deep`이 `terrain`/`terrain.water` 질의 자동 만족. 문자열 배열·소문자. **분류=태그 / 값=props** 2축.
- **작성 UX**: "Selected tile" 패널 — Solid + 태그 **트리**(체크=명시, `•`=자식 자동매치, 노드별 추가/이름변경(서브트리·전 타일 캐스케이드)/삭제) + 프로젝트 **태그 레지스트리** 자동완성.
</details>

<details>
<summary>4.3 공유 SDK (@poc/core) — 게임이 읽는 경로</summary>

| 모듈 | 함수 |
|---|---|
| `gid` | `resolveGid` `firstId` `tileSrcRect` `atlasCoord` `slug` `imageName` |
| `meta` | `tileMeta` `gidMeta` `tileTags` `gidHasTag` `objectsAt` |
| `tags` | `normalizeTag` `tagMatches` `expandTag` `hasTag` `hasTagExact` `hasAny` `hasAll` |
| `query` | `cellGid` `cellTags` `cellHasTag/Any/All` `tileProps` `gidProps` `findCells` |
| `exporters` | `exportGeneric/Tiled/Godot/Unity` `exportProject` `EXPORTERS` |

게임 충돌 = **Collision 레이어 · `solid` 플래그 · `movement.blocked` 태그** 합집합을 마운트 시 미리 계산. `tagsAt`/`hasTagAt`로 셀 태그 질의.
</details>

<details>
<summary>4.4 패턴 + PCG 던전</summary>

- **패턴** = 맵형 작은 문서 + `doors:{n,e,s,w}`(엣지 중앙 표준 문). 탭바 Maps | Patterns 분리, 에디터 그대로 편집.
- **스탬프 툴(▦)**: 패턴 레이어를 맵에 오프셋 blit(레이어명 매칭·빈셀 스킵·경계 클립·호버 고스트·1 undo).
- **PCG 패널** "Dungeon (PCG)" — 인라인 폼(Cols/Rows/Room W·H/Seed):
  - **From my patterns**: 재귀 백트래커 미로 → 각 방 필요 문 결정 → 문 매칭 패턴 선택 → 조립.
  - **Auto-build**: 패턴 없이 방 절차 생성(바닥+벽, 문 자리 틈)→연결 보장. 바닥/벽은 태그·solid로 자동 선택(없으면 fallback, 벽 solid 지정). 방 종류는 패턴 라이브러리에도 등록.
  - 시드 주면 결정적.
</details>

<details>
<summary>4.5 AI 타일셋 (genai MCP)</summary>

- **브리지**(`genai-bridge.mjs`, Vite dev 미들웨어): 브라우저는 genai 서버(MCP-only·CORS 없음)에 직접 못 닿으므로 Node가 `POST /api/genai/generate`를 받아 MCP Streamable-HTTP(initialize→initialized→tools/call)로 생성, 이미지 data URL 반환. `npm run dev` 전용.
- **패널** "✨ AI tileset": 프리셋 + **Cols×Rows×Tile↔해상도 연동**(이미지=cols·tile×rows·tile) → 같은 tile 슬라이스로 격자 정확. 미리보기 격자 오버레이, 클릭/한 버튼으로 팔레트 즉시 투입.
</details>

<details>
<summary>4.6 UI 셸 — 도킹 + 메뉴바</summary>

- **도킹**: 헤더 드래그로 좌/우 컬럼 도킹(드롭존 하이라이트+삽입선) 또는 플로팅(드래그·리사이즈). ✕닫기·▾접기·⤢플로팅, 컬럼 밖 드롭=원위치 복귀. 배치/숨김 영속.
- **메뉴바**: File·Edit·View(패널 토글+Reset layout)·Tools. ▶Play는 우측 버튼.
- **입력**: 트랙패드(스크롤=이동, 핀치/⌘·Ctrl+스크롤=줌), 스페이스/중클릭 드래그, 사이드 패널 폭 리사이즈.
</details>
</details>

<details>
<summary><b>5. 번들(계약) 포맷</b> — gid 격자 + 희소 메타 JSON + 타일셋 PNG</summary>

- `map.json`(Generic exporter): `tileW/H`·`width/height`·`tilesets[]`(+희소 `tiles`)·`layers[]`(2D gid)·희소 `objects[]`. 비면 키 생략.
- 타일셋 PNG: 같은 격자면 교체로 리스킨. 게임 소스 우선순위 `postMessage(▶Play) › ?bundle= › 동봉 데모`.
</details>

<details>
<summary><b>6. 사용자 플로우</b> — 그리기→의미부여→패턴→자동던전→AI→Play</summary>

1. **그리기**: 타일셋 추가/AI 생성 → 팔레트 선택 → 캔버스 → 탭으로 여러 맵.
2. **의미 부여**: 타일 선택 → Solid/태그/props → 게임이 충돌·위험으로 해석.
3. **패턴→배치**: Patterns 탭에서 방+문 제작 → 스탬프로 찍기.
4. **자동 던전**: Dungeon(PCG) 패널 → 입력 → ✨ Auto-build → 연결 던전 + 패턴 라이브러리.
5. **AI 타일셋**: ✨ AI tileset → 프리셋/프롬프트 → 생성 → 클릭 투입.
6. **확인**: ▶ Play 로 현재 맵 즉시 플레이.
</details>

<details>
<summary><b>7. 설계 결정 로그</b> — 왜 그렇게 만들었나</summary>

| 결정 | 근거 |
|---|---|
| `state.project`를 Proxy로 | 단일→워크스페이스 전환 시 ~72개 호출부·exporter 무수정 + 패턴도 맵처럼 편집 |
| 메타를 타입(인덱스) vs 인스턴스(좌표) 분리 | 타입은 리스킨 보존·1벌 작성, 인스턴스는 고유값만 희소 |
| 태그를 계층(Unreal식)으로 | 부모 자동매치로 광범위 질의(`hazard.*`), Unreal importer 1:1 |
| 태그/키 소문자 저장 | 매칭은 대소문자 무시 → 데이터 무모호화 |
| Auto-build에서 방 절차 생성 | 패턴 라이브러리 없이 연결 보장(엣지 문 틈 대칭) |
| genai를 dev 미들웨어 브리지로 | 서버가 MCP-only·CORS 없음 → Node가 대신 호출, 서버 변경 불필요 |
| 도킹 컬럼 밖 드롭=원위치 복귀 | 실수 분실 방지(플로팅은 ⤢ 명시) |
</details>

<details>
<summary><b>8. 검증 방식</b> — 결정적 Node 테스트 + turbo 빌드</summary>

- 핵심 로직(Proxy 라우팅·메타/태그/query·exporter 라운드트립·맵 격리·스탬프 blit·트리 캐스케이드·PCG 시드 결정성·genai 브리지 end-to-end)을 순수 함수로 결정적 검증.
- editor·game 프로덕션 빌드 green. 브라우저 시각 확인은 사용자 몫. 진행 이력은 `ROADMAP.md`에 체크박스로 영속.
</details>

<details>
<summary><b>9. 현황 · 다음</b></summary>

- **완료**: 워크스페이스·멀티맵 탭·메타/태그·SDK·패턴/스탬프·PCG(수동+자동)·AI 타일셋·도킹·메뉴바·트랙패드 — 전부 `main`, 빌드 green.
- **선택 폴리시**: 브라우저 일괄 눈확인 · genai 격자 정합 · 다중 슬롯 문 · 메뉴 단축키 · 패턴 회전/대칭.
</details>
