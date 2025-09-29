export function csvEscape(val: string): string {
  if (val == null) return '';
  const needsQuote = /[",\n\r]/.test(val) || /^\s|\s$/.test(val);
  let out = val.replace(/"/g, '""');
  return needsQuote ? `"${out}"` : out;
}

export function toCSV(headers: string[], rows: Array<Record<string, any>>): string {
  const head = headers.join(',');
  const body = rows
    .map((r) => headers.map((h) => csvEscape(r[h] != null ? String(r[h]) : '')).join(','))
    .join('\n');
  return head + (body ? '\n' + body : '');
}

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = [] as string[];
  let i = 0;
  let cur = '';
  let inQuote = false;
  while (i < text.length) {
    const ch = text[i++];
    if (inQuote) {
      if (ch === '"') {
        if (text[i] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '\n') {
        lines.push(cur);
        cur = '';
      } else if (ch === '\r') {
        // ignore, handle by \n
      } else if (ch === '"') {
        inQuote = true;
      } else {
        cur += ch;
      }
    }
  }
  lines.push(cur);
  const splitLine = (s: string): string[] => {
    const out: string[] = [];
    let j = 0;
    let cell = '';
    let quoted = false;
    while (j < s.length) {
      const c = s[j++];
      if (quoted) {
        if (c === '"') {
          if (s[j] === '"') {
            cell += '"';
            j++;
          } else {
            quoted = false;
          }
        } else {
          cell += c;
        }
      } else {
        if (c === ',') {
          out.push(cell);
          cell = '';
        } else if (c === '"') {
          quoted = true;
        } else {
          cell += c;
        }
      }
    }
    out.push(cell);
    return out;
  };
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitLine(lines[0].trim());
  const rows = lines.slice(1).filter(Boolean).map((ln) => splitLine(ln));
  return { headers, rows };
}

