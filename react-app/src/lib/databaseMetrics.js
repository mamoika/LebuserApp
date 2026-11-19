const MAX_CPU_SAMPLE_GAP_MS = 5 * 60_000;

export function updateCpuUsage(previous, snapshot) {
  if (!snapshot?.cpu || !snapshot.checked_at) return previous;
  const { cpu, checked_at: checkedAt } = snapshot;
  if (previous?.checkedAt === checkedAt) return previous;

  const baseline = previous?.sample;
  const elapsed = Date.parse(checkedAt) - Date.parse(previous?.checkedAt);
  const total = cpu.total_seconds - baseline?.total_seconds;
  const idle = cpu.idle_seconds - baseline?.idle_seconds;
  const comparable = cpu.source === baseline?.source && elapsed > 0 && elapsed <= MAX_CPU_SAMPLE_GAP_MS;

  let usage = null;
  if (comparable && total > 0 && idle >= 0 && idle <= total) usage = (total - idle) / total;
  if (comparable && total === 0 && idle === 0) return previous;

  return { sample: cpu, checkedAt, usage };
}
