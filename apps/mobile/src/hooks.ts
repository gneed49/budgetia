import { useCallback, useEffect, useState } from "react";

import {
  todayISO,
  type Category,
  type CategoryBudgetPosition,
  type Expense,
  type Period,
  type SpendingSummary,
} from "@budgetia/domain";

import { BudgetApi, type BudgetSettings } from "./api";

export interface OverviewState {
  categories: Category[];
  expenses: Expense[];
  summary: SpendingSummary | null;
  settings: BudgetSettings | null;
  loading: boolean;
  error: string | null;
}

const initialOverview: OverviewState = {
  categories: [],
  expenses: [],
  summary: null,
  settings: null,
  loading: true,
  error: null,
};

export function useOverview(api: BudgetApi): OverviewState & { refresh: () => void } {
  const [state, setState] = useState<OverviewState>(initialOverview);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    Promise.all([
      api.listCategories(),
      api.listExpenses({ limit: 30 }),
      api.getSummary({ period: "month", referenceDate: todayISO() }),
      api.getSettings(),
    ])
      .then(([categories, expenses, summary, settings]) => {
        if (active) {
          setState({
            categories,
            expenses,
            summary,
            settings,
            loading: false,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Connexion impossible.",
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [api, version]);

  return { ...state, refresh };
}

export function useSummary(
  api: BudgetApi,
  period: Period,
  referenceDate: string,
  categoryIds: string[],
  refreshVersion = 0,
): {
  summary: SpendingSummary | null;
  loading: boolean;
  error: string | null;
} {
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categoryKey = categoryIds.join(",");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getSummary({
        period,
        referenceDate,
        ...(categoryIds.length ? { categoryIds } : {}),
      })
      .then((value) => {
        if (active) setSummary(value);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Analyse indisponible.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // categoryKey provides a stable primitive dependency for an array of ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, period, referenceDate, categoryKey, refreshVersion]);

  return { summary, loading, error };
}

export function useCategoryBudgets(
  api: BudgetApi,
  referenceDate: string,
  refreshVersion = 0,
): {
  positions: CategoryBudgetPosition[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [positions, setPositions] = useState<CategoryBudgetPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .listCategoryBudgetPositions(referenceDate)
      .then((value) => {
        if (active) setPositions(value);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "Plafonds indisponibles.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, referenceDate, refreshVersion, version]);

  return { positions, loading, error, refresh };
}
