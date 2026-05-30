export function priceFromTick(tick: number): number {
  return Math.pow(1.0001, tick);
}
