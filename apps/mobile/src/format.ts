import { type Period } from "@budgetia/domain";

export function formatMoney(cents: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(cents / 100);
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function periodLabel(period: Period): string {
  return { week: "Semaine", month: "Mois", year: "Année" }[period];
}
