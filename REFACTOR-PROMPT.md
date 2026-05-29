# 리팩터 프롬프트 — `state.project` Proxy 제거 + TypeScript 점진 도입

> 두 부채를 "제대로" 처리하기 위한 **실행 프롬프트**. 그대로 에이전트/사람에게 건네 실행하거나, 검증·연장(다음 파일 타입화)할 때 참조한다.
> 1차 실행은 2026-05-30에 완료(빌드·typecheck·스모크 11/11 그린). 이 문서는 *재현·검증·연장* 가능하도록 절차를 박제한 것.

원칙(공통):
- **워크트리에서 작업**하고, 끝나면 `main`에 **ff 머지 + 푸시**.
- 단계마다 검증: `npx turbo run build`, `npx turbo run typecheck`, 스모크 테스트.
- 동작(런타임 의미)은 **바꾸지 않는다**. 순수 리팩터 + 타입만 추가.

---

## §1. `state.project` Proxy 제거

### 배경
`apps/editor/js/state.js`에 있던 `state.project`는 **JS Proxy**로, 읽기/쓰기를 필드명에 따라
공유(workspace) 또는 활성 문서(`activeDoc()`)로 라우팅하는 "매직 어댑터"였다. 단일→워크스페이스
전환 시 호출부 무수정용으로 유용했지만, 데이터 흐름이 암묵적이고 타입을 입히기 어렵다.

### 목표 상태
- 공유 필드는 `state.workspace.<field>`로 **직접** 읽고 쓴다.
- 문서 필드는 `activeDoc().<field>`로 **직접** 읽고 쓴다.
- export / ▶Play / 렌더처럼 *평면화된 합본*이 필요한 **read-only 경계**만 새 `projectSnapshot()` 사용.
- 소스에서 `state.project` **완전 제거**(남으면 런타임에서 즉시 터지므로 누락이 드러남).

### 필드 분류 (이 프로젝트 기준)
| 분류 | 대상 | 라우팅 |
|---|---|---|
| **SHARED** | `tilesets` · `tileWidth` · `tileHeight` · `tagRegistry` · `nextGid` · `format` · `version` | `state.workspace` |
| **DOC** | `mapWidth` · `mapHeight` · `layers` · `objects` · `name` · `game` | `activeDoc()` |

### 실행 프롬프트
```
1. 콜사이트 전수 조사:
   grep -rn "state\.project" apps/editor/js packages/
   필드별로 SHARED / DOC 분류. 로컬 별칭(`const p = state.project`)과
   wholesale 전달(`runExport(..., state.project)`)도 빠짐없이 식별.

2. state.js 변경:
   - Proxy 정의(`new Proxy` + `Object.defineProperty(state,'project',...)`)와 SHARED Set 제거.
   - read-only 병합 뷰 export 추가:
       export function projectSnapshot() {
         const w = state.workspace; const d = activeDoc() || {};
         return { format:w.format, version:w.version, tilesets:w.tilesets,
           tagRegistry:w.tagRegistry, tileWidth:w.tileWidth, tileHeight:w.tileHeight,
           nextGid:w.nextGid, name:d.name, mapWidth:d.mapWidth, mapHeight:d.mapHeight,
           layers:d.layers, objects:d.objects, game:d.game };
       }

3. 콜사이트 치환:
   - SHARED 읽기/쓰기 → state.workspace.X
   - DOC 읽기/쓰기  → activeDoc().X  (함수당 `const doc = activeDoc()` 한 번 잡아 재사용)
   - read-only 별칭(`const p = state.project`)이 *쓰지 않으면* → projectSnapshot()
   - DOC를 *쓰는* 별칭(예: import-image의 ensureMapAtLeast)은 반드시 activeDoc() (snapshot은 복사라 쓰기 전파 안 됨)
   - exporter/▶Play 전달 인자 → projectSnapshot()

4. 검증:
   - grep -rn "state\.project" apps/editor/js packages/   # 0건이어야 함
   - npx turbo run build
   - 스모크: state.js를 Node로 import해 projectSnapshot()가 SHARED+DOC 병합/추적,
     맵·패턴 전환 시 DOC 필드가 활성 문서를 따라가는지 assert (아래 스모크 참고).
```

### 주의 (이번에 실제로 걸린 함정)
- **snapshot은 읽기 전용**. `p.mapWidth = ...`처럼 쓰는 별칭에 snapshot을 쓰면 무음 버그. → `activeDoc()`로.
- snapshot은 배열/객체 **참조를 그대로** 담는다(복사 X). 그래서 `layer.data` 내용 변경 같은
  "참조 대상 변형"은 정상 동작. 하지만 `mapWidth` 같은 **원시값 재할당**은 전파되지 않는다.
- `activeDoc()`는 `null` 가능. 핫패스(`inBounds` 등)는 `const d = activeDoc(); return !!d && ...` 가드.

---

## §2. TypeScript 점진 도입

### 배경/판단
전체 `.ts` 일괄 재작성(~4000줄)은 위험·고비용. 바닐라 JS + Vite 프로젝트에 맞는 **점진 채택**을
택한다: TS 컴파일러가 **JSDoc로 JS를 타입체크**하게 하고, 파일 단위로 `// @ts-check`를 켜며,
최종적으로 파일을 `.js`→`.ts`로 옮긴다. 즉시 타입 안전을 얻고 언제든 되돌릴 수 있다.

### 들어간 구성 (1차)
- 루트 `tsconfig.base.json`: `strict`, `allowJs`, `checkJs:false`, `noEmit`, `moduleResolution:"bundler"`.
  → `checkJs:false`라 **`// @ts-check` 붙은 파일만** 체크됨(미적용 파일은 아직 에러 안 냄).
- `packages/core/tsconfig.json`(lib ES2022, `include` src 전체),
  `apps/editor/tsconfig.json`(lib + DOM, `include`는 타입화한 파일만 좁게).
- 각 패키지 `package.json`에 `"typecheck": "tsc -p tsconfig.json"`,
  루트에 `"typecheck": "turbo run typecheck"`, `turbo.json`에 `typecheck` 태스크.
- 계약 타입 `packages/core/src/types.d.ts`(Workspace/MapDoc/Pattern/Layer/Tileset/TileMeta/
  Selection/ProjectSnapshot…), core `exports`에 `"./types"` 추가 → 에디터에서
  `import('@poc/core/types').Workspace`로 참조.
- 1차 타입화 파일: `state.js`(데이터 모델 전체), core `tags.js`·`gid.js`(순수 유틸).

### 다음 파일을 타입화하는 프롬프트 (반복 적용)
```
한 파일씩:
1. 파일 맨 위에 `// @ts-check` 추가.
2. strict라 모든 함수 파라미터에 타입 필요(noImplicitAny). JSDoc로:
     /** @param {number} gid @returns {Tileset|null} */
   도메인 타입은 @poc/core/types에서 import:
     /** @typedef {import('@poc/core/types').Tileset} Tileset */
   두 형태가 섞이는 느슨한 인자는 `any`로 두되 주석으로 이유를 남긴다(예: gid.js의 ts).
3. 객체 리터럴이 타입과 안 맞으면 캐스팅: /** @type {Foo} */ (expr).
4. 필요시 코드를 *타입 안전하게* 소폭 정리(동작 동일). 예: Map.get 후 즉시 사용 대신
     let s = m.get(k); if (!s) m.set(k, s = new Set()); s.add(x);
5. apps/editor/tsconfig.json 의 `include`에 그 파일 경로 추가.
6. npx turbo run typecheck 통과 확인 → 통과하면 다음 파일.
```

### 전체 `.ts` 전환(최종 단계, 후속)
```
- 파일이 충분히 @ts-check로 정제되면 `.js`→`.ts`로 rename.
- import 경로의 확장자/`?raw`(help.js의 마크다운) 처리: Vite는 .ts 네이티브 지원,
  `*.md?raw`는 `src/vite-env.d.ts`에 `declare module '*.md?raw'` 추가.
- pixi 사용하는 apps/game은 타입 정합 작업 후 typecheck 태스크 추가.
- 최종적으로 tsconfig의 checkJs:true 또는 전부 .ts가 되면 allowJs 해제.
```

---

## 검증용 스모크 (state 라우팅)
`state.js`는 DOM 비의존 순수 모듈이라 Node로 직접 import해 검증 가능:
```js
import { state, createWorkspace, makeMap, makePattern,
         activeDoc, projectSnapshot, normalizeActive } from './apps/editor/js/state.js';
// 1) snapshot이 SHARED(tileWidth)·DOC(mapWidth) 병합
// 2) workspace 쓰기 → snapshot 반영,  activeDoc() 쓰기 → snapshot 반영
// 3) 맵 추가/전환 시 snapshot의 DOC 필드가 활성 맵을 따라가고 SHARED는 불변
// 4) activeKind='pattern' 시 snapshot DOC가 패턴을 따라가고 tilesets는 여전히 workspace
```
기대: 모든 assert 통과(1차 실행 시 11/11).
