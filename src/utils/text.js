// ---------- Утилиты ----------

export function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (
    cp >= 0x1f300 ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xff00 && cp <= 0xff60)
  ) return 2;
  return 1;
}

export function strWidth(s) {
  return [...s].reduce((w, ch) => w + charWidth(ch), 0);
}

// Обрезка строки до ширины w
export function fit(s, w) {
  let out = '';
  let cur = 0;
  for (const ch of s) {
    const cw = charWidth(ch);
    if (cur + cw > w) break;
    out += ch;
    cur += cw;
  }
  return out;
}

// Перенос текста по ширине (учитывает \n)
export function wrap(chars, width) {
  const lines = [];
  let cur = '';
  let curW = 0;
  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(cur);
      cur = '';
      curW = 0;
      continue;
    }
    const w = charWidth(ch);
    if (curW + w > width) {
      lines.push(cur);
      cur = '';
      curW = 0;
    }
    cur += ch;
    curW += w;
  }
  lines.push(cur);
  return lines;
}
