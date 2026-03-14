"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiGetPaginated, apiPatch, apiPost } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { Expense, PaginatedResponse, ExpenseStatus } from "@/types";

export interface CreateExpenseBody {
  amount: number;
  description: string;
  receipt_url?: string;
}

export function useMyExpenses(page: number, limit: number) {
  return useQuery<PaginatedResponse<Expense>>({
    queryKey: ["expenses", page, limit],
    queryFn: () =>
      apiGetPaginated<Expense>(API.expenses, {
        page: String(page),
        limit: String(limit),
      }),
  });
}

export function useOrgExpenses(page: number, limit: number) {
  return useQuery<PaginatedResponse<Expense>>({
    queryKey: ["orgExpenses", page, limit],
    queryFn: () =>
      apiGetPaginated<Expense>(API.orgExpenses, {
        page: String(page),
        limit: String(limit),
      }),
  });
}

/**
 * Fetches ALL org expenses across all pages (limit=100 per page).
 * Auto-fetches subsequent pages until the entire dataset is loaded.
 * Returns a flat array of all expenses for client-side grouping.
 */
export function useAllOrgExpenses() {
  const query = useInfiniteQuery<PaginatedResponse<Expense>, Error, Expense[], [string], number>({
    queryKey: ["orgExpensesAll"],
    queryFn: ({ pageParam }) =>
      apiGetPaginated<Expense>(API.orgExpenses, {
        page: String(pageParam),
        limit: "100",
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.data.length, 0);
      return fetched < lastPage.pagination.total ? allPages.length + 1 : undefined;
    },
    select: (data) => data.pages.flatMap((p) => p.data),
  });

  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading || query.hasNextPage === true,
    error: query.error,
  };
}

export function useCreateExpense() {
  const client = useQueryClient();

  return useMutation<Expense, Error, CreateExpenseBody>({
    mutationFn: (body) => apiPost<Expense>(API.createExpense, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useUpdateExpenseStatus() {
  const client = useQueryClient();

  return useMutation<Expense, Error, { id: string; status: ExpenseStatus }>({
    mutationFn: ({ id, status }) =>
      apiPatch<Expense>(API.expenseStatus(id), { status }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["orgExpenses"] });
      void client.invalidateQueries({ queryKey: ["orgExpensesAll"] });
    },
  });
}

