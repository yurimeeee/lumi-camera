# Phase 4 — AI Smart Editing & Professional Tools: 진행 현황

최종 업데이트: 2026-10-10

| Stage | 상태 |
| --- | --- |
| **A — Professional Editing** | ✅ 완료 (자동 테스트 + 웹 E2E 검증) |
| **B — AI Editing** | 🟡 진행 중 (엔진·UI 대부분 동작, 일부 남음) |
| **C — Workflow & Export** | ⬜ 예정 |

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

## 3. Stage B — 현재 상태 (이번 커밋에 포함, 일부 미완)

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| 9. 피사체 분리 | ✅ 동작 | iOS: `modules/lumi-vision`(Vision person segmentation iOS 15+, foreground instance + person 합성 iOS 17+). macOS 하네스로 실제 사진에서 실행했고 iOS 16.4 SDK로 컴파일 확인. 웹: MediaPipe selfie-multiclass + DeepLab-v3. **iPhone 실기기 실행은 미검증** |
| 10. 배경 흐림 | ✅ 동작 | 정규화 합성곱(피사체 색 번짐 없음)으로 구현, 강도·크기·경계 조절. 테스트와 웹 E2E 확인. 깊이 정보(Depth) 활용은 미구현 |
| 11. 배경 교체 | ✅ 동작 | 단색·그라데이션·종이·앨범 이미지에 확대·위치·흐림·밝기·채도 조절. Frame Studio의 `drawBackground`와 팔레트를 재사용 |
| 12. 객체 제거 | 🟡 동작 | 브러시·올가미·탭, 미리보기 → 적용/취소, Undo/Redo, Export 반영(웹 E2E 확인). PatchMatch(전 플랫폼), MI-GAN(웹 전용, 28MB, MIT). **사람 크기의 큰 물체는 두 엔진 모두 잔상이 남음(기술적 제약)**. iOS에는 MI-GAN 런타임 없음 |
| 13. AI 마스크 선택 | ✅ 동작 | 피사체·배경·인물·피부(피부는 웹만). **하늘은 비활성**: 사용 가능한 하늘 분할 모델이 없음(ADE20K 모델 변환 실패) |
| 14. 필터 추천 | ⬜ 미착수 | 규칙 기반(밝기, 색온도, 채도, 대비, 인물 유무)으로 구현 예정. 통계 함수(`measureImage`)는 준비됨 |

- 개인정보: 모든 AI 처리는 기기 안에서 합니다. 웹은 모델을 처음 내려받기 전에 크기를 안내하고 동의를 받습니다(`services/aiConsent.ts`). 실패하면 편집 상태는 그대로 두고 다시 시도할 수 있습니다(`useAiJob`, `AiJobRow`).
- 큰 결과물(AI 마스크, 인페인팅 패치)은 파일로 저장하고 문서에는 참조만 둡니다(네이티브 `Documents/masks`, 웹은 data URL).

### Stage B 남은 작업
1. 필터 추천(필터 › 추천): 규칙 기반 점수, 실제 필터 썸네일 표시, 추천 근거 표시.
2. 객체 제거
   - 큰 영역에 대한 안내 문구 정리.
   - 탭 선택 결과를 오버레이로 표시.
   - iOS용 학습 기반 인페인팅 검토(Core ML 변환 또는 onnxruntime-react-native, 개발 빌드 필요).
3. iOS 실기기 검증: `lumi-vision` 모듈, 분할 품질, 처리 시간, 메모리. EAS 개발 빌드가 필요합니다(원격 빌드라서 사전 승인 필요).
4. 배경 흐림의 깊이 활용 검토(Portrait HEIC의 disparity 맵).
5. 마스크·패치 파일 정리(`pruneMaskFiles`를 프로젝트/버전 참조와 연결).

## 4. Stage C — 예정 작업

1. **편집 기록(History)**
   - 상단 History 버튼과 Bottom Sheet.
   - 연속된 스냅샷을 비교해 "필터 — Mellow", "노출 +15" 같은 이름을 붙입니다.
   - 항목을 누르면 그 시점을 미리보고, 그 시점으로 되돌릴 수 있습니다.
   - 분기 정책: 되돌린 뒤 새로 편집하면 이후 기록은 버리는 선형 방식입니다. 필요하면 그 전에 버전으로 저장하도록 안내합니다.
2. **버전(Versions)**: `EditVersion` 스냅샷(원본 사진은 복제하지 않음) 저장, 이름 지정, 복원, 삭제. 프로젝트와 함께 저장합니다.
3. **편집 복사 / 붙여넣기**
   - 항목 선택: 필터, 조정, HSL, 커브, 필름 효과, 프레임.
   - 얼굴, 터치, 마스크, 객체 제거는 기본적으로 제외합니다.
   - My Recipe의 `Look` 직렬화를 재사용합니다.
4. **상세 저장(Professional Export)**
   - 형식: JPEG / PNG / HEIC. HEIC은 `lumi-vision`의 `encodeHeic`으로 하며 iOS만 해당하고 macOS에서 동작 확인했습니다.
   - 품질: 표준 / 높음 / 최대. 해상도: 원본 / 2048 / 4096 / 사용자 지정.
   - 메타데이터: 유지 / 위치 제거 / 전체 제거.
   - 저장 위치: 사진 보관함 / 공유 시트(`expo-sharing`) / 파일.
   - 기존 빠른 저장은 그대로 유지합니다.
5. **데이터 마이그레이션**: `EditProject` v1 → v2(문서 버전, 버전 목록). `createEditState`는 이미 Phase 4 필드의 기본값을 채웁니다.
6. **성능 최적화**: 마스크 atlas의 부분 갱신, 객체 제거의 Web Worker 실행, 고해상도 메모리 상한 적용.
7. **최종 회귀 테스트와 보고서**: Phase 1~3, Frame Studio, 테스트 시나리오 A~F.

## 5. 새로 추가된 주요 파일

- 타입·상수: `src/types/phase4.ts`, `src/constants/masks.ts`
- 엔진
  - `src/services/autoEnhance.ts`
  - `src/services/masks/{maskRaster,maskRender,shader,backgroundLayer}.ts`
  - `src/services/inpaint/{patchmatch,objectRemoval,migan,migan.web}.ts`
  - `src/services/segmentation/*`, `src/services/mediapipe.web.ts`, `src/services/aiConsent.ts`
- UI
  - `src/components/editor/{AutoEnhanceRow,SelectivePanel,BackgroundEditPanel,RemovalPanel,AiJobRow,maskTool}.tsx|ts`
  - `src/hooks/{useMaskRender,useBackgroundLayer,useRemovalBase,useAiJob}.ts`, `src/render/readPixels.ts`
- 네이티브: `modules/lumi-vision`(Swift: VisionSegmenter, LumiVisionModule)
- 테스트: `scripts/phase4/*`(`npm run test:phase4`), `scripts/image-engine/{auto,inpaint}.test.ts`
- 런타임: `scripts/setup-ort.js`(ONNX Runtime Web을 `public/ort`로 복사)
