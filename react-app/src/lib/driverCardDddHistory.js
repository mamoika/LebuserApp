function importTimestamp(item) {
  const value = item?.downloaded_at || item?.imported_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function partitionDriverCardDddImports(imports = []) {
  const seen = new Set();
  const ordered = [...imports]
    .filter(item => item?.id && !seen.has(item.id) && seen.add(item.id))
    .sort((left, right) => {
      const byDownload = importTimestamp(right) - importTimestamp(left);
      if (byDownload !== 0) return byDownload;
      return String(right.imported_at || '').localeCompare(String(left.imported_at || ''));
    });

  return {
    latestImport: ordered[0] || null,
    olderImports: ordered.slice(1),
  };
}
