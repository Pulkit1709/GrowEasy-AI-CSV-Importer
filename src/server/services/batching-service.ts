export function splitIntoBatches<T>(items: T[], batchSize = 25) {
  const batches: Array<{ batchIndex: number; startRow: number; endRow: number; rows: T[] }> = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const rows = items.slice(start, start + batchSize);
    batches.push({
      batchIndex: batches.length,
      startRow: start + 1,
      endRow: start + rows.length,
      rows
    });
  }
  return batches;
}
