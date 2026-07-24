function parseRow(line: string): string[] {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

export function parsePromptCsv(raw: string): string[] {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = parseRow(lines[0]!);
  const promptIndex = header.findIndex((cell) => /^(prompt|query|question|keyword)$/i.test(cell.trim()));
  const dataLines = promptIndex >= 0 ? lines.slice(1) : lines;
  const index = promptIndex >= 0 ? promptIndex : 0;
  return Array.from(new Set(dataLines
    .map((line) => parseRow(line)[index]?.trim().replace(/\s+/g, ' ') ?? '')
    .filter((prompt) => prompt.length >= 5 && prompt.length <= 240)))
    .slice(0, 20);
}
