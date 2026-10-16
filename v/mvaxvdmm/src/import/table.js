// قراءة ملفات CSV و Excel (.xlsx) من غير أي مكتبات خارجية.
import { readFileSync } from '../web/shims/node-fs.js';
import { inflateRawSync } from '../web/shims/node-zlib.js';

export function parseCsv(text        )             {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows             = [];
  let row           = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function unzip(buf        )                      {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('الملف مش xlsx سليم');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map                ();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    files.set(name, method === 0 ? data : inflateRawSync(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

export const xmlText = (s        ) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const colIndex = (ref        ) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** أول شيت في ملف xlsx كجدول. الأرقام (ومنها التواريخ) بترجع أرقام إكسيل زي ما هي */
export function parseXlsx(buf        )                        {
  const files = unzip(buf);
  const shared = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const xml = files.get(sheetName) .toString('utf8');
  const rows                        = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row                      = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const body = c[2] ?? '';
      let v                  = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '';
      if (type === 's') v = shared[+v];
      else if (type === 'str' || type === 'inlineStr') v = xmlText(String(v));
      else if (v !== '' && type !== 'b') v = +v;
      row[ref ? colIndex(ref) : row.length] = v;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// ---------- XML ----------
// سوفتك بيصدّر XML. بندعم شكلين:
// 1) XML Spreadsheet بتاع Excel 2003 (Workbook > Worksheet > Table > Row > Cell > Data)
// 2) XML عادي فيه عنصر بيتكرر لكل حركة، وجواه عناصر أو attributes للأعمدة

/** بيفك ترميز ملف XML: UTF-8 أو UTF-16 أو اللي مكتوب في encoding (زي windows-1256 العربي) */
export function decodeXml(buf        )         {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  if (buf[0] === 0x3c && buf[1] === 0x00) return new TextDecoder('utf-16le').decode(buf);
  // XML بيكتب الترميز في encoding، وصفحة HTML بتكتبه في charset
  const head = buf.subarray(0, 2048).toString('latin1');
  const declared = head.match(/encoding\s*=\s*["']([^"']+)/i)?.[1] ?? head.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  if (declared && !/^utf-?8$/i.test(declared)) {
    try {
      return new TextDecoder(declared).decode(buf);
    } catch {
      // ترميز مش معروف: نكمّل بـ UTF-8
    }
  }
  return buf.toString('utf8').replace(/^﻿/, '');
}

                   
               
                                
                      
               
 

const localName = (n        ) => n.slice(n.indexOf(':') + 1);

function parseXmlTree(xml        )          {
  const root          = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(token)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += xmlText(m[6]);
    else if (m[3]) {
      if (m[2] === '/') {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const attrs                         = {};
      for (const a of (m[4] ?? '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[localName(a[1])] = xmlText(a[2] ?? a[3] ?? '');
      }
      const node          = { name: localName(m[3]), attrs, children: [], text: '' };
      top.children.push(node);
      if (m[5] !== '/') stack.push(node);
    }
  }
  return root;
}

function* walk(n         )                     {
  yield n;
  for (const c of n.children) yield* walk(c);
}

const textOf = (n         )         => (n.text + n.children.map(textOf).join('')).trim();

export function parseXmlTable(xml        )                        {
  const root = parseXmlTree(xml);

  // 1) XML Spreadsheet
  const table = [...walk(root)].find((n) => n.name === 'Table' && n.children.some((c) => c.name === 'Row'));
  if (table) {
    const rows                        = [];
    for (const r of table.children.filter((c) => c.name === 'Row')) {
      const row                      = [];
      for (const cell of r.children.filter((c) => c.name === 'Cell')) {
        if (cell.attrs.Index) row.length = Math.max(row.length, +cell.attrs.Index - 1);
        const data = cell.children.find((c) => c.name === 'Data');
        const v = data ? textOf(data) : '';
        row.push(data?.attrs.Type === 'Number' && v !== '' ? +v : v);
      }
      rows.push(Array.from(row, (x) => x ?? ''));
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  // 2) XML عادي: العنصر اللي بيتكرر أكتر وكل اللي جواه قيم بسيطة
  const counts = new Map                   ();
  for (const n of walk(root)) {
    if (n === root) continue;
    const flat = n.children.every((c) => c.children.length === 0);
    const hasFields = n.children.length > 0 || Object.keys(n.attrs).length > 1;
    if (flat && hasFields) counts.set(n.name, [...(counts.get(n.name) ?? []), n]);
  }
  const records = [...counts.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const columns           = [];
  const recs = records.map((n) => {
    const rec                         = { ...n.attrs };
    for (const c of n.children) rec[c.name] = textOf(c);
    for (const k of Object.keys(rec)) if (!columns.includes(k)) columns.push(k);
    return rec;
  });
  return [columns, ...recs.map((r) => columns.map((c) => r[c] ?? ''))];
}

// ---------- HTML ----------
// برامج كتير (ومنها برامج الحضور) بتصدّر "Excel" وهو في الحقيقة جدول HTML بامتداد .xls أو .html

const htmlText = (s        ) =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** أكبر جدول في الصفحة كصفوف (الجداول المتداخلة بيتاخد الداخلي منها) */
export function parseHtmlTable(html        )             {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const tables = [...clean.matchAll(/<table\b[^>]*>((?:(?!<table\b)[\s\S])*?)<\/table>/gi)].map((t) =>
    [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((tr) => {
        const row           = [];
        for (const td of tr[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
          row.push(htmlText(td[3]));
          const span = Number(td[2].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1);
          for (let i = 1; i < span; i++) row.push('');
        }
        return row;
      })
      .filter((r) => r.some((c) => c !== '')),
  );
  return tables.sort((a, b) => b.length - a.length)[0] ?? [];
}

const looksLikeHtml = (text        ) =>
  /<(!doctype\s+html|html|body|head)\b/i.test(text.slice(0, 4000)) || (/<table\b/i.test(text) && !/<Workbook\b/.test(text));

/** بيقرا الملف حسب محتواه مش امتداده (برامج كتير بتحفظ XML Spreadsheet بامتداد .xls) */
export function readTable(path        )                        {
  return parseTableBuffer(readFileSync(path));
}

export function parseTableBuffer(buf        )                        {
  if (buf[0] === 0x50 && buf[1] === 0x4b) return parseXlsx(buf);
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
    throw new Error('الملف ده Excel قديم (.xls). افتحه واحفظه xlsx، أو صدّره من سوفتك XML.');
  }
  const head = decodeXml(buf.subarray(0, 400)).trimStart();
  if (head.startsWith('<')) {
    const text = decodeXml(buf);
    return looksLikeHtml(text) ? parseHtmlTable(text) : parseXmlTable(text);
  }
  return parseCsv(buf.toString('utf8'));
}
