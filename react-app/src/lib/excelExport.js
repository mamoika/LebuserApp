import writeExcelFile from 'write-excel-file/browser';

function normalizeFileName(fileName) {
  return String(fileName || 'export.xlsx').endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
}

function normalizeSheetName(sheetName) {
  const invalidChars = new Set(['[', ']', ':', '*', '?', '/', '\\']);
  const clean = [...String(sheetName || 'Sheet')]
    .map(char => invalidChars.has(char) ? ' ' : char)
    .join('')
    .trim();
  return (clean || 'Sheet').slice(0, 31);
}

function normalizeRows(rows) {
  return rows.map(row => {
    if (!Array.isArray(row) || row.length === 0) return [null];
    return row.map(value => value ?? null);
  });
}

export async function exportRowsAsXlsx(rows, fileName) {
  await writeExcelFile(normalizeRows(rows)).toFile(normalizeFileName(fileName));
}

export async function exportSheetsAsXlsx(sheets, fileName) {
  await writeExcelFile(
    sheets.map(({ data, sheet }) => ({
      data: normalizeRows(data),
      sheet: normalizeSheetName(sheet),
    }))
  ).toFile(normalizeFileName(fileName));
}
