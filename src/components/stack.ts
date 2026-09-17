/** Running totals, bottom layer first: what a stacked chart draws.
 *
 *  Kept apart from the chart so it can be tested without a canvas. A stack
 *  that is off by one layer still looks like a plausible stack. */
export function stack(layers: number[][]): number[][] {
  const out: number[][] = []
  layers.forEach((layer, i) => {
    const below = out[i - 1]
    out.push(layer.map((value, j) => value + (below?.[j] ?? 0)))
  })
  return out
}
