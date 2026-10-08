# Lumi — Capture · Edit · Keep

Lumi는 촬영하면서 감성 필터를 고르고, 찍은 사진이나 앨범 사진을 같은 필터와 세부 보정으로 다듬는 카메라 + 사진 편집 앱입니다.
VSCO보다 쉽고 기본 카메라보다 감성적인, warm · soft · film 톤의 첫 번째 MVP입니다.

## 주요 기능

| 영역 | 기능 |
| --- | --- |
| 카메라 | **프레임 단위 GPU 실시간 필터**(Development Build: 편집·저장과 같은 Lumi 셰이더를 카메라 프레임에 적용, [카메라](#카메라-실시간-필터) 참고), 촬영, 전/후면 전환, 플래시(Auto/On/Off), 타이머(3·5·10초 카운트다운, 탭해서 취소), 3×3 격자, 촬영 비율(Full/1:1/4:3/16:9), 탭 초점 + 노출 보정 슬라이더, 필터/레시피 강도(선택한 필터를 한 번 더 탭), 피부 보정 강도, 필터 캐러셀(All·Favorites·My·카테고리 탭), 셔터 블링크 + 햅틱 |
| 필터 | 20종(Original, Warm 5, Cool 3, Film 5, Soft 3, B&W 3) — 톤 파라미터 + 스플릿 톤 + 필름 톤 커브 + 색상별 HSL의 조합, 강도 0(원본)…100(정의된 효과), 카테고리별 보기, 상세 화면, 즐겨찾기(AsyncStorage 저장) |
| My Recipe | 편집한 색감(필터·강도·조정·HSL·커브)을 이름 붙여 저장 → 다른 사진·카메라에서 적용, 이름 변경·즐겨찾기·삭제(길게 누르기 또는 설정 › My Recipe 관리), 썸네일. 자르기·얼굴 보정은 포함하지 않음 |
| 앨범 | 최근 사진 그리드(페이지네이션), 제한된 접근(iOS limited) 안내 및 추가 선택, 권한 없이도 시스템 사진 선택기로 편집 가능 |
| 편집 | 필터 + 강도, 조정 12종, **HSL**(8색 × 색상·채도·밝기), **톤 커브**(RGB·R·G·B, 점 추가·드래그·삭제), 보정(Retouch: Skin 11종(얼굴 영역 기반 다크서클·주름·홍조·치아 미백·눈 밝게 포함) + 얼굴 랜드마크 기반 Face 8 · Eyes 8(양쪽/왼쪽/오른쪽 개별) · Nose 7 · Lips 8 · Proportion 7, 도구별 자동 확대, [얼굴 보정](#얼굴-보정-retouch) 참고), 터치 보정(밀기: 브러시 크기·강도 선택 후 드래그 / 복원: 문질러 되돌리기 / 잡티 제거: 크기 선택 후 탭), 효과 3종 + 날짜 스탬프, 자르기(Free/Original/1:1/4:3/3:4/16:9/9:16, 드래그·코너 리사이즈), 90° 회전, 좌우/상하 반전, Before/After(길게 누르기 또는 버튼), Undo/Redo(최대 40단계), 개별/전체 초기화, 핀치 확대·축소(최대 6배, 더블탭·‘원래 크기’로 복귀, 웹은 트랙패드 핀치·Ctrl/⌘+휠) |
| 저장 | 화면 캡처가 아니라 원본에서 오프스크린 렌더링(긴 변 최대 4096px / 2048px) → JPEG 80·90(기본)·100% 또는 PNG → EXIF(JPEG: 촬영 시각, 선택 시 GPS) → 사진 보관함 ‘Lumi’ 앨범, “사진에 저장했어요”. 중복 저장 방지, 오류 시 안내. 원본 함께 저장 시 ‘Lumi Originals’에 별도 저장 |
| 비파괴 편집 | 편집할 사진은 앱 Documents에 사본으로 보관(원본 파일은 읽기만), 편집은 데이터(EditState)로만 저장. 마지막 편집 상태 자동 저장 → 앱을 다시 열면 ‘편집하던 사진이 있어요 · 이어서 편집’ |
| 설정 | 무음 모드, 격자, 타이머, 거울 모드, 위치 정보 저장, 촬영 날짜 표시 + 형식 4종, 원본 함께 저장, 고해상도 저장, 저장 형식(JPEG/PNG)·JPEG 품질, 기본 필터·강도·촬영 비율, My Recipe 관리 (Zustand + AsyncStorage) |

## 기술 스택

- Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript (strict)
- Expo Router (파일 기반 라우팅, typed routes)
- Zustand + AsyncStorage persist
- expo-camera, expo-image-picker, expo-media-library(Next API), expo-image-manipulator, expo-file-system, expo-location, expo-haptics, expo-image
- @shopify/react-native-skia (SkSL 런타임 셰이더) — 필터·보정·HSL·커브·날짜 스탬프 렌더링, 카메라 프레임 렌더링
- react-native-vision-camera 5 + react-native-vision-camera-skia/-worklets + react-native-nitro-modules/-image — 카메라 프레임을 Skia 텍스처로 받아 셰이더 적용(Development Build)
- react-native-reanimated 4 + react-native-worklets, react-native-gesture-handler
- piexifjs (순수 JS EXIF 쓰기)
- 얼굴 랜드마크: Apple Vision(iOS, 로컬 Expo 모듈 `modules/lumi-face-landmarks`) · MediaPipe Face Landmarker(웹)
- expo-dev-client (얼굴 보정의 iOS 네이티브 검출 때문에 Development Build 사용)

## 프로젝트 구조

```
src/
  app/                      Expo Router 화면
    _layout.tsx             Stack + GestureHandler + Toast
    index.tsx               카메라 (시작 화면)
    editor/index.tsx        편집기
    library/index.tsx       앨범(최근 항목)
    filters/index.tsx       필터 전체 보기
    filters/[id].tsx        필터 상세
    favorites/index.tsx     즐겨찾기 필터
    settings/index.tsx      설정
  components/
    common/                 IconButton, PressableScale, SliderControl, SegmentedControl,
                            ChipTabs, BottomSheet, Toast, Header, PermissionView
    camera/                 QuickControls, ShutterButton, overlays(Grid/RatioMask/LiveFilter/Countdown)
    editor/                 EditorCanvas, EditorToolbar, ToolSliderPanel, panels, CropOverlay
    filters/                FilterThumbnail, FilterCarousel, FilterCard, FilterGrid
    library/                PhotoGrid
    settings/               SettingRow/SettingToggle/SettingSection, OptionSheet
  constants/                theme(디자인 토큰), filters, adjustments, camera, crop
  shaders/lumiShader.ts     SkSL 이미지 파이프라인
  render/                   LumiLayer, DateStampLayer, offscreen 렌더 헬퍼 (Skia 노드)
  services/                 imageProcessing(파라미터 합성), imagePipeline(기하/리사이즈),
                            exportImage(최종 렌더·인코딩), mediaLibrary(.web), exif, location, feedback,
                            frameCoords(원본 ↔ 화면 프레임 좌표, 순수 함수)
    faceDetection/          FaceDetector(진입점·캐시), types(검출기 독립 랜드마크),
                            backend(.web)(Vision / MediaPipe), visionMapping, mediapipeMapping, landmarkMath,
                            faceIdentity(재검출 시 얼굴 ID 매칭), featureFocus(도구별 자동 확대 영역)
    faceWarp/               FaceWarpEngine(계획·유니폼·셰이더 미러), mesh(얼굴 모델·윤곽 프로파일),
                            transforms(슬라이더 → 변형), limits(자연스러운 최대치), shader(SkSL),
                            regions(피부 도구 영역·특징 보호 마스크 + SkSL), faceRender(미리보기·저장 공용 진입점)
  stores/                   cameraStore, editorStore, filterStore, settingsStore, toastStore
  hooks/                    useCapture, useSaveEdit, useWorkingImage, usePreviewImage,
                            useFilterThumbnail, useOpenInEditor, useFaces
  types/, utils/
assets/fonts/               DSEG7 Classic (날짜 스탬프용 7-segment 폰트, SIL OFL 1.1)
modules/lumi-face-landmarks/ 로컬 Expo 모듈: Apple Vision 얼굴 랜드마크(iOS, Swift)
```

## 설치 & 실행

```bash
cd lumi-camera
npm install          # postinstall이 웹용 canvaskit.wasm·MediaPipe 런타임을 public/에 복사합니다
npx expo start       # Development Build(또는 Expo Go)로 열기
```

| 명령 | 설명 |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (앱 + `scripts/face-warp` + `scripts/image-engine`) |
| `npm run test:engine` | 이미지 엔진·상태 테스트 + 실제 셰이더 golden image (macOS/Linux + [Bun]) |
| `npm run lint` | `expo lint` |
| `npx expo-doctor` | 의존성·설정 진단 |
| `npm run web` | 웹에서 UI 확인 (얼굴 보정 포함, MediaPipe) |
| `npm run ios` | `expo run:ios` — 로컬 Development Build (Xcode 16.1 이상) |
| `npm run check:face-warp` | 얼굴 워프 회귀 검사 (macOS + [Bun], 아래 [검증 결과](#검증-결과) 참고) |

### iPhone: 실시간 카메라 필터와 얼굴 보정은 Development Build가 필요합니다

**왜 필요한가**: 카메라 프레임에 필터를 적용하는 VisionCamera(Nitro 네이티브 모듈)와 얼굴 보정 모두 Expo Go에 없는 네이티브 코드입니다. 얼굴 보정은 사진 속 얼굴의 랜드마크(윤곽·눈·코·입 좌표)가 있어야 동작합니다. iOS에서는 Apple Vision 프레임워크로 검출하는데, 이 코드는 Lumi 전용 네이티브 모듈(`modules/lumi-face-landmarks`, Swift)이라 Expo Go 안에는 들어 있지 않습니다. Expo Go는 미리 포함된 네이티브 모듈만 실행할 수 있습니다.

**추가된 네이티브 의존성**

| 항목 | 내용 |
| --- | --- |
| `modules/lumi-face-landmarks` | 로컬 Expo 모듈(autolinking, `expo-module.config.json`). `detect(uri)` → 얼굴별 랜드마크 영역. iOS 16.4+ |
| Vision.framework, ImageIO.framework | iOS 시스템 프레임워크 — 외부 라이브러리·모델 파일·네트워크 없음, 기기 안에서 처리 |
| `expo-dev-client` | Development Build 런처 |
| `react-native-vision-camera` 5 (+ `-skia`, `-worklets`), `react-native-nitro-modules`, `react-native-nitro-image` | 카메라 프레임 → Skia 텍스처 → Lumi 셰이더. 권한 문구는 기존 expo-camera 플러그인의 `NSCameraUsageDescription` 사용 |

Expo Go에서도 앱은 그대로 실행되고(카메라·필터·조정·HSL·커브·레시피·Skin 보정·터치 보정·자르기 모두 동작), 카메라 미리보기는 색 레이어 근사로 바뀌며(촬영본은 정확), Retouch의 Face/Eyes/Nose/Lips/Proportion 탭만 “Development Build에서 쓸 수 있어요” 안내와 함께 비활성화됩니다. 모듈은 `requireOptionalNativeModule`로 불러와 없을 때 null이 되므로 크래시하지 않습니다.

**iOS 빌드 방법**

```bash
# A. EAS 클라우드 빌드 (Mac/Xcode 불필요) — 기기 등록 후 설치 링크가 나옵니다
npx eas-cli@latest device:create                                   # 처음 한 번: 테스트할 iPhone 등록
npx eas-cli@latest build --profile development --platform ios
#    시뮬레이터용: --profile development-simulator

# B. 로컬 빌드 (Xcode 16.1 이상 필요 — React Native 0.86 요구사항)
npx expo run:ios --device       # USB로 연결한 iPhone에 설치
npx expo run:ios                # 시뮬레이터

# 설치 후 개발 서버
npx expo start                  # 설치된 Lumi 개발 빌드가 QR/같은 네트워크로 접속
```

`ios/`·`android/`는 Continuous Native Generation으로 생성되므로 커밋하지 않습니다(`.gitignore`). 네이티브 설정은 `app.json`과 모듈에만 둡니다.

## iOS 권한

권한은 앱 시작 시 한꺼번에 묻지 않고, 기능을 실제로 쓰는 순간에 요청합니다.

| 권한 | 요청 시점 | 거부 시 |
| --- | --- | --- |
| 카메라 | 카메라 화면 진입 후 ‘권한 허용하기’ | 설명 + 설정 열기, ‘앨범에서 편집하기’로 우회 |
| 사진 보관함(읽기) | 앨범 화면 진입 | 설명 + 설정 열기, 시스템 사진 선택기(권한 불필요)로 한 장 편집 |
| 사진 보관함(추가) | 저장 버튼 | 설정 이동 안내 Alert |
| 위치(사용 중) | 설정에서 ‘위치 정보 저장’을 켤 때 | 스위치를 끈 채 유지 + 설정 이동 안내 |

Info.plist 문구는 `app.json`의 config plugin 옵션에 한국어로 정의되어 있습니다.

## 필터 시스템

필터는 **데이터**입니다 (`src/constants/filters.ts`). 새 필터는 배열에 항목 하나를 추가하면 끝입니다.

```ts
{
  id: 'mellow',
  name: 'Mellow',
  category: 'warm',
  description: '따뜻하고 부드러운 무드의 필터',
  params: { temperature: 16, warmth: 18, contrast: -10, highlights: -14, shadows: 8, saturation: -6, fade: 12 },
  splitTone: { shadows: [0.52, 0.48, 0.46], highlights: [0.62, 0.52, 0.42], amount: 40 },
  preview: [{ color: '#F2B98A', blend: 'soft-light', opacity: 0.38 }], // 카메라 실시간 근사
}
```

처리 흐름:

1. **합성** (`services/imageProcessing.ts`): `필터 params × 강도 + 사용자 조정 + 리터치`를 같은 -100…100 공간에서 선형 합성 → 셰이더 uniform으로 정규화. UI와 무관한 순수 함수입니다.
2. **기하** (`services/imagePipeline.ts`): 회전 → 반전 → 자르기 → 리사이즈를 expo-image-manipulator(네이티브)로 처리. 편집 프리뷰는 최대 1600px, 저장은 4096px(고화질) / 2048px.
3. **색/질감** (`shaders/lumiShader.ts`): 하나의 SkSL 셰이더에서 터치 보정 변위 → 얼굴 워프(`services/faceWarp`) → 리터치 → 선명도/정의 → 노출/밝기 → 화이트밸런스(색온도·색조·따뜻함) → 하이라이트/그림자 → 대비 → 채도/생동감 → 스플릿 톤 → 광채 → 페이드 → 비네팅 → 그레인 순으로 처리.
   반경은 이미지 짧은 변의 1/1000 단위라 화면 프리뷰와 저장본이 같은 결과를 냅니다.
4. **내보내기** (`services/exportImage.tsx`): 오프스크린 렌더 + 날짜 스탬프 → JPEG → EXIF → 저장.

성능: 슬라이더를 움직이면 편집 캔버스(uniform)만 다시 그려지고 이미지 데이터는 복제되지 않습니다. 필터 썸네일은 한 번만 오프스크린 렌더링해 캐시하고 이미지로 표시합니다. Zustand selector로 필요한 상태만 구독합니다.

## 이미지 처리 엔진 (Phase 1)

보정값은 순수 데이터(`EditState`)이고, 이를 픽셀로 바꾸는 수학은 **SkSL 셰이더 하나**(`shaders/lumiShader.ts`)에만 있습니다. 편집 미리보기, 필터 썸네일, 카메라 프레임, 고해상도 저장이 모두 같은 `resolveProcessing → buildUniforms → LUMI_SKSL (+ 커브 LUT)`을 거치고, 해상도·실행 위치만 다릅니다. 반경 같은 공간 값은 짧은 변의 1/1000 단위라 해상도와 무관합니다.

```
EditState / Recipe / 카메라 룩 (순수 데이터, -100…100)
   │  services/imageProcessing.ts  resolveProcessing(): 필터 × 강도 + 사용자 값 (톤·스플릿 톤·HSL·커브)
   │  services/color/hsl.ts         composeHsl()  → uHsl[8] (float3)
   │  services/color/curves.ts      buildCurveTable() → 256×RGB LUT (monotone cubic)
   ▼
buildUniforms() + curveTexture()      (services/color/curveTexture.ts: 256×1 텍스처, 내용 기준 캐시)
   ▼
LUMI_SKSL  … 노출/밝기 → 화이트밸런스 → 하이라이트/그림자 → 대비 → 채도/생동감 → HSL → 스플릿 톤 → 커브 LUT → 광채 → 페이드 → 비네팅 → 그레인
   ├─ render/LumiLayer.tsx            편집 캔버스 · 썸네일 · 필터 상세 (Preview)
   ├─ services/exportImage.tsx        원본 해상도 오프스크린 렌더 → JPEG/PNG (Export)
   └─ components/camera/SkiaLiveCamera.native.tsx   카메라 프레임 워클릿 (render/uniformLayout.ts로 같은 uniform을 평탄화)
```

요청 구조와의 대응: `image-engine/core` → `services/imageProcessing.ts`(ImageEngine/RenderPipeline 역할), `operations/*` → 셰이더의 단계별 블록 + `services/color/{hsl,curves}.ts`, `filters/presets.ts` → `constants/filters.ts`, `filterCompiler` → `resolveProcessing`, `PreviewRenderer` → `render/LumiLayer.tsx`, `ExportRenderer` → `services/exportImage.tsx`, `shaders/` → `shaders/lumiShader.ts`. 기존 구조가 이미 UI와 처리를 분리하고 있어 디렉터리를 옮기지 않았습니다.

| 연산 | 구현 |
| --- | --- |
| Exposure | 선형 배율 `c × 2^(1.2·v)` (광량) |
| Brightness | 감마 곡선 `c^(2^(−0.7·v))` — 검정·흰색 고정, 중간톤만 이동 |
| Highlights / Shadows | 휘도 기반 smoothstep 마스크로 밝은/어두운 영역만 |
| Saturation / Vibrance | 휘도 기준 혼합 / 이미 채도 높은 픽셀은 덜 증가 |
| Temperature / Tint | 채널 게인(파랑↔노랑) / 초록↔마젠타 |
| HSL | 8개 색상 중심(0·30·60·120·180·225·270·315°), 이웃 중심까지 smoothstep 가중치(합 = 1, 경계 단절 없음), 회색 근처는 게이트로 제외. 색상 ±30°, 채도 배율, 밝기 |
| Curves | Fritsch–Carlson monotone cubic(오버슈트·NaN 없음), 필터 커브(강도로 직선과 보간) → 사용자 RGB 커브 → 채널 커브를 256 LUT로 합성, 셰이더에서 엔트리 사이 선형 보간 |

### 필터 강도와 My Recipe

- 강도 k = intensity/100: 필터의 톤 값·스플릿 톤·HSL은 ×k, 커브는 `x + (f(x) − x)·k`. 0이면 원본과 비트 단위로 같고(셰이더를 건너뜀), 100이면 정의 그대로입니다. 사용자의 수동 보정은 필터와 별도 값이라 필터를 바꿔도 유지됩니다.
- 레시피는 색감 값만 **복사**해 저장하고, 적용할 때도 편집에 **복사**합니다(`editorStore.applyLook`, Undo 1단계). 레시피를 지워도 그 레시피로 만든 편집은 그대로입니다.
- 카메라에서 레시피의 강도 슬라이더는 레시피 전체(필터 강도·조정·HSL·커브)를 원본 쪽으로 같은 비율로 줄입니다(`scaleColorLook`). 미리보기와 촬영본에 같은 축소값이 들어갑니다.

### 비파괴 편집 · 자동 저장

- 앨범·카메라에서 연 사진은 정규화(EXIF 회전 반영, HEIC 디코딩) 후 `Documents/originals/`에 사본을 만들고(`services/appFiles.ts`), 편집은 그 사본만 읽습니다. 사용자의 사진 파일은 수정하지 않고, 저장은 항상 새 파일입니다.
- `services/editProject.ts`: 커밋된 편집 상태가 바뀔 때마다(디바운스 0.4초) `EditProject {id, originalUri, createdAt, updatedAt, source, document}`를 AsyncStorage에 저장합니다. Undo 기록은 저장하지 않습니다. 편집 화면을 나가면 지우고, 앱이 종료된 채 남아 있으면 카메라 화면에 ‘편집하던 사진이 있어요 · 이어서 편집’이 표시됩니다(× → 확인 후 삭제). 이후 버전에서 필드가 추가돼도 `createEditState`로 기본값이 채워집니다.
- 웹은 원본을 data URL로 보관합니다(약 3.5MB 이하일 때만 — localStorage 한도).

## 카메라 실시간 필터

| 후보 | 판단 |
| --- | --- |
| expo-camera (기존) | 프레임을 JS/Skia에 넘기지 않음 → 색 레이어 덮기만 가능. 요구사항상 실제 필터로 인정되지 않음 → **Expo Go/웹 폴백으로만** 유지 |
| **VisionCamera 5 + vision-camera-skia** (선택) | Expo SDK 57 / RN 0.86 / Skia 2.6 / Reanimated 4.5 / worklets 0.10과 호환(peer `*`, 개발 버전 Skia 2.6.4·worklets 0.9). `SkiaCamera`가 프레임을 Skia 텍스처로 주고, 프레임 워클릿에서 **같은 LUMI_SKSL**을 `makeShaderWithChildren`으로 실행. 별도 사진 출력으로 원본 해상도 촬영. Nitro 네이티브 모듈이라 Development Build 필요 |
| iOS Core Image / Metal 직접 구현 | 셰이더를 Metal로 다시 써야 해서 미리보기와 저장 수학이 갈라짐 → 제외 |

- 구조: `components/camera/LiveCamera.tsx`가 VisionCamera를 `require`로 감싸 불러옵니다(Expo Go에서는 Nitro 모듈이 없어 import 자체가 throw → expo-camera 폴백). `LIVE_CAMERA`로 기능(프레임 필터·초점·노출) 지원 여부를 화면에 알립니다.
- 필터·강도·레시피를 바꾸면 공유값(uniform 배열·LUT 이미지)만 바뀌고 카메라 세션은 재구성되지 않습니다. 프레임은 프리뷰 크기(`enablePreviewSizedOutputBuffers`)로 받아 셰이더 비용을 줄입니다.
- 촬영: 사진 출력(JPEG 95%) → EXIF 회전 반영 → 전면 거울 모드 설정에 맞게 좌우 반전 보정(`CapturedPhoto.mirrored`) → 비율 중앙 크롭 → 앱 사본 → 같은 룩이 적용된 편집 화면(저장 또는 추가 편집).
- 초점·노출: 프리뷰를 탭하면 그 지점에 초점·측광(AF/AE) + 노출 슬라이더(±2EV, 기기 범위 내, 3.5초 후 숨김).

## 테스트

| 명령 | 내용 |
| --- | --- |
| `npm run test:engine` | Bun + CanvasKit. **실제 LUMI_SKSL**을 CPU로 렌더링해 검사(57개). 얼굴 보정(`face.test.ts`, 22개): 모든 컨트롤 0 = 워프·영역 없음, 눈 각도 ±(바깥 눈꼬리 위/아래, 홍채 중심 고정), 한쪽 눈 값은 그 눈만, 인중(입만 이동·코·턱 고정), 콧구멍(코끝 고정), 입꼬리(입 중심 고정), 모든 컨트롤 ±100에서 접힘 없음·사진 가장자리 고정, 피부 영역(보호 마스크가 눈·눈썹·입술·콧구멍만 덮음, 도구마다 자기 영역만, 다문 입은 치아 영역 없음), 셰이더(치아 미백은 누런 치아만·입술 그대로, 다크서클은 그늘만 볼 톤으로·속눈썹 유지, 보호 영역은 강한 피부 보정에도 픽셀 그대로, 피부결 0 = 원본), 얼굴 ID 재매칭, 자동 확대 영역, 얼굴별 상태·Undo, 구버전 프로젝트 복구. Phase 1(35개): 셰이더 컴파일, 중립 uniform = 원본(HSL·커브 경로 강제 실행), 모든 필터 강도 0 = 원본, 강도 100 = 정의값, 필터 간 구별, HSL Orange/Blue가 피부·하늘만 바꾸고 회색은 그대로 + CPU 미러와 픽셀 일치(≤2/255), 색상 경계 단절 없음, S-커브·Blue 채널이 LUT와 일치(≤1/255), 극단적 커브에서도 NaN·범위 초과 없음, **미리보기 해상도 vs 저장 해상도 결과 일치**(시나리오 B), golden image 9장(`scripts/image-engine/golden`), Undo/Redo, Reset(HSL 색상별·커브 채널별·전체), Recipe 저장/적용/삭제/이름 변경/영속화, EditProject 직렬화·구버전 문서 복구, 원본 참조 유지·ID 충돌 없음, 인코딩 실패 오류 |
| `npm run test:engine:update` | 의도한 룩 변경 후 golden image 갱신 |
| `npm run check:face-warp` | 실제 사진 14장 + Apple Vision 랜드마크로 얼굴 워프 회귀 검사(1196 케이스) + 피부 영역 위치 검사(15개 얼굴), [검증 결과](#검증-결과) 참고 |
| `npm run render:face-retouch` | 실제 사진에서 컨트롤별 전/후 비교 시트를 `.face-warp-cache/renders/`에 저장(사람이 보는 용도). 피부 도구가 영역 밖 픽셀을 바꾸면 실패 |

웹 E2E(헤드리스 Chromium + SwiftShader WebGL, 실제 앱 조작)로 시나리오 B·C·D·E·F를 확인했습니다: Peachy → 노출 → HSL Orange 밝기 → S-커브 → Before(원본) → Undo/Redo → 저장(원본 해상도 1280×741, 미리보기와 채널 평균 차 0.30/255, 토스트) → Save as Recipe ‘Warm Diary’ → 새로고침 → 이어서 편집(편집 결과 픽셀 차 0) → 전체 초기화(원본) → 다른 사진에 Warm Diary 적용, 콘솔 오류 0.

## 기술적 제약과 선택한 대안

- **카메라 실시간 필터**: Development Build에서는 VisionCamera 5 + Skia로 프레임마다 Lumi 셰이더를 실행합니다([카메라](#카메라-실시간-필터)). Expo Go·웹은 프레임에 접근할 수 없어 expo-camera + RN `mixBlendMode` 레이어 근사로 동작하고, 화면에 ‘미리보기는 근사치’라고 표시합니다. 어느 쪽이든 **촬영된 사진에는 Skia 파이프라인 전체가 정확히 적용**됩니다.
- **웹 캔버스 색 공간**: react-native-skia 웹 캔버스는 WebGL 버퍼를 display-p3로 지정하지만 CanvasKit은 sRGB 값을 그려, 미리보기가 저장본보다 채도가 높게 보였습니다(측정: 같은 사진에서 R +4…+6/255, 회색은 동일). `index.web.ts`에서 버퍼를 sRGB로 유지해 미리보기 = 저장본(채널 평균 차 0.3/255)이 되게 했습니다.
- **무음 모드**: iOS 셔터음은 기기·지역 정책(예: 한국·일본)상 강제되는 경우가 있습니다. expo-camera의 `shutterSound: false`는 iOS에서 시스템 사운드를 dispose하는 우회 방식이라 **사용하지 않습니다**. 무음 모드는 Lumi 자체 효과음만 끄며(`services/feedback.ts`), 시스템 셔터음은 OS 정책을 따릅니다.
- **피부 보정**: 픽셀 단위 segmentation 모델 대신 **YCbCr 피부색 범위 마스크 × 랜드마크 영역**을 씁니다. 눈·눈썹·입술·콧구멍은 랜드마크 타원으로 보호하고(피부색이어도 제외), 다크서클·주름·홍조·치아·눈 도구는 각자의 랜드마크 영역 안에서만 동작합니다([피부 영역](#피부-영역)). 머리카락은 랜드마크가 없어 색 마스크로만 구분합니다(갈색 머리카락 일부가 피부색으로 읽힐 수 있음).
- **비율 촬영**: iOS 센서는 4:3이므로 1:1·16:9는 촬영 후 중앙 크롭하고, 프리뷰는 잘릴 영역을 어둡게 표시합니다.
- **EXIF**: Skia 인코더는 메타데이터를 쓰지 않아 piexifjs로 촬영 시각과 (선택 시) GPS를 다시 기록합니다.
- **Skia `ImageShader` 샘플링**: Skia 2.6의 `<ImageShader>`는 cubic이 아닌 sampling 옵션을 `makeShaderCubic`로 잘못 넘깁니다. 그래서 Mitchell cubic 샘플링을 명시적으로 사용합니다.

## 터치 보정

`터치` 탭에서 브러시 크기와 강도를 고르고 사진을 드래그하면 브러시 안쪽이 밀립니다(liquify의 push). 플랫폼 제약이 없어 네이티브에서도 동작합니다.

- 보정 앱처럼 조금씩 다듬도록 만들었습니다. 브러시는 짧은 변의 3~25%까지 키울 수 있습니다(큰 브러시가 같은 변화를 넓게 퍼뜨려 덜 휩니다). 내용은 손가락 이동의 4~30%만 따라옵니다(강도, 기본 약 14%). 한 획이 밀 수 있는 거리는 브러시 반경의 12%까지이고, 이 상한에 가까워질수록 점점 덜 밀립니다. 감쇠는 `(1 − t²)²`입니다. 가운데는 거의 그대로 옮겨지고, 국소적으로 눌리거나 늘어나는 정도가 약 18% 안쪽이라 피부결이 자연스럽게 남습니다. 손가락 경로는 스무딩해서 손떨림이 물결로 남지 않게 합니다. 변위 필드는 텍스처로 만들기 전에 [1 4 6 4 1] 블러를 한 번 거쳐, 획이 겹친 자리도 매끄럽게 휩니다.

- **복원**: 문지른 곳의 변위를 조금씩 0으로 되돌립니다(포토샵 Liquify의 Reconstruct). 밀기가 과한 부분만 살짝 문지르면 됩니다.
- 획은 **원본 사진 좌표**로 저장됩니다(`EditState.reshape`). 회전·반전·자르기를 나중에 해도 같은 위치에 남고, Undo는 획 단위입니다.
- 획은 화면에 보이는 프레임 위의 변위 필드(긴 변 320칸 격자, `services/reshape.ts`)로 재생됩니다. 작은 단계로 나눠 `d'(p) = d(p − m·w) − m·w`로 누적해 접히지 않습니다. 드래그 중에는 새 구간만 더합니다(`hooks/useReshapeField.ts`).
- 필드는 축마다 16비트(R = 상위 바이트, G = 하위 바이트) RGBA8 텍스처 2장으로 셰이더에 들어갑니다. 해상도와 무관해서 미리보기와 저장본이 같은 결과를 냅니다. B-spline으로 샘플링해 바이트 쌍이 오버슈트하지 않습니다.

### 확대해서 보정하기

편집 화면은 핀치로 최대 6배까지 확대됩니다(`hooks/useZoom.ts`). 확대는 Skia `Group` transform으로 화면 픽셀 단위로 다시 그려서 흐려지지 않습니다. 상태는 shared value에 있어 핀치 중에는 React가 다시 렌더링되지 않습니다.

- **두 손가락**: 확대·축소하고, 손가락을 움직이면 함께 이동합니다. 밀기 중에 두 번째 손가락이 닿으면 그리던 획은 버립니다.
- **움직임**: 손을 떼면 한 손가락·두 손가락 모두 속도만큼 관성으로 미끄러집니다(`withDecay`). 미끄러지는 중에 손을 대면 그 자리에서 잡힙니다. 가장자리나 1배·6배 한계를 넘기면 고무줄처럼 저항하다가 놓으면 스프링으로 돌아옵니다. 웹 휠 한 칸은 최대 1.18배로, 목표값을 부드럽게 따라갑니다.
- **한 손가락**: 밀기·잡티 모드에서는 보정, 그 외 탭에서는 확대한 상태일 때 이동입니다.
- **브러시 크기**: 밀기 브러시는 화면 기준 크기라 확대할수록 사진 위에서 세밀해집니다. 잡티 크기는 사진 기준이라 확대는 겨누는 데만 영향을 줍니다.
- **웹**: 트랙패드 핀치·Ctrl/⌘+휠은 확대, 확대한 상태에서 휠은 이동입니다. 자르기 탭에서는 확대하지 않습니다.

### 잡티 제거

`터치` 탭에서 `잡티 제거`를 고르고 잡티를 탭하면 그 자리를 주변 피부로 채웁니다(탭 1회 = Undo 1단계, 사진당 최대 48개). 위치는 원본 좌표로 저장됩니다.

셰이더(`heal`)는 복구 브러시 방식입니다. 가까운 피부 패치(도너)를 통째로 복사해 모공·잔결을 살리고, 잡티 주변 링과 도너 주변 링의 색 차이를 경계에서 안쪽으로 매끄럽게 보간해 더해 경계를 잇습니다. 도너는 주변 8곳 중 톤이 비슷하면서 무늬가 약한(눈썹·주름이 없는) 곳을 고릅니다. 가장자리는 부드럽게 섞고, 원 경계 근처에서 아직 색이 다른 픽셀은 조금 더 바깥까지 메워 탭이 빗나가도 테두리가 남지 않게 합니다.

## 얼굴 보정 (Retouch)

편집 화면 `보정` 탭: **피부 · 얼굴형 · 눈 · 코 · 입 · 비율**. 카테고리를 고르면 아이콘·이름·값이 있는 가로 목록이 나오고, 하나를 고르면 위쪽 슬라이더로 조절합니다. 카테고리마다 `얼굴형/눈/코/입/비율 초기화`, 얼굴 보정 전체는 `전체 초기화`.

| 카테고리 | 컨트롤 (범위) |
| --- | --- |
| 피부 | 사진 전체(얼굴 인식 불필요, 얼굴이 있으면 이목구비 보호): 매끈하게(Smooth), 피부결(±, Texture), 잡티 완화, 피부 톤(±), 광채(Glow), 디테일. 선택한 얼굴의 영역에만: 다크서클, 주름, 홍조(Redness), 치아 미백, 눈 밝게. `잡티 제거 (탭)` 버튼 → 터치 도구의 잡티 제거(확대 후 탭) |
| 얼굴형 | 갸름하게(Slim), 얼굴 너비(±), 턱(Jaw), 턱끝(±), V라인, 광대(Cheek), 이마(±), 얼굴 길이(±) |
| 눈 | 눈 크기(±), 눈 길이(±, Eye Width), 눈 높이(±), 눈 사이(±), 눈 위치(±), 눈 각도(±, Eye Angle), 눈꼬리(±), 애교살(Under Eye) — **양쪽 / 왼쪽 눈 / 오른쪽 눈** 선택 |
| 코 | 코 너비(±), 콧볼(Nose Wing), 코끝(±), 코 길이(±), 코 크기(±), 콧대(Nose Bridge), 콧구멍(±, Nostril Width) |
| 입 | 입 너비(±, Lip Width), 입술 크기(±), 윗입술(±), 아랫입술(±), 입 위치(±, + = 위로), 입꼬리(±, Mouth Corner), 미소, 인중(±, Philtrum) |
| 비율 | 중안부(±, Midface), 상안부(±, 이마 높이), 하안부(±), 얼굴 길이(±), 눈/코/입 위치(±) |

0 … 100 컨트롤은 0이 원본, ± 컨트롤은 가운데(0)가 원본입니다. 슬라이더 0에서는 워프 계획도 피부 영역도 만들어지지 않아 **원본과 비트 단위로 같습니다**(검증: 픽셀 차이 0).

**좌/우 눈**: 눈 탭 위의 `양쪽 / 왼쪽 눈 / 오른쪽 눈`. 한쪽을 고르면 모양 컨트롤(크기·길이·높이·위치·각도·눈꼬리)이 그 눈의 **추가값**을 편집하고, 실제 적용값은 양쪽 값 + 그 눈 값입니다. 눈 사이·애교살은 양쪽 공통이라 한쪽 모드에서는 흐리게 표시됩니다. 값은 검출기의 왼쪽/오른쪽 눈(원본 사진 기준)에 저장해, 나중에 좌우 반전해도 같은 눈에 남고, 버튼의 ‘왼쪽/오른쪽’은 지금 화면 기준으로 바뀝니다.

**자동 확대**: 도구를 고르면 그 부위가 보이도록 확대합니다(콧볼 → 코, 인중·치아 → 입, 다크서클·눈 밝게 → 눈, 한쪽 눈 → 그 눈, 얼굴형·비율·주름·홍조 → 얼굴, 사진 전체 피부 도구 → 그대로). 손으로 확대·이동·‘원래 크기’를 누르면 그 상태를 덮어쓰지 않고, 보정 탭에 다시 들어올 때(사진이 원래 크기일 때만) 다시 켜집니다.

### 구조

```
Original (source) ──► faceDetection ──► FaceLandmarks (원본 기준 0…1 좌표, 검출기 독립)
                                              │  + EditState.faces[faceId] (슬라이더 값)
                                              ▼
                     geometry(회전·반전·자르기) → faceWarp/mesh: 얼굴 모델 (render px)
                                              ▼
                     faceWarp/transforms: 윤곽 프로파일 + 세로 밴드 + feature primitive
                                              ▼
                     FaceWarpEngine → shader uniforms ──► Lumi SkSL (GPU, 해상도 무관)
```

- **검출 레이어**(`services/faceDetection`): `FaceDetectorBackend` 인터페이스 하나로 검출기를 바꿉니다. iOS는 Apple Vision, 웹은 MediaPipe. 둘 다 같은 `FaceLandmarks`(윤곽·턱·턱끝·볼·이마, 눈 윤곽/안·바깥 눈꼬리/위·아래 눈꺼풀/동공, 눈썹, 콧대·코끝·콧볼·콧구멍·비하점, 입술 안/밖·입꼬리·윗입술 위·아랫입술 아래, 인중, MediaPipe면 478점 메시)로 매핑됩니다. 검출기마다 “left”의 의미나 점 순서가 달라서 매핑은 인덱스가 아니라 얼굴 축 기준 기하(극값)로 점을 고릅니다.
- **좌표**: 랜드마크는 **원본 사진** 기준이라, 나중에 회전·반전·자르기를 해도 같은 얼굴을 따라갑니다(`frameCoords.sourceToFrame`). 미리보기와 저장본은 같은 랜드마크를 해상도만 다르게 씁니다.
- **엔진/UI 분리**: 상태에는 UI 값(−100…100)만 저장하고, 실제 변형량은 엔진이 얼굴 크기에 맞춰 계산합니다(`limits.ts`).

### 얼굴 인식 기술 선택

| 후보 | 판단 |
| --- | --- |
| **Apple Vision** `VNDetectFaceLandmarksRequest` (선택, iOS) | iOS 내장, 추가 SDK·모델 파일·네트워크 없음, 장당 ~10ms(M-시리즈 Mac 측정), 76/65점 + 동공. 이마 점이 없어 이마 호는 얼굴 비율(눈선 위 0.6L)로 추정 |
| **MediaPipe Face Landmarker** (선택, 웹) | 478점 dense mesh(이마 포함). 웹은 이미 쓰고 있었음. iOS에선 CocoaPods SDK(수십 MB)와 모델 번들이 필요해 Vision 대비 이점이 작음 |
| Google ML Kit Face Mesh | Android 후보(향후). iOS는 Vision으로 충분 |
| Vision Camera + Frame Processor | 실시간 카메라 프레임용. 정지 사진 편집에는 불필요 |
| 얼굴 bounding box만 사용 | 스펙상 제외 — 모든 변형은 랜드마크 기반 |

### 워프 알고리즘

GPU 셰이더 안에서 **역방향 변위(backward warp)**로 처리합니다. 출력 픽셀마다 “원본의 어디를 샘플링할지”를 계산하므로 구멍이 생기지 않고, 언제나 손대지 않은 원본을 샘플링하므로 여러 번 바꿔도 화질이 떨어지지 않습니다. 세 가지 국소 변형만 씁니다.

1. **윤곽 프로파일 필드 (Face: Slim, Width, Jaw, V-Line, Cheek, Forehead)** — 얼굴 축(눈선 중점 → 턱끝, 단위 L) 기준 14개 높이에서 좌/우 윤곽 반폭 H(t)를 랜드마크로 재고, 각 높이에서 윤곽이 안쪽으로 들어갈 비율 δ(t)를 컨트롤별 곡선으로 합산합니다. 셰이더는 3차 B-spline으로 매끄럽게 복원하고, 가로 방향으로는 `g(u)`(u = |s|/H)로 퍼뜨립니다: 중심선 근처(u < 0.3, 코·입)는 0, 윤곽(u = 1)에서 최대, 윤곽 바깥 0.85H에서 다시 0. 그래서 **실제 얼굴 윤곽 모양을 따라** 들어가고(둥근 턱, 기울어진 얼굴, 측면이라 한쪽이 좁은 얼굴), 배경은 얼굴 바로 옆 띠만 살짝 움직입니다. V-Line은 Jaw + Chin을 따로 더하는 게 아니라 턱끝으로 갈수록 커지는 하나의 테이퍼 곡선(+ 턱끝 살짝 올림)입니다.
2. **세로 밴드 (Proportion: Midface, Face Length, Upper/Lower Face, Chin)** — 얼굴 축을 따라 부드러운 계단(smoothstep)을 쌓습니다. 밴드는 **이목구비 사이의 피부에만** 둡니다: 아래 눈꺼풀 → 코 위(눈 밑), 비하점 → 윗입술(인중), 아랫입술 → 턱끝, 턱 아래(목, 되돌림). 눈·코·입은 평평한 구간에 있어 **통째로 이동**하므로 모양이 그대로입니다. 얼굴 블록 전체(가장 넓은 윤곽 폭)가 함께 움직이고 그 1.7배 안에서 사라져 턱선이 꺾이지 않습니다.
3. **Feature primitive (Eyes, Nose, Lips, 위치 이동)** — 랜드마크로 크기·방향을 정한 타원(위/아래 반경 따로)에 **평평한 코어 + smoothstep 림**. `move`는 코어를 강체 이동, `scale`은 축별 k로 코어를 확대·축소(코어는 1/(1−k)배), `rotate`는 코어를 중심 기준으로 회전(Eye Angle: 눈 전체가 최대 약 5° 기울어 홍채는 둥글게 유지, 림의 전단은 `MAX_ROTATE_SHEAR`로 제한). Nostril Width = 두 콧구멍 사이를 중심으로 한 납작한 타원의 가로 scale(코끝·콧볼 바깥은 거의 그대로), Mouth Corner = 입꼬리만 위/아래 move(입 중심 고정), Philtrum = 인중 밴드와 턱 밴드를 반대로 움직여 입만 오르내리고 턱끝은 제자리. 예: Eye Width = 눈 윤곽에 맞춘 타원의 가로 축 scale(세로 유지, 양쪽 대칭), Eye Size = 눈꺼풀 높이에 맞춘 타원의 등방 scale, Nose Wing = 콧볼 폭 기준 넓은 타원의 가로 축 축소(콧볼이 가장 많이, 코끝은 0만큼 → 콧구멍·주변 피부가 함께 좁아져 콧구멍만 찌그러지지 않음), Lip Width = 입꼬리를 코어 경계에 둔 가로 scale, Mouth Position = 입 전체 move(위 반경은 비하점 앞에서, 아래 반경은 턱 앞에서 끝나 코·턱은 그대로).

적용 순서(정방향): 윤곽 필드 → feature. feature 중심은 필드를 거친 위치로 옮겨 놓습니다(고정점 반복으로 역변환). 같은 수식을 TypeScript(`warpBackward`)로도 갖고 있어 오버레이·테스트에 쓰고, 셰이더와의 일치를 검증했습니다(변위된 2만 샘플에서 최대 1px = 최근접 반올림).

슬라이더는 `x·(0.35 + 0.65|x|)` 곡선이라 낮은 값에서 아주 미세하게 변합니다.

### Natural limit (`services/faceWarp/limits.ts`)

모든 최대치는 얼굴(또는 해당 부위) 크기에 비례합니다: 윤곽은 국소 반폭의 비율(`MAX_FACE_SLIM_RATIO = 0.075`, `MAX_JAW_RATIO = 0.075` …), 눈·코·입은 부위 크기 기준 scale k(`MAX_EYE_SCALE = 0.12`, `MAX_NOSE_WING_RATIO = 0.15` …), 이동은 L 또는 부위 길이의 비율. 합산 뒤에는 안전망이 한 번 더 걸립니다:

- 윤곽 합계 ±14%, scale k −0.22…0.24
- `rimSafeK`: scale primitive의 림에서 실제 감쇠 곡선으로 계산한 국소 확대/압축이 33%를 넘지 않게 k 제한(긴 타원은 전단까지 고려)
- 이동 primitive·세로 밴드: 림/밴드의 국소 늘어남 한도(`MAX_RIM_STRETCH`, `MAX_BAND_STRETCH`). 서로 상쇄하는 밴드 쌍(이마↔머리, 아래 얼굴↔목)은 함께 제한

### 피부 영역

피부 도구는 **얼굴 전체에 효과를 뿌리지 않습니다**. `services/faceWarp/regions.ts`가 랜드마크로 얼굴에 정렬된 타원을 만들고(렌더 픽셀 단위, 미리보기·저장 공용), 셰이더는 워프 후 원본을 샘플링하는 위치에서 영역을 평가하므로 영역이 보정된 이목구비를 그대로 따라갑니다.

| 영역 | 랜드마크 | 처리 |
| --- | --- | --- |
| 보호(protect) | 눈 윤곽(속눈썹·쌍꺼풀선까지), 눈썹, 바깥 입술, 콧구멍 | 매끈하게·잡티 완화·피부결·다크서클·주름·홍조가 여기서 멈춤. 전역 피부 보정을 켜면 모든 얼굴에 생성 |
| 눈 밝게(eye) | 눈 윤곽 | 밝고 채도 낮은 부분(흰자)은 맑고 하얗게, 어두운 부분(홍채)은 국소 대비로 또렷하게 |
| 다크서클(underEye) | 아래 눈꺼풀 아래, 눈 폭 기준(먼 쪽 눈이 짧아 보이는 측면 얼굴은 넓은 눈 기준 높이) | 바로 아래 볼에서 잰 피부톤보다 **어두운 만큼만**, 저주파 색만 들어 올림(모공 유지). 주변보다 훨씬 어두운 선(속눈썹·눈꺼풀선)은 제외, 최대 +0.16 |
| 애교살(aegyo) | 아래 눈꺼풀 바로 아래 얇은 띠 | 띠에 부드러운 하이라이트, 그 아래 아주 옅은 그늘 |
| 치아(mouth) | 안쪽 입술 윤곽(다문 입이면 영역 없음) | 밝고 채도 낮고 붉지 않은 픽셀(치아)만 노란기 제거·살짝 밝게. 입술·잇몸·혀는 그대로 |
| 주름(crease) | 눈가(눈꼬리 바깥), 눈 밑, 이마(눈썹~이마선), 미간, 팔자(콧볼 → 입꼬리) | 주변 톤보다 어두운 가는 선만 주변 톤으로 되돌림(밝은 모공은 유지), 피부색 픽셀만 |
| 홍조(face) | 얼굴 타원 | 피부색 픽셀의 과한 붉은기(Cr)만 따뜻한 피부 쪽으로 줄임, 입술·눈은 보호 |

검증: 실제 사진 5장 × 6개 도구에서 **영역 밖 변화 픽셀 0**(`render:face-retouch`), 실제 랜드마크 15개 얼굴에서 영역 위치 검사(`check:face-warp`: 눈·입·콧구멍 보호, 볼은 보호 안 함, 눈 영역이 홍채를 덮고 눈썹은 안 덮음, 다크서클 영역이 눈 아래 오목한 곳에 있고 눈은 안 덮음, 치아 영역이 코·턱까지 넘지 않음).

### 처리 파이프라인

```
Original → Orientation(EXIF는 불러올 때 반영) / 회전·반전·자르기(native)
        → Face Detection(원본 기준, 캐시)
        → [SkSL 한 패스] 터치 보정 변위 → Face Geometry Warp → 잡티 제거
                         → Skin Retouch(피부색 마스크 × 이목구비 보호) → 얼굴 영역 도구
                         → 선명도·피부결 → 노출/밝기 → 화이트밸런스 → 톤 → 색 → Filter(스플릿 톤)
                         → Effects(광채·페이드·비네팅·그레인)
        → 날짜 스탬프 → JPEG → EXIF → Export
```

워프가 맨 앞에 있어 피부·색·필터가 **이미 보정된 얼굴**을 보고 처리됩니다(예: 피부 보정 마스크가 옮겨진 윤곽을 따라감). 비네팅·그레인은 워프되지 않은 화면 좌표를 써서 얼굴 주변 그레인이 늘어나 보이지 않습니다. 기하(회전·자르기)는 셰이더 이전에 네이티브로 처리하고, 랜드마크는 그 기하로 변환해 씁니다.

### 미리보기 성능 · 저장

- 슬라이더를 움직이면 JS는 랜드마크 수십 개로 계획만 다시 만들고(30개 컨트롤 전부 켠 상태 0.04ms), 픽셀 작업은 전부 GPU 셰이더 유니폼 변경입니다. 이미지 데이터 복사·CPU 리렌더 없음. 미리보기는 화면 크기(최대 1600px 작업 이미지) 캔버스.
- 저장(`exportImage.renderEdit`)은 화면 캡처가 아니라 **원본 고해상도**(최대 4096px)에 같은 랜드마크 → 같은 계획 → 같은 셰이더를 다시 적용합니다. 모든 수치가 렌더 크기 비례라 미리보기와 같은 모양입니다(E2E에서 비교).
- EXIF 회전은 불러올 때 이미 반영되고(`normalizeImage`, Vision도 orientation을 적용), 전면 카메라 거울 모드는 원본 자체에 반영된 상태에서 검출하므로 저장본과 일치합니다.

### 상태 · Undo/Redo · Before/After

- `EditState.faces: Record<faceId, FaceRetouch>` — 얼굴별 값(보정한 얼굴만, 좌/우 눈 추가값 포함). 기존 editor history에 그대로 포함됩니다.
- `EditState.faceAnchors: Record<faceId, {x, y, size}>` — 얼굴을 처음 보정할 때의 위치(원본 기준). 다시 검출할 때(앱 재시작 후 복원, 검출기 버전 변경) 얼굴을 위치로 다시 짝지어 값이 다른 사람에게 넘어가지 않게 합니다(`faceIdentity.assignFaceIds`: 가까운 쌍부터, 크기 2배 이내, 못 찾은 얼굴의 ID는 비워 둠).
- 구버전 프로젝트(Phase 2 이전에 저장)는 새 컨트롤이 0으로 채워져 복원됩니다.
- 슬라이더 드래그 중에는 `present`만 바뀌고, 손을 뗄 때 `commit()` 한 번 → 한 단계(예: Nose Wing 20 → 35 → Eye Width 10이 각각 한 단계). Reset도 한 단계라 Undo로 되돌릴 수 있습니다.
- 사진을 길게 누르거나 `After` 버튼을 누르는 동안 원본(Before).

### 여러 얼굴 · 인식 실패

- 얼굴은 큰 순서로 `face-0, face-1 …`(보정한 얼굴은 anchor로 유지). 처음엔 가장 큰 얼굴이 선택되고, 2명 이상이면 Retouch 탭에서 얼굴마다 아주 얇은 윤곽선(선택된 얼굴만 조금 더 밝게)이 나타나 눌러서 고릅니다. 값은 얼굴별로 따로 저장되고 셰이더는 최대 3명의 윤곽 필드 + 32개 primitive + 피부 영역 64개를 동시에 적용합니다(검증: 한 얼굴만 보정하면 다른 얼굴 주변 변화 픽셀 0).
- 얼굴이 없거나(너무 작음: 짧은 변의 3.5% 미만, 가려짐, 너무 어두움) 검출이 실패하면 “얼굴을 인식할 수 없어요”를 표시하고 슬라이더를 비활성화합니다. 랜드마크가 비정상(NaN·붕괴)이면 매핑 단계에서 버려 크래시 없이 무시됩니다.

### Debug Mode (개발 빌드만)

Retouch의 얼굴 카테고리 하단 🐞 버튼(`__DEV__`에서만 렌더링)을 누르면 랜드마크를 점으로 표시합니다: 윤곽(노랑) · 눈(하늘) · 눈썹(주황) · 코(초록) · 입술(분홍) · dense mesh(흰색, MediaPipe). 피부 영역도 타원으로 함께 그립니다: 보호(흰색) · 눈(하늘) · 다크서클(노랑) · 애교살(주황) · 치아(보라) · 주름(초록) · 홍조(빨강). 점은 워프를 따라 움직여 After 화면에서도 보정된 부위 위에 있어야 정상입니다. 프로덕션 번들에서는 버튼과 레이어 모두 제거됩니다.

### 검증 결과

macOS에서 같은 Swift 검출 코드(Apple Vision)로 테스트 사진의 랜드마크를 뽑고, CanvasKit(Skia)으로 **실제 Lumi SkSL 셰이더**를 렌더링해 확인했습니다. 웹은 실제 앱을 헤드리스 Chromium으로 조작(E2E)했습니다.

수치 검사는 `npm run check:face-warp`로 다시 돌릴 수 있습니다(`scripts/face-warp/`, 약 40초). 테스트 사진(`photos.json`, Wikimedia Commons의 CC0/CC BY 사진)을 `.face-warp-cache/`에 받고(커밋하지 않음), 앱의 `FaceLandmarkDetector.swift`를 그대로 CLI로 빌드해 랜드마크를 뽑은 뒤, 모든 얼굴 × 컨트롤 × ±100에서 접힘·피부 늘어남·배경 이동·이목구비 왜곡·슬라이더 0 항등을 확인하고, Lumi 셰이더를 CanvasKit으로 컴파일해 셰이더와 TS 미러의 샘플 위치가 일치하는지 봅니다. 기준을 넘으면 실패(exit 1)합니다. `limits.ts`나 `transforms.ts`를 바꾼 뒤 돌려 보세요. macOS의 `swiftc`와 Bun이 필요합니다.

| 사진 | 검출 | Slim · Jaw · Nose Wing · Eye Width · Lip Width · Midface |
| --- | --- | --- |
| 정면 (히잡) | ✓ | 자연스러움, 배경 이동 0px |
| 약간 옆(3/4) + 머리카락 가림 + 웃는 얼굴 | ✓ | 얼굴 축을 따라 적용, 가려진 쪽 윤곽은 추정 |
| 기울어진 얼굴 + 안경 + 웃는 얼굴 | ✓ | 축 따라 적용, 안경테가 눈 근처에서 함께 약간 휨 |
| 정면 + 안경 + 수염 (흑백, 큰 얼굴) | ✓ | ✓ |
| 긴 머리(바람에 날림), 긴 머리 + 모자 | ✓ | ✓ |
| 고해상도 2048px / 저해상도 320px | ✓ / ✓ | 같은 모양(얼굴 비례) |
| 밝기 18%로 어둡게 | ✓ | ✓ |
| 3인 단체 사진 | 3명 | 얼굴별 독립 |
| 고양이, 완전 측면 | 없음 | “얼굴을 인식할 수 없어요” |

- 14장(17개 얼굴) × 모든 컨트롤(좌/우 눈 개별값 포함) × ±100 = 1196 케이스 (수치는 TS 미러로 측정)
- 접힘 없음: 야코비안 행렬식 최소 0.74 (> 0)
- 국소 왜곡(피부가 늘어나거나 눌리는 정도): 최대 34% (대부분 30% 이하, 슬라이더 100 기준)
- Midface/Face Length/Lower Face/Mouth/Nose Position/Philtrum ±100에서 입·눈 내부 왜곡 0%, 코끝은 170 케이스 중 162개 0%, 최대 5.7%(위를 올려다보는 얼굴)
- 얼굴 박스(가로 3배·세로 2.9배) 바깥 배경 변위 0px
- 회전 90°/270°+상하 반전: 워프 후 변환 = 변환 후 워프 (픽셀 차이 0), 자르기+좌우 반전: 평균 0.04 (경계 반올림)
- 셰이더 ↔ TS 미러 샘플 위치 최대 1px(눈 각도 회전·콧구멍·입꼬리 포함)
- 웹 E2E(Phase 2, 실제 앱 + MediaPipe, 22/22): 얼굴 인식 → 매끈하게 → 다크서클(눈으로 자동 확대, 변화가 눈 아래 띠에만: 1090px in 189×33) → 갸름하게 → 왼쪽 눈 크기(한쪽 눈만: 99×82 영역, 양쪽 값은 0 유지) → 콧볼 → 인중 → 중안부 → Before/After → Undo/Redo → ‘원래 크기’ 후 다른 도구를 골라도 확대 안 함 → 저장(원본 해상도 1280×741, 미리보기와 채널 평균 차 0.17/255, 얼굴 부분이 원본과 평균 10/255 차이) → 새로고침 → 이어서 편집(픽셀 차 0) → `잡티 제거 (탭)` → 터치 도구 잡티 모드, 콘솔 오류 0

### 알려진 한계

- **Expo Go 미지원**(얼굴 탭만 비활성). **Android 검출기 없음**(ML Kit 백엔드 추가 필요).
- Vision에는 이마 점이 없어 iOS의 Forehead/Upper Face는 추정 이마선을 씁니다(웹은 실제 메시).
- 순수 워프라 얼굴과 붙어 있는 머리카락·안경테·배경도 윤곽 근처에서 함께 조금 움직입니다(얼굴/배경 segmentation이 있으면 추가로 줄일 수 있음). 그 폭은 윤곽 반폭의 0.85배 띠로 제한됩니다.
- 옆모습에 가까울수록(가려진 쪽 윤곽을 검출기가 추정) 가려진 쪽 보정의 정확도가 떨어집니다. 완전 측면은 검출되지 않습니다.
- 동시에 워프하는 얼굴은 최대 3명(셰이더 배열 크기), feature primitive 32개, 피부 영역 64개(한 얼굴에 모든 피부 도구를 켜면 23개라 3명 모두 전부 켜면 마지막 얼굴의 일부 도구가 빠짐, 보호 영역은 항상 먼저).
- 피부 영역은 랜드마크 타원이라 픽셀 단위 segmentation보다 경계가 거칩니다(그래서 넓게 페더링). 머리카락은 랜드마크로 분리하지 않고 색 마스크로만 거릅니다.
- 다크서클은 바로 아래 볼보다 어두운 경우에만, 치아 미백은 입이 열려 치아가 보일 때만 효과가 있습니다(안경 사진의 다크서클 변화 1px, 다문 입 0px — 의도한 동작).
- **실기기 성능 미측정**: 슬라이더 조작 시 JS는 계획(랜드마크 수십 개)만 다시 만들고 픽셀은 GPU 셰이더가 처리하지만, iPhone에서 30fps를 실제로 측정하지는 않았습니다. 피부 영역 도구는 영역 안 픽셀에서만 추가 샘플(최대 16회)을 읽습니다.

## Web 지원 범위

배포: `vercel.json`이 `expo export -p web` 결과(`dist/`)를 SPA로 서빙합니다(모든 경로 → `/`). 이 파일이 없으면 Vercel이 저장소를 빌드 없이 그대로 올려, `/`에서 `index.ts`가 `video/mp2t`로 내려가 다운로드됩니다.

`npm run web`으로 UI와 필터/편집 흐름을 확인할 수 있습니다. Skia는 CanvasKit(WASM)으로 동작합니다.

- 카메라: 브라우저 getUserMedia. 플래시·셔터음은 지원되지 않습니다.
- 앨범: 사진 보관함 API가 없어 파일 선택기로 대체합니다. 저장하면 JPEG 파일을 다운로드합니다.
- 오프스크린 렌더는 CPU raster surface를 씁니다. 브라우저의 WebGL 컨텍스트 개수 제한 때문입니다. 대용량 저장은 네이티브보다 느립니다.
- 위치·햅틱은 동작하지 않습니다.
- **얼굴 보정(웹)**: MediaPipe Face Landmarker(478점 메시)로 검출합니다. 워프 엔진·셰이더는 iOS와 같습니다.
  - MediaPipe JS·WASM은 postinstall(`scripts/setup-mediapipe.js`)이 `public/mediapipe/`에 복사합니다. 번들 안의 동적 `import(url)`을 Metro가 변환하지 못해, Metro를 거치지 않고 브라우저가 직접 import합니다. 모델(`face_landmarker.task`, 약 3.6MB)은 처음 쓸 때 Google 모델 저장소에서 받습니다.
  - 이미지 입력에 WebGL이 필요합니다. WebGL이 없는 브라우저에서는 ‘얼굴 인식을 불러오지 못했어요’가 표시됩니다(헤드리스 Chromium은 `--use-angle=swiftshader`로 동작).
- `index.web.ts`는 CanvasKit을 먼저 로드하고, React 19 개발 모드 성능 트랙이 WASM 힙을 순회하며 멈추는 문제를 막기 위해 힙 뷰를 non-enumerable로 바꿉니다.

## 향후 개선

- 얼굴·피부 segmentation 마스크(배경/머리카락 분리로 윤곽 보정 시 배경 휨 추가 억제)
- Android 얼굴 랜드마크 백엔드(ML Kit Face Mesh) — `FaceDetectorBackend`만 구현하면 엔진·UI는 그대로
- 픽셀 단위 피부·머리카락 segmentation 마스크(예: Vision `VNGeneratePersonSegmentationRequest`)로 피부 영역 경계 정밀화
- 앨범 다중 선택 후 일괄 편집, 프리셋 복사·붙여넣기
- 크롭 화면 핀치 줌, 자유 각도 회전(수평 맞추기)
- VIDEO 모드, Live Photo
- 3D LUT(.cube) 가져오기, 레시피 공유(내보내기/가져오기)
- HEIC 저장, Display P3 컬러 유지
- 다크 모드 테마

## 라이선스 고지

`assets/fonts/DSEG7Classic-Bold.ttf`: DSEG © keshikan, SIL Open Font License 1.1 (`assets/fonts/DSEG-LICENSE.txt`).

[Bun]: https://bun.sh
