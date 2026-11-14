export function distributionTotal(distribution: Record<string, number> | null | undefined): number {
  if (!distribution) return 0;
  let total = 0;
  for (const value of Object.values(distribution)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) total += value;
  }
  return total;
}

export function distributionPercent(
  distribution: Record<string, number> | null | undefined,
  key: string,
): number {
  const total = distributionTotal(distribution);
  if (total === 0 || !distribution) return 0;
  const value = distribution[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value / total) * 100);
}
