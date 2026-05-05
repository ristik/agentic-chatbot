/**
 * Reward (in whole UCT) paid to the human when they beat the bot at the given ELO.
 *
 * Tiered by difficulty:
 *   ELO < 1000          → 20 UCT  (e.g. T1mo)
 *   1000 ≤ ELO ≤ 2000   → 25 UCT  (e.g. Pavel)
 *   ELO > 2000          → 30 UCT  (e.g. Ahto)
 */
export function rewardForElo(elo: number): number {
  if (!Number.isFinite(elo)) return 20;
  if (elo < 1000) return 20;
  if (elo <= 2000) return 25;
  return 30;
}
