import AppKit
import Foundation

private let canvasWidth = 1320
private let canvasHeight = 2868

private struct Shot {
  let source: String
  let output: String
  let eyebrow: String
  let headline: String
  let detail: String
  let accent: NSColor
}

private let shots = [
  Shot(
    source: "appstore-screenshots/raw-1.3.3/03-today-fresh.png",
    output: "appstore-screenshots/01-today.png",
    eyebrow: "HABITS FOR REAL LIFE",
    headline: "Build habits that\nsurvive real life",
    detail: "Free to start  •  No account required",
    accent: NSColor(calibratedRed: 0.0, green: 0.85, blue: 1.0, alpha: 1.0)
  ),
  Shot(
    source: "appstore-screenshots/raw-1.3.3/03-today-fresh.png",
    output: "appstore-screenshots/02-two-minute.png",
    eyebrow: "A PLAN FOR HARD DAYS",
    headline: "Keep going with a\n2-minute version",
    detail: "A smaller action still counts",
    accent: NSColor(calibratedRed: 1.0, green: 0.72, blue: 0.0, alpha: 1.0)
  ),
  Shot(
    source: "appstore-screenshots/raw-1.3.3/05-journey-top.png",
    output: "appstore-screenshots/03-journey.png",
    eyebrow: "FORGIVING PROGRESS",
    headline: "One missed day never\nerases your progress",
    detail: "See consistency without streak pressure",
    accent: NSColor(calibratedRed: 0.0, green: 0.94, blue: 0.58, alpha: 1.0)
  ),
  Shot(
    source: "appstore-screenshots/raw-1.3.3/04-today-actions-done.png",
    output: "appstore-screenshots/04-evidence.png",
    eyebrow: "SMALL ACTIONS ADD UP",
    headline: "See the evidence that\nyou’re changing",
    detail: "Progress you can feel, not just count",
    accent: NSColor(calibratedRed: 0.0, green: 0.94, blue: 0.58, alpha: 1.0)
  ),
  Shot(
    source: "appstore-screenshots/raw-1.3.3/08-coach-lobby.png",
    output: "appstore-screenshots/05-coach.png",
    eyebrow: "COACHING ON YOUR TERMS",
    headline: "Ask an AI coach\nwhat to adjust",
    detail: "Preview every plan change before you confirm",
    accent: NSColor(calibratedRed: 0.0, green: 0.85, blue: 1.0, alpha: 1.0)
  ),
  Shot(
    source: "appstore-screenshots/raw-1.3.3/02-ai-consent.png",
    output: "appstore-screenshots/06-private.png",
    eyebrow: "PRIVATE BY DESIGN",
    headline: "Your progress stays\non your device",
    detail: "Clear AI consent  •  No required account",
    accent: NSColor(calibratedRed: 0.63, green: 0.40, blue: 1.0, alpha: 1.0)
  ),
]

private func color(_ hex: UInt32, alpha: CGFloat = 1.0) -> NSColor {
  NSColor(
    calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
    green: CGFloat((hex >> 8) & 0xff) / 255,
    blue: CGFloat(hex & 0xff) / 255,
    alpha: alpha
  )
}

private func drawCenteredText(
  _ text: String,
  top: CGFloat,
  font: NSFont,
  color: NSColor,
  lineHeight: CGFloat? = nil,
  tracking: CGFloat = 0
) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  if let lineHeight {
    paragraph.minimumLineHeight = lineHeight
    paragraph.maximumLineHeight = lineHeight
  }

  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: color,
    .paragraphStyle: paragraph,
    .kern: tracking,
  ]
  let bounds = CGRect(
    x: 70,
    y: CGFloat(canvasHeight) - top - 360,
    width: CGFloat(canvasWidth - 140),
    height: 360
  )
  text.draw(in: bounds, withAttributes: attributes)
}

private func render(_ shot: Shot) throws {
  guard let sourceImage = NSImage(contentsOfFile: shot.source) else {
    throw NSError(domain: "AppStoreScreenshots", code: 1, userInfo: [
      NSLocalizedDescriptionKey: "Could not load \(shot.source)"
    ])
  }

  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: canvasWidth,
    pixelsHigh: canvasHeight,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    throw NSError(domain: "AppStoreScreenshots", code: 2)
  }

  NSGraphicsContext.saveGraphicsState()
  guard let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap) else {
    throw NSError(domain: "AppStoreScreenshots", code: 3)
  }
  NSGraphicsContext.current = graphicsContext

  let context = graphicsContext.cgContext
  let canvas = CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight)
  let background = NSGradient(colors: [color(0x08131d), color(0x020406), .black])!
  background.draw(in: canvas, angle: -90)

  context.saveGState()
  context.setFillColor(shot.accent.withAlphaComponent(0.13).cgColor)
  context.fillEllipse(in: CGRect(x: 720, y: 2208, width: 880, height: 880))
  context.setFillColor(shot.accent.withAlphaComponent(0.07).cgColor)
  context.fillEllipse(in: CGRect(x: -360, y: 1568, width: 820, height: 820))
  context.restoreGState()

  drawCenteredText(
    shot.eyebrow,
    top: 106,
    font: NSFont.systemFont(ofSize: 42, weight: .semibold),
    color: shot.accent,
    tracking: 5
  )
  drawCenteredText(
    shot.headline,
    top: 178,
    font: NSFont.systemFont(ofSize: 100, weight: .bold),
    color: .white,
    lineHeight: 112
  )
  drawCenteredText(
    shot.detail,
    top: 430,
    font: NSFont.systemFont(ofSize: 39, weight: .medium),
    color: color(0xb7c3cc)
  )

  let phoneRect = CGRect(x: 140, y: 23, width: 1040, height: 2260)
  let shadow = NSShadow()
  shadow.shadowColor = shot.accent.withAlphaComponent(0.28)
  shadow.shadowBlurRadius = 45
  shadow.shadowOffset = NSSize(width: 0, height: -12)
  shadow.set()

  let phonePath = NSBezierPath(roundedRect: phoneRect, xRadius: 92, yRadius: 92)
  color(0x111820).setFill()
  phonePath.fill()

  NSGraphicsContext.saveGraphicsState()
  phonePath.addClip()
  sourceImage.draw(
    in: phoneRect,
    from: CGRect(origin: .zero, size: sourceImage.size),
    operation: .copy,
    fraction: 1.0,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.high]
  )
  NSGraphicsContext.restoreGraphicsState()

  NSGraphicsContext.saveGraphicsState()
  NSShadow().set()
  shot.accent.withAlphaComponent(0.42).setStroke()
  phonePath.lineWidth = 3
  phonePath.stroke()
  NSGraphicsContext.restoreGraphicsState()

  graphicsContext.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "AppStoreScreenshots", code: 4)
  }
  try data.write(to: URL(fileURLWithPath: shot.output))

  let flattenedOutput = shot.output + ".rgb.png"
  let flatten = Process()
  flatten.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/ffmpeg")
  flatten.arguments = [
    "-loglevel", "error", "-y", "-i", shot.output,
    "-frames:v", "1", "-pix_fmt", "rgb24", flattenedOutput,
  ]
  try flatten.run()
  flatten.waitUntilExit()
  guard flatten.terminationStatus == 0 else {
    throw NSError(domain: "AppStoreScreenshots", code: 5, userInfo: [
      NSLocalizedDescriptionKey: "Could not flatten alpha in \(shot.output)"
    ])
  }
  try FileManager.default.removeItem(atPath: shot.output)
  try FileManager.default.moveItem(atPath: flattenedOutput, toPath: shot.output)
  print("Rendered \(shot.output)")
}

for shot in shots {
  try render(shot)
}
