# Phase 4 — AI Smart Editing & Professional Tools: 진행 현황

최종 업데이트: 2026-10-10 (Stage C)

| Stage | 상태 |
| --- | --- |
| **A — Professional Editing** | ✅ 완료 (자동 테스트 + 웹 E2E 검증) |
| **B — AI Editing** | ✅ 구현 완료 (iPhone 실기기 검증만 남음 — EAS 빌드 필요) |
| **C — Workflow & Export** | ✅ 완료 (자동 테스트 + 웹 E2E 검증) |

---

## 1. 기존 프로젝트 분석 요약

- Expo SDK 57, React Native 0.86.3, React 19.2, `@shopify/react-native-skia` 2.6.2, Zustand 5, Reanimated 4.5.
- 렌더링: 단일 SkSL 패스(`src/shaders/lumiShader.ts`). Preview는 지오메트리가 적용된 1600px working image, Export는 같은 셰이더를 2048/4096px 오프스크린으로 렌더(`services/exportImage.tsx`). 화면 캡처를 저장하지 않음.
- 편집 문서: `EditState`(소스 좌표계 기준, 비파괴). Undo/Redo는 `past / present / committed / future` 스냅샷(최대 40단계). `EditProject v1`로 자동 저장.
- 네이티브: 로컬 Expo 모듈 `lumi-face-landmarks`(Apple Vision). 웹은 MediaPipe.
- 제약: 이 Mac은 Xcode 15.4라서 RN 0.86 iOS 로컬 빌드 불가. Swift는 `swiftc` 컴파일과 macOS 하네스로 검증하고, 셰이더는 CanvasKit(bun)으로 검증.

## 2. Stage A — 완료 내역

### AI Auto Enhance (조정 › 기본 › 자동)
- `services/autoEnhance.ts`: 사진의 히스토그램(p01/p05/p50/p95/p99), 클리핑, 채도, 무채색 기준 색 캐스트를 측정합니다.
- 셰이더 톤 단계를 CPU로 그대로 옮긴 모델(`applyTone`, 실제 셰이더와 ≤3/255 일치를 테스트로 고정)로 노출, 밝기, 대비, 하이라이트, 그림자, 색온도, 색조, 생동감, 채도를 계산합니다(풀어서 구함).
  - 노출이 한계에 닿으면 밝기가 나머지를 맡습니다.
  - low-key / high-key 사진은 목표의 절반만 보정합니다.
  - 아주 어두운 기준 픽셀의 색 캐스트는 신뢰도를 낮춥니다(JPEG 양자화 대응).
- 결과는 기존 `adjustments`에 기록되므로 모두 일반 슬라이더로 다시 수정할 수 있습니다. `autoEnhance`에는 제안값과 적용분이 저장됩니다.
- 강도 0~100은 Auto의 몫만 조절하고, 그 뒤에 한 수동 편집은 유지됩니다. **강도 0 = Auto 전 상태와 픽셀 단위로 동일**(E2E diff 0.000).
- 누르고 있는 동안 보이는 전후 비교 버튼과 해제 버튼이 있습니다.

### 선택 보정 (조정 › 선택 보정)
- 마스크 종류
  - 브러시: 크기·경계·흐름·불투명도, 칠하기/지우기
  - 원형: 이동·크기·회전·경계·반전
  - 선형 그라데이션
  - 색상 범위: 탭으로 색 선택, 허용 범위
  - 밝기 범위
  - 모든 마스크에 브러시 다듬기
- 마스크별 독립 보정: 노출, 밝기, 대비, 하이라이트, 그림자, 채도, 색온도, 색조, 명료도, 선명도.
- 마스크 관리: 여러 개 생성, 이름 변경, 복제, 삭제, 표시/숨기기, 반전. 선택한 마스크는 반투명 살구색 오버레이로 표시됩니다.
- 구현 방식
  - 마스크는 소스 좌표로 저장합니다(`types/phase4.ts`).
  - 지오메트리 affine(`sourceToOutput`, `sourceToFrame`에서 유도)으로 RGB atlas(타일당 3채널, 최대 8개 + 피사체 채널)에 래스터화합니다(`services/masks/maskRaster.ts`).
  - 셰이더는 워프 후 위치(`xy`)에서 마스크를 읽습니다. 그래서 크롭, 회전, 얼굴 변형을 해도 내용과 함께 움직입니다.
  - 마스크 보정은 전역 슬라이더와 같은 `lookStage`를 사용합니다. 마스크 안의 노출 +20은 전역 노출 +20과 같습니다.
- Preview / Export: 같은 문서로 같은 atlas를 만듭니다(Preview 1024, Export 2048 타일).

### 검증
- `npm run test:phase4`의 마스크 테스트 14개, `scripts/image-engine/auto.test.ts` 7개를 실제 SkSL로 실행해 통과했습니다.
- 웹 E2E(실제 앱, headless Chromium)
  - Auto: 중앙값 11.8 → 52.0
  - 원형 마스크: 안쪽 +41.5, 바깥 +0.1
  - 브러시: 칠한 영역 −45, Undo 후 −1.5(노이즈 수준)
  - Export vs Preview: 블러 후 평균 차 6.2/255(리샘플링 하한 수준)
- 회귀
  - Frame Studio와 네이티브 라이브 카메라가 셰이더 child 목록을 직접 만들던 부분을 수정했습니다(Frame Studio 37/37 통과).
  - face-warp 체크 1196 케이스 통과, 엔진 테스트 92개 통과.

## 3. Stage B — 완료 내역

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| 9. 피사체 분리 | ✅ | iOS: `modules/lumi-vision`(Vision person segmentation iOS 15+, foreground instance ∪ person matte iOS 17+). macOS 하네스로 실제 사진에서 실행(35–250 ms, 첫 호출 ~3 s), iOS 16.4 SDK 컴파일 확인. 웹: MediaPipe selfie-multiclass + DeepLab-v3(1.5 s) |
| 10. 배경 흐림 | ✅ | 정규화 합성곱으로 피사체 색이 번지지 않음, 강도·크기·경계. 테스트 + 웹 E2E. **Depth(심도) 활용은 미구현** — 분할 기반 2D 흐림 |
| 11. 배경 교체 | ✅ | 단색·그라데이션·종이·앨범 이미지 + 확대·위치·흐림·밝기·채도. Frame Studio `drawBackground`·팔레트 재사용. 캔버스 배경과는 별도 데이터(`EditState.background`) |
| 12. 객체 제거 | ✅ (제약 있음) | 브러시·올가미·탭 → 미리보기 → 적용/취소, Undo/Redo, Export 반영, 탭 선택 오버레이. PatchMatch(전 플랫폼, 웹 E2E 645 ms), MI-GAN(웹, 28MB MIT, 다운로드 포함 32 s). **큰 물체(사람 크기)는 두 엔진 모두 잔상**, 웹 탭 선택은 주변 구조물까지 과선택할 수 있음. iOS는 학습 모델 없음(PatchMatch만) |
| 13. AI 마스크 선택 | ✅ | 피사체·배경·인물·피부(피부는 웹만). **하늘 비활성** — 사용 가능한 하늘 분할 모델 없음(ADE20K 모델 변환 실패) |
| 14. 필터 추천 | ✅ | `services/recommend.ts` 규칙 기반(밝기·색온도·채도·대비·하이라이트·색상 분포·얼굴 인식 결과), 카테고리당 최대 3개, 결정적. 필터 › 추천 탭에 실제 필터 썸네일 + 추천 이유. 테스트: 따뜻한 인물→Mellow/Peachy/Cream 계열, 차가운 풍경→Mist/Blue Hour/Breeze, 야간→Film/B&W |

- 개인정보: 모든 AI 처리는 기기 안. 웹은 모델 다운로드 전 크기 안내·동의(그룹별: segmentation / inpainting). 실패 시 편집 상태 유지, 다시 시도 가능.
- 파일 관리: AI 마스크·패치는 `Documents/masks`(웹 data URL). 사진을 새로 열 때 프로젝트·열린 편집·Undo/Redo 기록이 참조하지 않는 파일만 정리(`pruneMaskFiles`), 세그멘테이션 캐시는 파일이 없으면 다시 실행.

### Stage B 남은 확인
1. **iPhone 실기기 검증** — `lumi-vision` 모듈 실행, 분할 품질·시간·메모리, 대용량 Export. 이 Mac의 Xcode 15.4로는 RN 0.86 빌드 불가 → EAS 개발 빌드 필요(원격 프로젝트 생성이라 사전 승인 필요).
2. 개선 후보: iOS 학습 기반 인페인팅(Core ML), Portrait 사진의 disparity 맵으로 심도 흐림.

## 4. Stage C — 완료 내역

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| 15. 편집 기록 | ✅ | 헤더 🕘 → 기록 시트. 스냅샷 간 차이로 이름 자동 생성(`services/history.ts`: "필터 — Mellow", "노출 +15", "HSL — Orange", "얼굴 · 갸름하게 +10", "피사체 분리", "프레임 — …" 등). 단계를 누르면 그 시점으로 이동(`jumpTo`). **분기 정책: 선형** — 되돌린 뒤 새로 편집하면 이후 기록은 사라짐(시트에 안내, 필요하면 먼저 버전 저장) |
| 16. 버전 | ✅ | ⋯ › 버전: 저장·복원(1 Undo 단계)·이름 변경·삭제, Original 복원. 보정 값 스냅샷만 저장(원본 사진 복제 없음), 프로젝트와 함께 자동 저장. E2E: 복원 후 색 값이 저장 시점과 정확히 일치 |
| 17. 편집 복사 / 붙여넣기 | ✅ | ⋯ › 편집 복사 → 다른 사진에서 ⋯ › 편집 붙여넣기(항목 선택: 필터·조정·HSL·커브·필름 효과·프레임). My Recipe의 `Look` 직렬화 재사용, 앱 재시작 후에도 유지. 얼굴·터치·잡티·마스크·객체 제거·배경 분리·자르기는 제외(시트에 이유 표시) |
| 18. 상세 저장 | ✅ | 저장 버튼 길게 누르기 또는 ⋯ › 상세 저장. 형식 JPEG/PNG/HEIC(HEIC는 iOS 개발 빌드만, ImageIO), 품질 표준/높음/최대, 해상도 원본/2048/4096/직접(가져온 사진보다 키우지 않음), 메타데이터 유지/위치 제거/모두 제거, 저장 위치 사진/공유/파일(iOS는 공유 시트의 ‘파일에 저장’, 웹은 다운로드·Web Share). 빠른 저장(탭)은 그대로. 같은 export 렌더러 사용(화면 캡처 아님) |
| 19. 데이터 마이그레이션 | ✅ | `EditProject` v1 → v2(`documentVersion`, `versions`). v1 프로젝트는 버전 없이 v2로, Phase 4 필드는 기본값으로 채움(테스트) |
| 20. 성능 · 안정성 | ✅ (기본) | Export 해상도는 가져온 사진 이하(최대 4096)로 메모리 상한, AI 작업은 화면이 살아 있을 때만 결과 적용, 실패 시 편집 유지, 객체 제거는 30 ms마다 양보해 UI 유지·취소 가능, 미사용 마스크 파일 정리. 마스크 atlas 부분 갱신·Web Worker는 다음 개선 후보 |

### 검증 (Stage C)
- 자동: `scripts/image-engine/workflow.test.ts` 10개 — 기록 이름·이동·선형 분기, 버전 저장/복원 일치, 붙여넣기 항목 분리(사진 고유 편집 미전파), v1→v2 마이그레이션, 해상도 계산, 메타데이터 3모드(EXIF 판독).
- 네이티브 HEIC: 같은 Swift 코드를 macOS에서 실행 — 유지(GPS·날짜), 위치 제거(날짜만), 모두 제거(없음) 확인.
- 웹 E2E(390px 폭): 헤더 레이아웃, 버전 Warm/Film 저장 → Warm 복원 시 RGB 평균 일치(193.8,188.0,183.2), 기록 "원본 → 필터 — Mellow → 밝기 +41 → 필터 — Noir → …", 다른 사진에 붙여넣기 반영, PNG(메타데이터 없음, 업스케일 안 함)·JPEG(EXIF) 저장.

## 5. 최종 회귀 결과 (Phase 1~3, Frame Studio 포함)

| 검사 | 결과 |
| --- | --- |
| `npm run typecheck` / `npm run lint` | 오류 0 |
| `npm run test:engine` (필터·HSL·커브·레시피·필름·카메라 프리셋·얼굴·Phase 4 엔진·기록) | 109 / 109 |
| `npm run test:phase4` (마스크·배경·객체 제거, 실제 Skia) | 25 / 25 |
| `npm run test:frames` (Frame Studio) | 37 / 37 |
| `npm run check:face-warp` | 1196 케이스 통과 |
| 웹 E2E 재실행 (Stage A/B/C) | 이전과 동일한 수치 |
| iOS | Swift 모듈 iOS 16.4 SDK 컴파일 + macOS 실행. **iPhone 실기기 미검증**(EAS 빌드 필요) |

## 6. 남아 있는 기술적 제약

1. iPhone 실기기 검증 미실시 — 로컬 Xcode 15.4로 RN 0.86 빌드 불가, EAS 개발 빌드 필요.
2. 큰 물체(사람 크기) 객체 제거는 PatchMatch·MI-GAN 모두 잔상, 웹 탭 선택은 과선택 가능. iOS에는 학습 기반 인페인팅 없음.
3. 하늘 자동 선택 미지원(사용 가능한 하늘 분할 모델 없음). 피부 AI 선택은 웹 전용.
4. 배경 흐림은 분할 기반 2D(심도 데이터 미사용).
5. HEIC 저장은 iOS 개발 빌드에서만, 웹은 JPEG/PNG.
6. 객체 제거의 미리보기 결과(적용 전)는 앱 종료 시 저장되지 않음(적용한 결과는 저장됨).

## 7. 새로 추가된 주요 파일

- 타입·상수: `src/types/phase4.ts`, `src/constants/masks.ts`
- 엔진
  - `src/services/autoEnhance.ts`
  - `src/services/masks/{maskRaster,maskRender,shader,backgroundLayer}.ts`
  - `src/services/inpaint/{patchmatch,objectRemoval,migan,migan.web}.ts`
  - `src/services/segmentation/*`, `src/services/mediapipe.web.ts`, `src/services/aiConsent.ts`, `src/services/recommend.ts`
  - `src/services/{history,editClipboard,proExport,exportOptions}.ts`, `src/stores/clipboardStore.ts`
- UI
  - `src/components/editor/{AutoEnhanceRow,SelectivePanel,BackgroundEditPanel,RemovalPanel,RecommendPanel,AiJobRow,maskTool,WorkflowSheets,ExportSheet}.tsx|ts`
  - `src/hooks/{useMaskRender,useBackgroundLayer,useRemovalBase,useAiJob}.ts`, `src/render/readPixels.ts`
- 네이티브: `modules/lumi-vision`(Swift: VisionSegmenter, LumiVisionModule)
- 테스트: `scripts/phase4/*`(`npm run test:phase4`), `scripts/image-engine/{auto,inpaint,recommend,workflow}.test.ts`
- 의존성: `onnxruntime-web`(웹 MI-GAN), `expo-sharing`(공유 시트)
- 런타임: `scripts/setup-ort.js`(ONNX Runtime Web을 `public/ort`로 복사)
