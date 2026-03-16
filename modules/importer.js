const COLUMN_ALIASES = {
  name: ["name", "business", "business name", "title"],
  address: ["address", "direccion", "location"],
  phone: ["phone", "telephone", "mobile"],
  website: ["website", "site", "web"],
  facebook: ["facebook", "fb"],
  instagram: ["instagram", "ig"],
  twitter: ["twitter", "x"],
  rating: ["rating", "stars"],
  reviews: ["reviews", "review count", "opinions"],
  notes: ["notes", "comments"]
};

export async function parseImportFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    const text = await file.text();
    return normalizeRows(parseCsv(text));
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  return normalizeRows(rows);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(cleanHeader);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] ?? "";
      return row;
    }, {});
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeRows(rows) {
  return rows
    .map((row) => normalizeRow(row))
    .filter((row) => row.name);
}

function normalizeRow(row) {
  const normalized = {};
  const entries = Object.entries(row).map(([key, value]) => [cleanHeader(key), value]);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = entries.find(([header]) => aliases.includes(header));
    normalized[field] = match ? String(match[1] ?? "").trim() : "";
  }
  normalized.rating = parseFloat(normalized.rating) || 0;
  normalized.reviews = parseInt(normalized.reviews, 10) || 0;
  return normalized;
}

function cleanHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
