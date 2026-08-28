import ExpoModulesCore
import ImageIO
import UIKit
import Vision

public class BudgetiaReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BudgetiaReceiptOcr")

    AsyncFunction("recognizeText") { (uriString: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let url = URL(string: uriString),
              let data = try? Data(contentsOf: url),
              let image = UIImage(data: data),
              let cgImage = image.cgImage else {
          promise.reject(
            "ERR_RECEIPT_OCR_IMAGE",
            "L’image du ticket ne peut pas être ouverte."
          )
          return
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["fr-FR", "en-US"]
        request.usesLanguageCorrection = true

        do {
          try VNImageRequestHandler(
            cgImage: cgImage,
            orientation: CGImagePropertyOrientation(image.imageOrientation),
            options: [:]
          ).perform([request])
          let lines = (request.results ?? []).compactMap { observation in
            observation.topCandidates(1).first?.string
          }
          promise.resolve([
            "text": lines.joined(separator: "\n"),
            "lines": lines,
          ])
        } catch {
          promise.reject(error)
        }
      }
    }
  }
}

private extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
