import type { ReceiptOcrResult } from "./BudgetiaReceiptOcr.types";

export async function recognizeReceiptText(_uri: string): Promise<ReceiptOcrResult> {
  throw new Error("Le scan de tickets est disponible dans l’app Android ou iOS.");
}
