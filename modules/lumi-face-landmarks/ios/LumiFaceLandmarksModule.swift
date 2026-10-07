import ExpoModulesCore

/**
 * JS: `detect(uri)` → faces with landmark regions (see FaceLandmarkDetector).
 * Runs on the module's background queue; Vision takes ~10 ms per photo.
 */
public class LumiFaceLandmarksModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LumiFaceLandmarks")

    AsyncFunction("detect") { (uri: URL) -> [[String: Any]] in
      try FaceLandmarkDetector.detect(url: uri)
    }
  }
}
