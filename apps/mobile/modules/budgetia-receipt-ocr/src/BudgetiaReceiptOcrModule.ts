import { NativeModule, requireOptionalNativeModule } from "expo";

import type { ReceiptOcrResult } from "./BudgetiaReceiptOcr.types";

declare class BudgetiaReceiptOcrModule extends NativeModule {
  recognizeText(uri: string): Promise<ReceiptOcrResult>;
}

const nativeModule = requireOptionalNativeModule<BudgetiaReceiptOcrModule>(
  "BudgetiaReceiptOcr",
);

export async function recognizeReceiptText(uri: string): Promise<ReceiptOcrResult> {
  if (!nativeModule) {
    throw new Error(
      "Le scan de tickets nécessite l’application Android ou iOS installée.",
    );
  }
  return nativeModule.recognizeText(uri);
}
