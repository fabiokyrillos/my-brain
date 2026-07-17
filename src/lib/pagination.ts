export const PAGE_SIZE = 50;
const MAX_PAGE = 10_000;

export function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

export function pageRange(page: number, pageSize = PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize };
}

export function paginateRows<T>(rows: T[], pageSize = PAGE_SIZE) {
  return {
    items: rows.slice(0, pageSize),
    hasNext: rows.length > pageSize,
  };
}
