import { createHash } from 'node:crypto';

const samplePattern = /^(node_memory_Mem(?:Total|Available)_bytes|node_cpu_seconds_total|node_boot_time_seconds)(?:\{(.*)\})?\s+(\S+)/;
const labelPattern = /([a-zA-Z_][a-zA-Z_0-9]*)="((?:[^"\\]|\\.)*)"/g;

export function summarizeDatabaseMetrics(exposition, projectRef) {
  const instances = new Map();
  for (const line of exposition.split(/\r?\n/)) {
    const sample = line.match(samplePattern);
    if (!sample) continue;
    const [, metric, labelText = '', rawValue] = sample;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) continue;

    const labels = Object.fromEntries([...labelText.matchAll(labelPattern)].map(([, name, label]) => [name, label]));
    const { cpu, mode, service_type: service, supabase_project_ref: ref, ...instanceLabels } = labels;
    if ((service && service !== 'db') || (ref && ref !== projectRef)) continue;

    const instanceKey = JSON.stringify(Object.entries(instanceLabels).sort());
    if (!instances.has(instanceKey)) instances.set(instanceKey, { gauges: new Map(), cpu: new Map() });
    const instance = instances.get(instanceKey);
    if (metric === 'node_cpu_seconds_total') {
      if (cpu && mode) instance.cpu.set(`${cpu}:${mode}`, value);
    } else {
      instance.gauges.set(metric, value);
    }
  }

  // Avoid combining different hosts if several database instances are returned.
  if (instances.size !== 1) return { memory: null, cpu: null };
  const [[instanceKey, instance]] = instances;
  const total = instance.gauges.get('node_memory_MemTotal_bytes');
  const available = instance.gauges.get('node_memory_MemAvailable_bytes');
  const memory = total > 0 && available >= 0 && available <= total
    ? { total_bytes: total, used_bytes: total - available }
    : null;

  let totalSeconds = 0;
  let idleSeconds = 0;
  const idleCores = new Set();
  const cores = new Set();
  for (const [series, value] of instance.cpu) {
    const [core, mode] = series.split(':');
    totalSeconds += value;
    cores.add(core);
    if (mode === 'idle') {
      idleSeconds += value;
      idleCores.add(core);
    }
  }
  const cpu = totalSeconds > 0 && idleCores.size === cores.size && instance.cpu.size > cores.size
    ? {
      total_seconds: totalSeconds, idle_seconds: idleSeconds,
      source: createHash('sha256').update(JSON.stringify([
        instanceKey, instance.gauges.get('node_boot_time_seconds'), [...instance.cpu.keys()].sort(),
      ])).digest('hex'),
    }
    : null;

  return { memory, cpu };
}
