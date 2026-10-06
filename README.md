# Lumi — Capture · Edit · Keep

Lumi는 촬영하면서 감성 필터를 고르고, 찍은 사진이나 앨범 사진을 같은 필터와 세부 보정으로 다듬는 카메라 + 사진 편집 앱입니다.
VSCO보다 쉽고 기본 카메라보다 감성적인, warm · soft · film 톤의 첫 번째 MVP입니다.

## 주요 기능

| 영역 | 기능 |
| --- | --- |
| 카메라 | 실시간 프리뷰, 촬영, 전/후면 전환, 플래시(Auto/On/Off), 타이머(3·5·10초 카운트다운), 3×3 격자, 촬영 비율(Full/1:1/4:3/16:9), 피부 보정 강도, 필터 캐러셀(카테고리·즐겨찾기 탭), 셔터 블링크 + 햅틱 |
| 필터 | 20종(Original, Warm 5, Cool 3, Film 5, Soft 3, B&W 3), 카테고리별 보기, 상세 화면, 즐겨찾기(AsyncStorage 저장) |
| 앨범 | 최근 사진 그리드(페이지네이션), 제한된 접근(iOS limited) 안내 및 추가 선택, 권한 없이도 시스템 사진 선택기로 편집 가능 |
| 편집 | 필터 + 강도, 조정 12종, 보정(리터치) 5종 + 얼굴 형태 2종(눈 크게·얼굴 갸름, 웹), 터치 보정(밀기: 브러시 크기·강도 선택 후 드래그 / 잡티 제거: 크기 선택 후 탭), 효과 3종 + 날짜 스탬프, 자르기(Free/Original/1:1/4:3/3:4/16:9/9:16, 드래그·코너 리사이즈), 90° 회전, 좌우/상하 반전, Before/After(길게 누르기 또는 버튼), Undo/Redo(최대 40단계), 개별/전체 초기화 |
| 저장 | 전체 해상도로 오프스크린 렌더링 → JPEG(고화질 95% / 표준 85%) → EXIF(촬영 시각, 선택 시 GPS) → 사진 보관함 ‘Lumi’ 앨범. 원본 함께 저장 시 ‘Lumi Originals’에 별도 저장 |
| 설정 | 무음 모드, 격자, 타이머, 거울 모드, 위치 정보 저장, 촬영 날짜 표시 + 형식 4종, 원본 함께 저장, 고화질 저장, 기본 필터·강도·촬영 비율 (Zustand + AsyncStorage) |

## 기술 스택

- Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript (strict)
- Expo Router (파일 기반 라우팅, typed routes)
- Zustand + AsyncStorage persist
- expo-camera, expo-image-picker, expo-media-library(Next API), expo-image-manipulator, expo-file-system, expo-location, expo-haptics, expo-image
- @shopify/react-native-skia (SkSL 런타임 셰이더) — 필터·보정·날짜 스탬프 렌더링
- react-native-reanimated 4 + react-native-worklets, react-native-gesture-handler
- piexifjs (순수 JS EXIF 쓰기)

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
                            exportImage(최종 렌더·인코딩), mediaLibrary(.web), exif, location, feedback
  stores/                   cameraStore, editorStore, filterStore, settingsStore, toastStore
  hooks/                    useCapture, useSaveEdit, useWorkingImage, usePreviewImage,
                            useFilterThumbnail, useOpenInEditor
  types/, utils/
assets/fonts/               DSEG7 Classic (날짜 스탬프용 7-segment 폰트, SIL OFL 1.1)
```

## 설치 & 실행

```bash
cd lumi-camera
npm install          # postinstall이 웹용 canvaskit.wasm을 public/에 복사합니다
npx expo start       # QR 코드를 iPhone 카메라로 스캔 → Expo Go에서 열기
```

| 명령 | 설명 |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npx expo-doctor` | 의존성·설정 진단 |
| `npm run web` | 웹에서 UI 확인 |

### iPhone 실기기: Expo Go로 충분합니다

사용한 네이티브 모듈(Skia, Reanimated, Gesture Handler, Camera, Media Library, Image Manipulator, File System, Location, Haptics, Image)은 모두 Expo Go SDK 57에 포함되어 있어 **Development Build 없이 Expo Go(SDK 57)로 전체 기능을 실행**할 수 있습니다.
App Store 앱 이름·아이콘·권한 문구(Info.plist)를 실제 Lumi 것으로 보려면 Development Build가 필요합니다. Expo Go에서는 권한 팝업에 Expo Go의 문구가 표시됩니다.

```bash
npx eas-cli@latest build --profile development --platform ios   # 또는 npx expo run:ios (Xcode 필요)
```

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
3. **색/질감** (`shaders/lumiShader.ts`): 하나의 SkSL 셰이더에서 터치 보정 변위 → 얼굴 워프 → 리터치 → 선명도/정의 → 노출/밝기 → 화이트밸런스(색온도·색조·따뜻함) → 하이라이트/그림자 → 대비 → 채도/생동감 → 스플릿 톤 → 광채 → 페이드 → 비네팅 → 그레인 순으로 처리.
   반경은 이미지 짧은 변의 1/1000 단위라 화면 프리뷰와 저장본이 같은 결과를 냅니다.
4. **내보내기** (`services/exportImage.tsx`): 오프스크린 렌더 + 날짜 스탬프 → JPEG → EXIF → 저장.

성능: 슬라이더를 움직이면 편집 캔버스(uniform)만 다시 그려지고 이미지 데이터는 복제되지 않습니다. 필터 썸네일은 한 번만 오프스크린 렌더링해 캐시하고 이미지로 표시합니다. Zustand selector로 필요한 상태만 구독합니다.

## 기술적 제약과 선택한 대안

- **카메라 실시간 필터**: expo-camera는 프레임을 JS/Skia로 넘기지 않습니다. 프리뷰에서는 필터별 `preview` 레이어를 RN `mixBlendMode`(soft-light, saturation 등)로 겹쳐 분위기를 근사하고, **촬영된 사진에는 Skia 파이프라인 전체가 정확히 적용**됩니다. 프레임 단위 실시간 필터가 필요하면 react-native-vision-camera + Skia Frame Processor(Development Build 필요)로 확장할 수 있습니다.
- **무음 모드**: iOS 셔터음은 기기·지역 정책(예: 한국·일본)상 강제되는 경우가 있습니다. expo-camera의 `shutterSound: false`는 iOS에서 시스템 사운드를 dispose하는 우회 방식이라 **사용하지 않습니다**. 무음 모드는 Lumi 자체 효과음만 끄며(`services/feedback.ts`), 시스템 셔터음은 OS 정책을 따릅니다.
- **피부 보정**: 얼굴/피부 segmentation 대신 **YCbCr 피부색 범위 마스크 + 엣지 보존(bilateral) 평균**을 사용합니다. 피부색 영역만 부드럽게 하고 눈·머리카락·윤곽은 유지합니다. 2차로 Vision/ML Kit 기반 segmentation 마스크를 셰이더의 `skinMask` 대신 넣을 수 있게 분리되어 있습니다.
- **비율 촬영**: iOS 센서는 4:3이므로 1:1·16:9는 촬영 후 중앙 크롭하고, 프리뷰는 잘릴 영역을 어둡게 표시합니다.
- **EXIF**: Skia 인코더는 메타데이터를 쓰지 않아 piexifjs로 촬영 시각과 (선택 시) GPS를 다시 기록합니다.
- **Skia `ImageShader` 샘플링**: Skia 2.6의 `<ImageShader>`는 cubic이 아닌 sampling 옵션을 `makeShaderCubic`로 잘못 넘깁니다. 그래서 Mitchell cubic 샘플링을 명시적으로 사용합니다.

## 터치 보정

`터치` 탭에서 브러시 크기와 강도를 고르고 사진을 드래그하면 브러시 안쪽이 밀립니다(liquify의 push). 플랫폼 제약이 없어 네이티브에서도 동작합니다.

- 보정 앱처럼 조금씩 다듬도록 만들었습니다. 내용은 손가락 이동의 4~30%만 따라옵니다(강도, 기본 약 13%). 한 획이 밀 수 있는 거리는 브러시 반경의 22%까지이고, 이 상한에 가까워질수록 점점 덜 밀립니다. 감쇠는 3차 곡선 `(1 − t²)³`이라 브러시 가장자리 주변이 덜 일그러집니다.

- 획은 **원본 사진 좌표**로 저장됩니다(`EditState.reshape`). 회전·반전·자르기를 나중에 해도 같은 위치에 남고, Undo는 획 단위입니다.
- 획은 화면에 보이는 프레임 위의 변위 필드(긴 변 320칸 격자, `services/reshape.ts`)로 재생됩니다. 작은 단계로 나눠 `d'(p) = d(p − m·w) − m·w`로 누적해 접히지 않습니다. 드래그 중에는 새 구간만 더합니다(`hooks/useReshapeField.ts`).
- 필드는 축마다 16비트(R = 상위 바이트, G = 하위 바이트) RGBA8 텍스처 2장으로 셰이더에 들어갑니다. 해상도와 무관해서 미리보기와 저장본이 같은 결과를 냅니다. B-spline으로 샘플링해 바이트 쌍이 오버슈트하지 않습니다.

### 잡티 제거

`터치` 탭에서 `잡티 제거`를 고르고 잡티를 탭하면 그 자리를 주변 피부로 채웁니다(탭 1회 = Undo 1단계, 사진당 최대 48개). 위치는 원본 좌표로 저장됩니다.

셰이더(`heal`)가 주파수를 분리해 채웁니다. 톤은 잡티 바로 바깥 링 12곳의 살짝 흐린 피부를 픽셀에 가까운 쪽 위주로 섞어 만듭니다(역거리 가중). 결은 옆 피부의 고주파를 그대로 입혀 모공이 남게 합니다. 가장자리는 부드럽게 섞습니다.

## Web 지원 범위

`npm run web`으로 UI와 필터/편집 흐름을 확인할 수 있습니다. Skia는 CanvasKit(WASM)으로 동작합니다.

- 카메라: 브라우저 getUserMedia. 플래시·셔터음은 지원되지 않습니다.
- 앨범: 사진 보관함 API가 없어 파일 선택기로 대체합니다. 저장하면 JPEG 파일을 다운로드합니다.
- 오프스크린 렌더는 CPU raster surface를 씁니다. 브라우저의 WebGL 컨텍스트 개수 제한 때문입니다. 대용량 저장은 네이티브보다 느립니다.
- 위치·햅틱은 동작하지 않습니다.
- **눈 크게 / 얼굴 갸름(웹 전용)**: MediaPipe Face Landmarker로 얼굴 랜드마크를 찾고, 셰이더 맨 앞에서 샘플링 좌표를 옮깁니다. 눈은 원형 bulge를 씁니다. 얼굴 갸름은 눈 사이 → 턱 축을 기준으로 한 얼굴 좌표에서 아래 얼굴을 중심선 쪽으로 매끄럽게 좁힙니다. 광대 아래부터 시작해 턱선에서 가장 강하고, 턱 아래와 얼굴 바깥에서는 사라집니다. 코·입은 거의 그대로 두고, 접히지 않는(단조) 범위 안에서만 좁힙니다. 사진에서 가장 크게 나온 얼굴 하나에만 적용됩니다.
  - MediaPipe JS·WASM은 postinstall(`scripts/setup-mediapipe.js`)이 `public/mediapipe/`에 복사합니다. 번들 안의 동적 `import(url)`을 Metro가 변환하지 못해, Metro를 거치지 않고 브라우저가 직접 import합니다. 모델(`face_landmarker.task`, 약 3.6MB)은 처음 쓸 때 Google 모델 저장소에서 받습니다.
  - 이미지 입력에 WebGL이 필요합니다. 일반 브라우저에는 있지만 WebGL이 없는 헤드리스 브라우저에서는 ‘얼굴 인식을 불러오지 못했어요’가 표시됩니다.
  - 네이티브는 랜드마크 검출을 연결하지 않아 두 슬라이더를 숨깁니다(`services/faceLandmarks.ts`). Vision / ML Kit(Development Build)으로 `FaceGeometry`만 채우면 셰이더는 그대로 씁니다.
- `index.web.ts`는 CanvasKit을 먼저 로드하고, React 19 개발 모드 성능 트랙이 WASM 힙을 순회하며 멈추는 문제를 막기 위해 힙 뷰를 non-enumerable로 바꿉니다.

## 향후 개선

- vision-camera + Skia Frame Processor 기반의 프레임 단위 실시간 필터 (Development Build)
- 얼굴·피부 segmentation 마스크, 네이티브 얼굴 랜드마크(눈 크게·얼굴 갸름) (Vision / ML Kit)
- 앨범 다중 선택 후 일괄 편집, 프리셋 복사·붙여넣기
- 크롭 화면 핀치 줌, 자유 각도 회전(수평 맞추기)
- VIDEO 모드, Live Photo
- 사용자 정의 필터 저장, 3D LUT(.cube) 가져오기
- HEIC 저장, Display P3 컬러 유지
- 다크 모드 테마

## 라이선스 고지

`assets/fonts/DSEG7Classic-Bold.ttf`: DSEG © keshikan, SIL Open Font License 1.1 (`assets/fonts/DSEG-LICENSE.txt`).
