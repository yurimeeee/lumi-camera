// macOS harness around the app's VisionSegmenter.swift (Apple Vision + ImageIO):
//   vision-seg <out-dir> <photo>...
// writes <name>-person.png, <name>-subject.png, <name>-tap.png (centre-right tap)
// and <name>.heic, and prints a JSON summary.
import CoreGraphics
import Foundation

let args = CommandLine.arguments
let out = URL(fileURLWithPath: args[1], isDirectory: true)
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
var summary: [String: Any] = ["capabilities": VisionSegmenter.capabilities(), "heic": VisionSegmenter.canEncodeHeic()]
for path in args.dropFirst(2) {
  let url = URL(fileURLWithPath: path)
  let name = url.deletingPathExtension().lastPathComponent
  var r: [String: Any] = [:]
  func run(_ label: String, _ make: () throws -> VisionSegmenter.Mask) {
    let t = Date()
    do {
      let mask = try make()
      let (w, h) = try VisionSegmenter.writePNG(mask, to: out.appendingPathComponent("\(name)-\(label).png"), maxSide: 1280)
      let on = Double(mask.bytes.reduce(0) { $0 + Int($1) }) / Double(mask.bytes.count * 255)
      r[label] = ["w": w, "h": h, "srcW": mask.width, "srcH": mask.height, "coverage": on, "ms": Int(Date().timeIntervalSince(t) * 1000)]
    } catch {
      r[label] = ["error": "\(error)"]
    }
  }
  run("person") { try VisionSegmenter.person(url: url) }
  run("subject") { try VisionSegmenter.subject(url: url) }
  do {
    let masks = try VisionSegmenter.subjectWithPeople(url: url)
    _ = try VisionSegmenter.writePNG(masks, to: out.appendingPathComponent("\(name)-subjectPeople.png"), maxSide: 1280)
    r["subjectPeople"] = masks.count
  } catch { r["subjectPeople"] = "\(error)" }
  run("tap") { try VisionSegmenter.subject(url: url, point: CGPoint(x: 0.73, y: 0.55)) }
  do {
    try VisionSegmenter.encodeHeic(input: url, output: out.appendingPathComponent("\(name).heic"), quality: 0.9, metadata: "noLocation")
    r["heic"] = (try? FileManager.default.attributesOfItem(atPath: out.appendingPathComponent("\(name).heic").path)[.size]) ?? 0
  } catch { r["heic"] = "\(error)" }
  summary[name] = r
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: summary, options: [.sortedKeys, .prettyPrinted]))
