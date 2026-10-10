import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

/**
 * Segmentation with Apple's Vision framework, written as greyscale PNG masks
 * (white = selected) in the image's displayed orientation, plus HEIC
 * encoding with ImageIO.
 *
 * Kept free of UIKit and Expo so the same file also builds into a macOS
 * command-line harness that runs it on test photos (scripts/phase4/vision).
 */
enum VisionSegmenter {
  enum Failure: Error, CustomStringConvertible {
    case unreadable(String)
    case unsupported(String)
    case noResult
    case encode(String)

    var description: String {
      switch self {
      case .unreadable(let uri): return "Could not read image at \(uri)"
      case .unsupported(let what): return "Not supported on this OS: \(what)"
      case .noResult: return "Nothing found"
      case .encode(let what): return "Could not write \(what)"
      }
    }
  }

  struct Mask {
    let width: Int
    let height: Int
    /// One byte per pixel, row-major, top row first.
    let bytes: [UInt8]
  }

  /// Which segmentations this OS supports (`person`, `subject`, `tap`).
  static func capabilities() -> [String: Bool] {
    var subject = false
    if #available(iOS 17.0, macOS 14.0, *) { subject = true }
    var person = false
    if #available(iOS 15.0, macOS 12.0, *) { person = true }
    return ["person": person, "subject": subject, "tap": subject]
  }

  private static func load(_ url: URL) throws -> (CGImage, CGImagePropertyOrientation) {
    guard
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { throw Failure.unreadable(url.absoluteString) }
    let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let raw = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    return (image, CGImagePropertyOrientation(rawValue: raw) ?? .up)
  }

  /// Copies a one-component pixel buffer (8-bit or 32-bit float) into bytes.
  private static func bytes(of buffer: CVPixelBuffer) -> Mask {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    let w = CVPixelBufferGetWidth(buffer)
    let h = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    let format = CVPixelBufferGetPixelFormatType(buffer)
    var out = [UInt8](repeating: 0, count: w * h)
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return Mask(width: w, height: h, bytes: out) }
    for y in 0..<h {
      let row = base.advanced(by: y * stride)
      if format == kCVPixelFormatType_OneComponent32Float {
        let f = row.assumingMemoryBound(to: Float32.self)
        for x in 0..<w { out[y * w + x] = UInt8(max(0, min(255, (f[x] * 255).rounded()))) }
      } else {
        let b = row.assumingMemoryBound(to: UInt8.self)
        for x in 0..<w { out[y * w + x] = b[x] }
      }
    }
    return Mask(width: w, height: h, bytes: out)
  }

  /// People (Vision person segmentation, accurate).
  static func person(url: URL) throws -> Mask {
    guard #available(iOS 15.0, macOS 12.0, *) else { throw Failure.unsupported("person segmentation") }
    let (image, orientation) = try load(url)
    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .accurate
    request.outputPixelFormat = kCVPixelFormatType_OneComponent8
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try handler.perform([request])
    guard let buffer = request.results?.first?.pixelBuffer else { throw Failure.noResult }
    return bytes(of: buffer)
  }

  /// Every foreground subject (Vision subject lifting), or only the one under `point` (normalised, top-left origin).
  static func subject(url: URL, point: CGPoint? = nil) throws -> Mask {
    guard #available(iOS 17.0, macOS 14.0, *) else { throw Failure.unsupported("subject lifting") }
    let (image, orientation) = try load(url)
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try handler.perform([request])
    guard let observation = request.results?.first else { throw Failure.noResult }
    var instances = observation.allInstances
    if let point {
      // Instance label under the tap (0 = background).
      let labels = bytes(of: observation.instanceMask)
      let x = min(labels.width - 1, max(0, Int(point.x * CGFloat(labels.width))))
      let y = min(labels.height - 1, max(0, Int(point.y * CGFloat(labels.height))))
      let label = Int(labels.bytes[y * labels.width + x])
      guard label > 0 else { throw Failure.noResult }
      instances = IndexSet(integer: label)
    }
    if instances.isEmpty { throw Failure.noResult }
    let buffer = try observation.generateScaledMaskForImage(forInstances: instances, from: handler)
    return bytes(of: buffer)
  }

  /**
   * The subject for background editing: every foreground subject, joined
   * (per-pixel max) with the person matte when there are people — the
   * person matte keeps fine hair the subject mask cuts off.
   */
  static func subjectWithPeople(url: URL) throws -> [Mask] {
    var masks: [Mask] = []
    if let s = try? subject(url: url) { masks.append(s) }
    if let p = try? person(url: url), p.bytes.contains(where: { $0 > 128 }) { masks.append(p) }
    if masks.isEmpty { throw Failure.noResult }
    return masks
  }

  private static func cgImage(_ mask: Mask) -> CGImage? {
    var src = mask.bytes
    return src.withUnsafeMutableBytes { raw in
      guard
        let ctx = CGContext(
          data: raw.baseAddress, width: mask.width, height: mask.height, bitsPerComponent: 8,
          bytesPerRow: mask.width, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
      else { return nil }
      return ctx.makeImage()
    }
  }

  /// Resizes `mask` so its long side is at most `maxSide` and writes it as a greyscale PNG.
  static func writePNG(_ mask: Mask, to url: URL, maxSide: Int) throws -> (Int, Int) {
    try writePNG([mask], to: url, maxSide: maxSide)
  }

  /// Joins `masks` (per-pixel max, each stretched over the image) at the first one's aspect, then writes a PNG.
  static func writePNG(_ masks: [Mask], to url: URL, maxSide: Int) throws -> (Int, Int) {
    guard let mask = masks.first else { throw Failure.noResult }
    let scale = min(1, Double(maxSide) / Double(max(mask.width, mask.height)))
    let w = max(1, Int((Double(mask.width) * scale).rounded()))
    let h = max(1, Int((Double(mask.height) * scale).rounded()))
    let gray = CGColorSpaceCreateDeviceGray()
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: gray, bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { throw Failure.encode("mask") }
    ctx.interpolationQuality = .high
    for (i, m) in masks.enumerated() {
      guard let image = cgImage(m) else { throw Failure.encode("mask") }
      ctx.setBlendMode(i == 0 ? .copy : .lighten)
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    }
    guard let out = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { throw Failure.encode(url.path) }
    CGImageDestinationAddImage(dest, out, nil)
    guard CGImageDestinationFinalize(dest) else { throw Failure.encode(url.path) }
    return (w, h)
  }

  /// Whether this OS can write HEIC.
  static func canEncodeHeic() -> Bool {
    let types = CGImageDestinationCopyTypeIdentifiers() as? [String] ?? []
    return types.contains(UTType.heic.identifier)
  }

  /**
   * Re-encodes `input` (a JPEG Lumi rendered, with its EXIF) as HEIC. Metadata
   * is copied from the input unless removed: `metadata` = "keep",
   * "noLocation" (drops GPS) or "none" (drops EXIF, GPS, TIFF, IPTC, XMP).
   */
  static func encodeHeic(input: URL, output: URL, quality: Double, metadata: String) throws {
    guard
      let source = CGImageSourceCreateWithURL(input as CFURL, nil),
      let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.heic.identifier as CFString, 1, nil)
    else { throw Failure.encode("HEIC (unsupported on this device)") }
    var props = (CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]) ?? [:]
    if metadata == "none" {
      for key in [kCGImagePropertyExifDictionary, kCGImagePropertyGPSDictionary, kCGImagePropertyTIFFDictionary, kCGImagePropertyIPTCDictionary] {
        props[key] = kCFNull
      }
    } else if metadata == "noLocation" {
      props[kCGImagePropertyGPSDictionary] = kCFNull
    }
    props[kCGImageDestinationLossyCompressionQuality] = quality
    props[kCGImagePropertyOrientation] = 1
    CGImageDestinationAddImageFromSource(dest, source, 0, props as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw Failure.encode(output.path) }
  }
}
