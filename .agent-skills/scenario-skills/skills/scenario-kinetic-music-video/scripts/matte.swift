// Person/subject matte for a frame sequence using Apple Vision (foreground instance mask).
// usage: swift tools/matte.swift assets/video/<clip>  -> writes m_00001.png ... (8-bit grey, same size as frames)
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count > 1 else {
    print("usage: swift tools/matte.swift assets/video/<clip>")
    exit(1)
}
let dir = CommandLine.arguments[1]
let fm = FileManager.default
let files = try fm.contentsOfDirectory(atPath: dir).filter { $0.hasPrefix("f_") && $0.hasSuffix(".jpg") }.sorted()
let ctx = CIContext(options: [.useSoftwareRenderer: false])
var done = 0
for f in files {
    let url = URL(fileURLWithPath: dir).appendingPathComponent(f)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    let out = URL(fileURLWithPath: dir).appendingPathComponent(f.replacingOccurrences(of: "f_", with: "m_").replacingOccurrences(of: ".jpg", with: ".png"))
    let req = VNGenerateForegroundInstanceMaskRequest()
    let h = VNImageRequestHandler(cgImage: cg, options: [:])
    var maskCG: CGImage? = nil
    do {
        try h.perform([req])
        if let r = req.results?.first {
            let pb = try r.generateScaledMaskForImage(forInstances: r.allInstances, from: h)
            let ci = CIImage(cvPixelBuffer: pb)
            maskCG = ctx.createCGImage(ci, from: ci.extent, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
        }
    } catch { }
    if maskCG == nil { // empty mask
        let cs = CGColorSpaceCreateDeviceGray()
        let c = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width, space: cs, bitmapInfo: 0)!
        maskCG = c.makeImage()
    }
    let dst = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dst, maskCG!, nil); CGImageDestinationFinalize(dst)
    done += 1
}
print("matte \(dir): \(done) frames")
