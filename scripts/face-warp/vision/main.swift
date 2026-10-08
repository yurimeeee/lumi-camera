// macOS harness around the app's FaceLandmarkDetector.swift (Apple Vision):
// prints {file: {faces: [...]}} as JSON for the given images.
import Foundation

var all: [String: Any] = [:]
for path in CommandLine.arguments.dropFirst() {
  let url = URL(fileURLWithPath: path)
  do {
    all[url.lastPathComponent] = ["faces": try FaceLandmarkDetector.detect(url: url)]
  } catch {
    all[url.lastPathComponent] = ["error": "\(error)"]
  }
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: all, options: [.sortedKeys]))
