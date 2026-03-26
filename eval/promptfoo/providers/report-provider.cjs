const STATUS_PATTERN = /\b(PASS|FAIL|BLOCKED|NOT_EVALUATED|LOW_CONFIDENCE|WARNING)\b/g;

function normalizeNewlines(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

function extractSection(markdown, heading) {
  const normalized = normalizeNewlines(markdown);
  const lines = normalized.split('\n');
  const headingLine = `## ${heading}`;
  const startIndex = lines.findIndex((line) => line.trim() === headingLine);
  if (startIndex === -1) {
    return '';
  }

  const sectionLines = [headingLine];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('## ') || trimmed === '---') {
      break;
    }
    sectionLines.push(lines[index]);
  }

  return sectionLines.join('\n').trim();
}

function collectStatuses(markdown) {
  const matches = normalizeNewlines(markdown).match(STATUS_PATTERN) ?? [];
  return Array.from(new Set(matches));
}

class ReportProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'geopulse-report-provider';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const instruction = String(prompt ?? '').toLowerCase();
    const markdown = String(context?.vars?.report_markdown ?? '');

    if (instruction.includes('executive summary')) {
      return { output: extractSection(markdown, 'Executive Summary') };
    }

    if (instruction.includes('coverage summary')) {
      return { output: extractSection(markdown, 'Coverage Summary') };
    }

    if (instruction.includes('technical appendix')) {
      return { output: extractSection(markdown, 'Technical Appendix') };
    }

    if (instruction.includes('priority action plan')) {
      return { output: extractSection(markdown, 'Priority Action Plan') };
    }

    if (instruction.includes('status')) {
      const statuses = collectStatuses(markdown);
      return { output: statuses.join(', ') };
    }

    return { output: markdown };
  }
}

module.exports = ReportProvider;
