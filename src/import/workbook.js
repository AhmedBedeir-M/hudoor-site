// قراءة ملف Excel كامل (كل الشيتات) بقيم الخانات، ومعرفة الخانة فيها معادلة ولا متكتبة بالإيد.
// بيستخدمه استيراد شيت الفرع (branch-sheet.ts).
import { unzip, xmlText } from './table.js';

                       
                                           
                           
             
 

                                      

export function parseWorkbook(buf        )                     {
  const files = unzip(buf);
  const text = (name        ) => files.get(name)?.toString('utf8') ?? '';
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
  const rels = new Map(
    [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*>/g)].map((m) => [
      m[0].match(/Id="([^"]+)"/) [1],
      m[0].match(/Target="([^"]+)"/) [1],
    ]),
  );
  const sheets = new Map               ();
  for (const m of text('xl/workbook.xml').matchAll(/<sheet [^>]*>/g)) {
    const name = xmlText(m[0].match(/name="([^"]+)"/) [1]);
    const target = rels.get(m[0].match(/r:id="([^"]+)"/) [1]);
    if (!target) continue;
    const path = 'xl/' + target.replace(/^\/?xl\//, '');
    const sheet        = new Map();
    for (const c of text(path).matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const addr = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      if (!addr) continue;
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const body = c[2] ?? '';
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      const f = /<f[\s>]/.test(body);
      if (raw === undefined && !f) continue;
      let v           ;
      if (raw !== undefined) {
        if (type === 's') v = shared[+raw];
        else if (type === 'str' || type === 'inlineStr') v = xmlText(raw);
        else if (type === 'b') v = raw === '1';
        else if (type === 'e') v = undefined;
        else v = +raw;
      }
      sheet.set(addr, { v, f });
    }
    sheets.set(name, sheet);
  }
  return sheets;
}
