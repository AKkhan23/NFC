import type { ZodTypeAny, ZodObject, ZodRawShape } from 'zod';

export type AnyZodObject = ZodObject<ZodRawShape> | ZodTypeAny;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
