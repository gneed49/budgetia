package expo.modules.budgetiareceiptocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BudgetiaReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BudgetiaReceiptOcr")

    AsyncFunction("recognizeText") { uriString: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_RECEIPT_OCR_CONTEXT", "Le contexte Android est indisponible.", null)
        return@AsyncFunction
      }

      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uriString))
      } catch (error: Exception) {
        promise.reject("ERR_RECEIPT_OCR_IMAGE", "L’image du ticket ne peut pas être ouverte.", error)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { result ->
          val lines = result.textBlocks.flatMap { block ->
            block.lines.map { line -> line.text }
          }
          promise.resolve(mapOf("text" to result.text, "lines" to lines))
        }
        .addOnFailureListener { error ->
          promise.reject("ERR_RECEIPT_OCR_RECOGNITION", "Le texte du ticket n’a pas pu être reconnu.", error)
        }
        .addOnCompleteListener {
          recognizer.close()
        }
    }
  }
}
