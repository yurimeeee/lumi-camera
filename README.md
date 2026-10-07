# Lumi — Capture · Edit · Keep

Lumi는 촬영하면서 감성 필터를 고르고, 찍은 사진이나 앨범 사진을 같은 필터와 세부 보정으로 다듬는 카메라 + 사진 편집 앱입니다.
VSCO보다 쉽고 기본 카메라보다 감성적인, warm · soft · film 톤의 첫 번째 MVP입니다.

## 주요 기능

| 영역 | 기능 |
| --- | --- |
| 카메라 | 실시간 프리뷰, 촬영, 전/후면 전환, 플래시(Auto/On/Off), 타이머(3·5·10초 카운트다운), 3×3 격자, 촬영 비율(Full/1:1/4:3/16:9), 피부 보정 강도, 필터 캐러셀(카테고리·즐겨찾기 탭), 셔터 블링크 + 햅틱 |
| 필터 | 20종(Original, Warm 5, Cool 3, Film 5, Soft 3, B&W 3), 카테고리별 보기, 상세 화면, 즐겨찾기(AsyncStorage 저장) |
| 앨범 | 최근 사진 그리드(페이지네이션), 제한된 접근(iOS limited) 안내 및 추가 선택, 권한 없이도 시스템 사진 선택기로 편집 가능 |
| 편집 | 필터 + 강도, 조정 12종, 보정(Retouch: Skin 5종 + 얼굴 랜드마크 기반 Face 7 · Eyes 6 · Nose 6 · Lips 6 · Proportion 7, [얼굴 보정](#얼굴-보정-retouch) 참고), 터치 보정(밀기: 브러시 크기·강도 선택 후 드래그 / 복원: 문질러 되돌리기 / 잡티 제거: 크기 선택 후 탭), 효과 3종 + 날짜 스탬프, 자르기(Free/Original/1:1/4:3/3:4/16:9/9:16, 드래그·코너 리사이즈), 90° 회전, 좌우/상하 반전, Before/After(길게 누르기 또는 버튼), Undo/Redo(최대 40단계), 개별/전체 초기화, 핀치 확대·축소(최대 6배, 더블탭·‘원래 크기’로 복귀, 웹은 트랙패드 핀치·Ctrl/⌘+휠) |
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
                            backend(.web)(Vision / MediaPipe), visionMapping, mediapipeMapping, landmarkMath
    faceWarp/               FaceWarpEngine(계획·유니폼·셰이더 미러), mesh(얼굴 모델·윤곽 프로파일),
                            transforms(슬라이더 → 변형), limits(자연스러운 최대치), shader(SkSL)
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
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npx expo-doctor` | 의존성·설정 진단 |
| `npm run web` | 웹에서 UI 확인 (얼굴 보정 포함, MediaPipe) |
| `npm run ios` | `expo run:ios` — 로컬 Development Build (Xcode 16.1 이상) |

### iPhone: 얼굴 보정은 Development Build가 필요합니다

**왜 필요한가**: 얼굴 보정은 사진 속 얼굴의 랜드마크(윤곽·눈·코·입 좌표)가 있어야 동작합니다. iOS에서는 Apple Vision 프레임워크로 검출하는데, 이 코드는 Lumi 전용 네이티브 모듈(`modules/lumi-face-landmarks`, Swift)이라 Expo Go 안에는 들어 있지 않습니다. Expo Go는 미리 포함된 네이티브 모듈만 실행할 수 있습니다.

**추가된 네이티브 의존성**

| 항목 | 내용 |
| --- | --- |
| `modules/lumi-face-landmarks` | 로컬 Expo 모듈(autolinking, `expo-module.config.json`). `detect(uri)` → 얼굴별 랜드마크 영역. iOS 16.4+ |
| Vision.framework, ImageIO.framework | iOS 시스템 프레임워크 — 외부 라이브러리·모델 파일·네트워크 없음, 기기 안에서 처리 |
| `expo-dev-client` | Development Build 런처 |

Expo Go에서도 앱은 그대로 실행되고(카메라·필터·조정·Skin 보정·터치 보정·자르기 모두 동작), Retouch의 Face/Eyes/Nose/Lips/Proportion 탭만 “Development Build에서 쓸 수 있어요” 안내와 함께 비활성화됩니다. 모듈은 `requireOptionalNativeModule`로 불러와 없을 때 null이 되므로 크래시하지 않습니다.

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

## 기술적 제약과 선택한 대안

- **카메라 실시간 필터**: expo-camera는 프레임을 JS/Skia로 넘기지 않습니다. 프리뷰에서는 필터별 `preview` 레이어를 RN `mixBlendMode`(soft-light, saturation 등)로 겹쳐 분위기를 근사하고, **촬영된 사진에는 Skia 파이프라인 전체가 정확히 적용**됩니다. 프레임 단위 실시간 필터가 필요하면 react-native-vision-camera + Skia Frame Processor(Development Build 필요)로 확장할 수 있습니다.
- **무음 모드**: iOS 셔터음은 기기·지역 정책(예: 한국·일본)상 강제되는 경우가 있습니다. expo-camera의 `shutterSound: false`는 iOS에서 시스템 사운드를 dispose하는 우회 방식이라 **사용하지 않습니다**. 무음 모드는 Lumi 자체 효과음만 끄며(`services/feedback.ts`), 시스템 셔터음은 OS 정책을 따릅니다.
- **피부 보정**: 얼굴/피부 segmentation 대신 **YCbCr 피부색 범위 마스크 + 엣지 보존(bilateral) 평균**을 사용합니다. 피부색 영역만 부드럽게 하고 눈·머리카락·윤곽은 유지합니다. 2차로 Vision/ML Kit 기반 segmentation 마스크를 셰이더의 `skinMask` 대신 넣을 수 있게 분리되어 있습니다.
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

편집 화면 `보정` 탭: **Skin · Face · Eyes · Nose · Lips · Proportion**. 카테고리를 고르면 아이콘·이름·값이 있는 가로 목록이 나오고, 하나를 고르면 위쪽 슬라이더로 조절합니다. 각 카테고리마다 `Reset Face/Eyes/Nose/Lips/Proportion`, 전체는 `Reset All`.

| 카테고리 | 컨트롤 (범위) |
| --- | --- |
| Skin | Soften, Smooth, Tone(±), Glow, Detail — 피부색 마스크 기반(기존 기능, 얼굴 인식 불필요) |
| Face | Slim, Width(±), Jaw, Chin(±), V-Line, Cheek, Forehead(±) |
| Eyes | Eye Size(±), Eye Width(±, 눈 가로 길이), Eye Height(±), Eye Distance(±), Eye Position(±), Outer Corner(±, 눈꼬리) |
| Nose | Slim Nose, Nose Width(±), Nose Tip(±), Nose Size(±), Nose Length(±), Nose Wing(콧볼) |
| Lips | Lip Size(±), Lip Width(±), Upper Lip(±), Lower Lip(±), Mouth Position(±, + = 위로), Smile |
| Proportion | Midface(±, 중안부), Face Length(±), Upper Face(±, 이마 높이), Lower Face(±, 하안부), Eye/Nose/Mouth Position(±) |

0 … 100 컨트롤은 0이 원본, ± 컨트롤은 가운데(0)가 원본입니다. 슬라이더 0에서는 워프 계획 자체가 만들어지지 않아 **원본과 비트 단위로 같습니다**(검증: 픽셀 차이 0).

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
3. **Feature primitive (Eyes, Nose, Lips, 위치 이동)** — 랜드마크로 크기·방향을 정한 타원(위/아래 반경 따로)에 **평평한 코어 + smoothstep 림**. `move`는 코어를 강체 이동, `scale`은 축별 k로 코어를 확대·축소(코어는 1/(1−k)배). 예: Eye Width = 눈 윤곽에 맞춘 타원의 가로 축 scale(세로 유지, 양쪽 대칭), Eye Size = 눈꺼풀 높이에 맞춘 타원의 등방 scale, Nose Wing = 콧볼 폭 기준 넓은 타원의 가로 축 축소(콧볼이 가장 많이, 코끝은 0만큼 → 콧구멍·주변 피부가 함께 좁아져 콧구멍만 찌그러지지 않음), Lip Width = 입꼬리를 코어 경계에 둔 가로 scale, Mouth Position = 입 전체 move(위 반경은 비하점 앞에서, 아래 반경은 턱 앞에서 끝나 코·턱은 그대로).

적용 순서(정방향): 윤곽 필드 → feature. feature 중심은 필드를 거친 위치로 옮겨 놓습니다(고정점 반복으로 역변환). 같은 수식을 TypeScript(`warpBackward`)로도 갖고 있어 오버레이·테스트에 쓰고, 셰이더와의 일치를 검증했습니다(변위된 2만 샘플에서 최대 1px = 최근접 반올림).

슬라이더는 `x·(0.35 + 0.65|x|)` 곡선이라 낮은 값에서 아주 미세하게 변합니다.

### Natural limit (`services/faceWarp/limits.ts`)

모든 최대치는 얼굴(또는 해당 부위) 크기에 비례합니다: 윤곽은 국소 반폭의 비율(`MAX_FACE_SLIM_RATIO = 0.075`, `MAX_JAW_RATIO = 0.075` …), 눈·코·입은 부위 크기 기준 scale k(`MAX_EYE_SCALE = 0.12`, `MAX_NOSE_WING_RATIO = 0.15` …), 이동은 L 또는 부위 길이의 비율. 합산 뒤에는 안전망이 한 번 더 걸립니다:

- 윤곽 합계 ±14%, scale k −0.22…0.24
- `rimSafeK`: scale primitive의 림에서 실제 감쇠 곡선으로 계산한 국소 확대/압축이 33%를 넘지 않게 k 제한(긴 타원은 전단까지 고려)
- 이동 primitive·세로 밴드: 림/밴드의 국소 늘어남 한도(`MAX_RIM_STRETCH`, `MAX_BAND_STRETCH`). 서로 상쇄하는 밴드 쌍(이마↔머리, 아래 얼굴↔목)은 함께 제한

### 처리 파이프라인

```
Original → Orientation(EXIF는 불러올 때 반영) / 회전·반전·자르기(native)
        → Face Detection(원본 기준, 캐시)
        → [SkSL 한 패스] 터치 보정 변위 → Face Geometry Warp → 잡티 제거 → Skin Retouch
                         → 선명도 → 노출/밝기 → 화이트밸런스 → 톤 → 색 → Filter(스플릿 톤)
                         → Effects(광채·페이드·비네팅·그레인)
        → 날짜 스탬프 → JPEG → EXIF → Export
```

워프가 맨 앞에 있어 피부·색·필터가 **이미 보정된 얼굴**을 보고 처리됩니다(예: 피부 보정 마스크가 옮겨진 윤곽을 따라감). 비네팅·그레인은 워프되지 않은 화면 좌표를 써서 얼굴 주변 그레인이 늘어나 보이지 않습니다. 기하(회전·자르기)는 셰이더 이전에 네이티브로 처리하고, 랜드마크는 그 기하로 변환해 씁니다.

### 미리보기 성능 · 저장

- 슬라이더를 움직이면 JS는 랜드마크 수십 개로 계획만 다시 만들고(30개 컨트롤 전부 켠 상태 0.04ms), 픽셀 작업은 전부 GPU 셰이더 유니폼 변경입니다. 이미지 데이터 복사·CPU 리렌더 없음. 미리보기는 화면 크기(최대 1600px 작업 이미지) 캔버스.
- 저장(`exportImage.renderEdit`)은 화면 캡처가 아니라 **원본 고해상도**(최대 4096px)에 같은 랜드마크 → 같은 계획 → 같은 셰이더를 다시 적용합니다. 모든 수치가 렌더 크기 비례라 미리보기와 같은 모양입니다(E2E에서 비교).
- EXIF 회전은 불러올 때 이미 반영되고(`normalizeImage`, Vision도 orientation을 적용), 전면 카메라 거울 모드는 원본 자체에 반영된 상태에서 검출하므로 저장본과 일치합니다.

### 상태 · Undo/Redo · Before/After

- `EditState.faces: Record<faceId, FaceRetouch>` — 얼굴별 값(보정한 얼굴만). 기존 editor history에 그대로 포함됩니다.
- 슬라이더 드래그 중에는 `present`만 바뀌고, 손을 뗄 때 `commit()` 한 번 → 한 단계(예: Nose Wing 20 → 35 → Eye Width 10이 각각 한 단계). Reset도 한 단계라 Undo로 되돌릴 수 있습니다.
- 사진을 길게 누르거나 `After` 버튼을 누르는 동안 원본(Before).

### 여러 얼굴 · 인식 실패

- 얼굴은 큰 순서로 `face-0, face-1 …`. 처음엔 가장 큰 얼굴이 선택되고, 2명 이상이면 Retouch 탭에서 얼굴마다 아주 얇은 윤곽선(선택된 얼굴만 조금 더 밝게)이 나타나 눌러서 고릅니다. 값은 얼굴별로 따로 저장되고 셰이더는 최대 3명의 윤곽 필드 + 32개 primitive를 동시에 적용합니다(검증: 한 얼굴만 보정하면 다른 얼굴 주변 변화 픽셀 0).
- 얼굴이 없거나(너무 작음: 짧은 변의 3.5% 미만, 가려짐, 너무 어두움) 검출이 실패하면 “얼굴을 인식할 수 없어요”를 표시하고 슬라이더를 비활성화합니다. 랜드마크가 비정상(NaN·붕괴)이면 매핑 단계에서 버려 크래시 없이 무시됩니다.

### Debug Mode (개발 빌드만)

Retouch의 얼굴 카테고리 하단 🐞 버튼(`__DEV__`에서만 렌더링)을 누르면 랜드마크를 점으로 표시합니다: 윤곽(노랑) · 눈(하늘) · 눈썹(주황) · 코(초록) · 입술(분홍) · dense mesh(흰색, MediaPipe). 점은 워프를 따라 움직여 After 화면에서도 보정된 부위 위에 있어야 정상입니다. 프로덕션 번들에서는 버튼과 레이어 모두 제거됩니다.

### 검증 결과

macOS에서 같은 Swift 검출 코드(Apple Vision)로 테스트 사진의 랜드마크를 뽑고, CanvasKit(Skia)으로 **실제 Lumi SkSL 셰이더**를 렌더링해 확인했습니다. 웹은 실제 앱을 헤드리스 Chromium으로 조작(E2E)했습니다.

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

- 17장 × 30개 컨트롤 × ±100 = 1020 케이스 (수치는 TS 미러로 측정)
- 접힘 없음: 야코비안 행렬식 최소 0.74 (> 0)
- 국소 왜곡(피부가 늘어나거나 눌리는 정도): 최대 34% (대부분 30% 이하, 슬라이더 100 기준)
- Midface/Face Length/Lower Face/Mouth/Nose Position ±100에서 입·눈 내부 왜곡 0%, 코끝은 170 케이스 중 162개 0%, 최대 5.7%(위를 올려다보는 얼굴)
- 얼굴 박스(가로 3배·세로 2.9배) 바깥 배경 변위 0px
- 회전 90°/270°+상하 반전: 워프 후 변환 = 변환 후 워프 (픽셀 차이 0), 자르기+좌우 반전: 평균 0.04 (경계 반올림)
- 웹 E2E: 슬라이더 → 사진 변화, Undo/Redo 1단계씩, Reset 후 Undo 복원, Before 길게 누르기, Reset All → 원본과 픽셀 차이 0, 저장본 = 미리보기 모양, 콘솔 에러 0

### 알려진 한계

- **Expo Go 미지원**(얼굴 탭만 비활성). **Android 검출기 없음**(ML Kit 백엔드 추가 필요).
- Vision에는 이마 점이 없어 iOS의 Forehead/Upper Face는 추정 이마선을 씁니다(웹은 실제 메시).
- 순수 워프라 얼굴과 붙어 있는 머리카락·안경테·배경도 윤곽 근처에서 함께 조금 움직입니다(얼굴/배경 segmentation이 있으면 추가로 줄일 수 있음). 그 폭은 윤곽 반폭의 0.85배 띠로 제한됩니다.
- 옆모습에 가까울수록(가려진 쪽 윤곽을 검출기가 추정) 가려진 쪽 보정의 정확도가 떨어집니다. 완전 측면은 검출되지 않습니다.
- 동시에 워프하는 얼굴은 최대 3명(셰이더 배열 크기), feature primitive 32개.

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

- vision-camera + Skia Frame Processor 기반의 프레임 단위 실시간 필터 (Development Build)
- 얼굴·피부 segmentation 마스크(배경/머리카락 분리로 윤곽 보정 시 배경 휨 추가 억제)
- Android 얼굴 랜드마크 백엔드(ML Kit Face Mesh) — `FaceDetectorBackend`만 구현하면 엔진·UI는 그대로
- 눈 좌/우 개별 보정(엔진은 눈마다 primitive를 따로 만들므로 값만 분리하면 됨)
- 앨범 다중 선택 후 일괄 편집, 프리셋 복사·붙여넣기
- 크롭 화면 핀치 줌, 자유 각도 회전(수평 맞추기)
- VIDEO 모드, Live Photo
- 사용자 정의 필터 저장, 3D LUT(.cube) 가져오기
- HEIC 저장, Display P3 컬러 유지
- 다크 모드 테마

## 라이선스 고지

`assets/fonts/DSEG7Classic-Bold.ttf`: DSEG © keshikan, SIL Open Font License 1.1 (`assets/fonts/DSEG-LICENSE.txt`).
