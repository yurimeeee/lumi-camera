import CoreGraphics
import ExpoModulesCore

/**
 * JS (modules/lumi-vision/index.ts):
 * - `capabilities()` → which segmentations this iOS version has
 * - `segment(uri, kind, outPath, maxSide)` → greyscale PNG mask (person / subject)
 * - `segmentAt(uri, x, y, outPath, maxSide)` → the subject under a tap
 * - `encodeHeic(inputUri, outPath, quality, metadata)`
 * Runs on the module's background queue.
 */
public class LumiVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LumiVision")

    Function("capabilities") { () -> [String: Bool] in
      var caps = VisionSegmenter.capabilities()
      caps["heic"] = VisionSegmenter.canEncodeHeic()
      return caps
    }

    AsyncFunction("segment") { (uri: URL, kind: String, outPath: URL, maxSide: Int) -> [String: Any] in
      let masks = kind == "person" ? [try VisionSegmenter.person(url: uri)] : try VisionSegmenter.subjectWithPeople(url: uri)
      let (w, h) = try VisionSegmenter.writePNG(masks, to: outPath, maxSide: maxSide)
      return ["uri": outPath.absoluteString, "width": w, "height": h]
    }

    AsyncFunction("segmentAt") { (uri: URL, x: Double, y: Double, outPath: URL, maxSide: Int) -> [String: Any] in
      let mask = try VisionSegmenter.subject(url: uri, point: CGPoint(x: x, y: y))
      let (w, h) = try VisionSegmenter.writePNG(mask, to: outPath, maxSide: maxSide)
      return ["uri": outPath.absoluteString, "width": w, "height": h]
    }

    AsyncFunction("encodeHeic") { (input: URL, outPath: URL, quality: Double, metadata: String) -> String in
      try VisionSegmenter.encodeHeic(input: input, output: outPath, quality: quality, metadata: metadata)
      return outPath.absoluteString
    }
  }
}
