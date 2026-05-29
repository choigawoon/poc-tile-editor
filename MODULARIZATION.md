# 모듈화 분석 — 확장을 쉽게 하려면

> 현재 코드(2026-05-30 기준)에서 **이미 잘 분리된 부분**과 **확장 시 병목이 될 부분**을 정리한다.
> 핵심 철학은 이미 코드에 있다 — `@poc/core`의 **exporters 레지스트리 패턴**을 툴·패널·프로바이더에도 복제하면 된다.

## TL;DR — 레버리지 큰 3가지
1. **툴을 레지스트리로** — 새 툴 추가 시 `main.js` 3곳을 동시 수정해야 함 (가장 자주 건드릴 확장점).
2. **`main.js` 분해** — 349줄에 배선 + 입력 + 파일 I/O가 뭉쳐 있음 (god-file).
3. **패널을 플러그인 레지스트리로** — 새 패널 = 4개 파일 동시 수정.

| # | 대상 | 현재 문제 | 모듈화 후 | 노력 |
|---|---|---|---|---|
| 1 | 툴 | 추가 시 `main.js` 3곳 | 파일 1개 등록 | 중 |
| 2 | `main.js` | god-file 349줄 | bootstrap만 | 중 |
| 3 | 패널 | 추가 시 4곳 | 매니페스트 1곳 | 중 |
| 4 | `tilemeta.js` | 503줄 혼재 | 태그트리 재사용 | 소 |
| 5 | `state.js` | 5개 관심사 | bus/model 분리 | 소 |
| 6 | genai | 단일 백엔드 | 프로바이더 교체 | 중 |
| 7 | storage | 키 분산 | 일원화 | 소 |

---

## ✅ 이미 잘 모듈화된 부분 (건드리지 말 것)

| 영역 | 위치 | 왜 좋은가 |
|---|---|---|
| **이벤트 버스** | `state.js:12` `on/emit` | 모듈 간 직접 호출 대신 이벤트로 느슨하게 결합. 확장의 토대. |
| **`@poc/core` SDK** | `packages/core/src/` | 의존성 0, DOM 무관, 순수 함수. 에디터·게임이 같은 정의 공유. **모범 사례.** |
| **Exporters** | `core/src/exporters/index.js` | 이미 완벽한 플러그인 패턴 — generic/tiled/godot/unity를 맵으로 등록. **다른 확장점이 따라야 할 모델.** |
| **Proxy 어댑터** | `state.project`, `state.js:166` | 72개 호출부를 안 고치고 워크스페이스 전환. 영리한 절충 (단, 부채이긴 함). |

---

## 🔧 확장 병목 & 모듈화 제안

### 1. 툴 레지스트리 — 최우선
새 툴 하나 추가하려면 `main.js` 세 군데를 동시에 고쳐야 한다:
- `mousedown` 분기 (`main.js:177-184`)
- 키보드 맵 (`main.js:270`)
- 툴바 핸들러 (`main.js:135`)

게다가 `stamp`/`rect`의 mousemove 프리뷰 로직까지 `main.js`에 흩어져 있다 (`main.js:198-208`).

**제안** — `tools/registry.js`에 툴을 객체로 등록:
```js
register({
  id: 'brush', key: 'b', cursor: 'crosshair',
  onDown(col, row) { /* ... */ },
  onMove(col, row, dragging) { /* ... */ },
  onUp() { /* ... */ },
  preview(col, row) { /* optional ghost */ },
});
```
exporters와 똑같은 패턴. `main.js` 입력 핸들러는 `activeTool`의 콜백만 호출 → **툴 추가가 파일 1개로 끝난다.**

### 2. `main.js` 분해 (349줄 → 3~4 파일)
한 파일에 ① 모듈 배선 ② 캔버스 입력(마우스/휠/키보드) ③ 파일 I/O 액션(add tileset/import/export/load)이 섞여 있다.
- `input.js` — 마우스/휠/키보드 → 툴 디스패치 (`main.js:154-275`)
- `commands.js` — new/save/load/import/export 버튼 핸들러 (`main.js:277-341`)
- `main.js` — 순수 부트스트랩(init 호출 + 렌더 스케줄)만 남김

### 3. 패널 플러그인 레지스트리
새 패널 추가 시 **4곳** 수정: `index.html`(섹션) + `main.js`(init 호출) + `dock.js`(`home` 컬럼맵) + `menubar.js`(View 목록).

**제안** — 패널 매니페스트 배열 하나로:
```js
export const PANELS = [
  { id: 'palette', title: 'Palette', home: 'left', init: initPalette },
  { id: 'tile',    title: 'Selected tile', home: 'right', init: initTileMeta },
  // ...
];
```
`dock.js`/`menubar.js`/`main.js`가 이 배열을 읽음 → **패널 추가가 1곳 등록으로 끝난다.**

### 4. `tilemeta.js` 분리 (503줄, 최대 단일 파일)
태그 트리 위젯 + 프로퍼티 k/v 에디터 + solid 체크박스가 한 파일에 있다. **태그 트리는 재사용 가능한 위젯**이므로 `widgets/tag-tree.js`로 빼면 PCG·쿼리 UI 등에서 재활용 가능.

### 5. `state.js` 관심사 분리 (202줄)
현재 한 파일에 ① 이벤트 버스 ② 문서 모델 팩토리(workspace/map/pattern/layer) ③ 직렬화·마이그레이션(`toWorkspace`) ④ 런타임 UI 상태 ⑤ Proxy 어댑터가 모두 있다.
- `bus.js` — `on`/`emit` (의존성 0, 다른 데서도 import하기 깔끔)
- `model.js` — 팩토리 + 마이그레이션 (순수 함수, 테스트 쉬움)
- `state.js` — 런타임 state + proxy만

### 6. genai 프로바이더 추상화
`genai-bridge.mjs`가 MCP 프로토콜 + 단일 엔드포인트에 하드코딩돼 있다. `providers/` 인터페이스(`generate(prompt, opts) → {dataUrl}`)로 빼면 다른 이미지 백엔드(로컬 SD, OpenAI 등) 추가가 용이.

### 7. 스토리지 계층 (낮음)
localStorage 키가 `dock.js`, `persist.js`, `panel-resize.js`에 각각 흩어져 있다. `storage.js` 하나로 모으면 마이그레이션/버전관리 일원화.

---

## 부채로 남겨둘 것 (지금은 OK)
- **`state.project` Proxy** — 72개 호출부를 워크스페이스/문서 직접 접근으로 마이그레이션하면 더 깔끔하지만, 지금은 어댑터가 잘 작동하므로 우선순위 낮음.
- **TypeScript 미도입** — 순수 JS + 결정적 Node 테스트로 충분히 커버 중. 규모가 더 커지면 재검토.
