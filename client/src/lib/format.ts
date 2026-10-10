export function inr(minor: number): string {
  return `₹${(minor / 100).toFixed(2)}`;
}

export function parseRupees(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
