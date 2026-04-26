const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return '';

  const normalized = String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
};

const buildCsv = (headers, rows) => {
  const headerLine = headers.map((header) => escapeCsvValue(header.label)).join(',');
  const dataLines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header.key])).join(','));
  return [headerLine, ...dataLines].join('\n');
};

module.exports = {
  buildCsv,
};