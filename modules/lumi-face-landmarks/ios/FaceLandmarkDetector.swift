import CoreGraphics
import Foundation
import ImageIO
import Vision

/**
 * Face landmarks with Apple's Vision framework (76-point constellation).
 *
 * Kept free of UIKit and Expo so the same file also builds into a macOS
 * command-line harness that checks detection on test photos.
 *
 * Every point is normalised against the image as displayed (EXIF orientation
 * applied), origin top-left, y down — the convention the JS side uses.
 */
enum FaceLandmarkDetector {
  enum Failure: Error, CustomStringConvertible {
    case unreadable(String)

    var description: String {
      switch self {
      case .unreadable(let uri): return "Could not read image at \(uri)"
      }
    }
  }

  /// Regions forwarded to JS, by the names the JS mapping expects.
  private static let regions: [(String, KeyPath<VNFaceLandmarks2D, VNFaceLandmarkRegion2D?>)] = [
    ("faceContour", \.faceContour),
    ("leftEye", \.leftEye),
    ("rightEye", \.rightEye),
    ("leftEyebrow", \.leftEyebrow),
    ("rightEyebrow", \.rightEyebrow),
    ("nose", \.nose),
    ("noseCrest", \.noseCrest),
    ("medianLine", \.medianLine),
    ("outerLips", \.outerLips),
    ("innerLips", \.innerLips),
    ("leftPupil", \.leftPupil),
    ("rightPupil", \.rightPupil),
  ]

  static func detect(url: URL) throws -> [[String: Any]] {
    guard
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      throw Failure.unreadable(url.absoluteString)
    }
    let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let raw = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up
    return try detect(image: image, orientation: orientation)
  }

  static func detect(image: CGImage, orientation: CGImagePropertyOrientation) throws -> [[String: Any]] {
    // Size of the image once oriented: Vision reports in that space.
    let turned = [.left, .leftMirrored, .right, .rightMirrored].contains(orientation)
    let size = turned
      ? CGSize(width: image.height, height: image.width)
      : CGSize(width: image.width, height: image.height)

    let request = VNDetectFaceLandmarksRequest()
    if #available(iOS 13.0, macOS 10.15, *) {
      request.revision = VNDetectFaceLandmarksRequestRevision3
      request.constellation = .constellation76Points
    }
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try handler.perform([request])

    let faces = request.results ?? []
    return faces.compactMap { face -> [String: Any]? in
      guard let landmarks = face.landmarks else { return nil }
      var out: [String: [Double]] = [:]
      for (name, path) in regions {
        guard let region = landmarks[keyPath: path], region.pointCount > 0 else { continue }
        var flat: [Double] = []
        flat.reserveCapacity(region.pointCount * 2)
        for p in region.pointsInImage(imageSize: size) {
          // Vision's origin is bottom-left.
          flat.append(Double(p.x / size.width))
          flat.append(Double(1 - p.y / size.height))
        }
        out[name] = flat
      }
      let box = face.boundingBox
      var result: [String: Any] = [
        "bounds": [
          "x": Double(box.minX),
          "y": Double(1 - box.maxY),
          "width": Double(box.width),
          "height": Double(box.height),
        ],
        "confidence": Double(face.confidence),
        "landmarkConfidence": Double(landmarks.confidence),
        "regions": out,
      ]
      if let roll = face.roll { result["roll"] = roll.doubleValue }
      if let yaw = face.yaw { result["yaw"] = yaw.doubleValue }
      return result
    }
  }
}
