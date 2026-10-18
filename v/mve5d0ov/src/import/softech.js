// تحويل ملف حركات سوفتك بيزنس لأيام حضور جاهزة للمحرك.
// شكل الملف (على حسب الـ HR): الاسم | in | out | سبب الخروج (راحة / صلاة / انتهاء الشيفت).
// كل صف = فترة واحدة (دخول ← خروج)، والموظف ممكن يبقى ليه كذا صف في اليوم.

                                                                   

                            
                   
               
                          
              
 

                             
               
                
                 
                  
                     
                     
                                              
               
 

/**
 * "خروج غريب": خروج سببه مش صلاة ولا راحة ولا انتهاء شيفت، أو آخر خروج في اليوم مش "انتهاء الشيفت".
 * ده يا استئذان يا مأمورية، واللي بيحدد هو إيميل مدير الفرع (src/import/exits.ts).
 */
                                
                                               
                 
                                                                      
                   
                                                                   
                  
                     
                          
               
 

                           
               
                
                                  
               
                                                            
                    
                     
                    
                   
                                                                         
                      
                                                 
                         
                     
 

// ---------- قراءة القيم ----------

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatinDigits = (s        ) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

export function normalizeArabic(s        )         {
  return toLatinDigits(s)
    .replace(/[ً-ْـ]/g, '') // التشكيل والتطويل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function classifyReason(text        )             {
  const t = normalizeArabic(text ?? '');
  if (/صلا|prayer/.test(t)) return 'prayer';
  if (/راح|استراح|break|rest/.test(t)) return 'break';
  if (/انتهاء|نهايه|انصراف|شيفت|شفت|وردي|end|shift/.test(t)) return 'shiftEnd';
  return 'other';
}

const pad = (n        ) => String(n).padStart(2, '0');
/** وقت للعرض في التنبيهات (13:05) */
const clk = (min        ) => `${pad(Math.floor((((min % 1440) + 1440) % 1440) / 60))}:${pad(min % 60)}`;
const isoFromUTC = (ms        ) => new Date(ms).toISOString().slice(0, 10);
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * بيقرا تاريخ ووقت من خلية: رقم إكسيل، أو "2026-10-01 09:05"، أو "01/10/2026 9:05 م".
 * لو الخلية فيها وقت بس، لازم يتبعت التاريخ في defaultDate.
 */
export function parseTimestamp(value         , defaultDate         )                        {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    const days = Math.floor(value);
    const min = Math.round((value - days) * 1440);
    if (days === 0) return defaultDate ? { date: defaultDate, min } : undefined;
    return { date: isoFromUTC(EXCEL_EPOCH + days * 86_400_000), min };
  }
  let s = toLatinDigits(String(value)).trim();
  let date = defaultDate;
  const ymdMatch = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const dmyMatch = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (ymdMatch) {
    date = `${ymdMatch[1]}-${pad(+ymdMatch[2])}-${pad(+ymdMatch[3])}`;
    s = s.replace(ymdMatch[0], '');
  } else if (dmyMatch) {
    // في مصر التاريخ يوم/شهر/سنة
    date = `${dmyMatch[3]}-${pad(+dmyMatch[2])}-${pad(+dmyMatch[1])}`;
    s = s.replace(dmyMatch[0], '');
  }
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|ص|م)?/i);
  if (!t || !date) return undefined;
  let h = +t[1];
  const suffix = t[4]?.toLowerCase();
  if ((suffix === 'pm' || suffix === 'م') && h < 12) h += 12;
  if ((suffix === 'am' || suffix === 'ص') && h === 12) h = 0;
  return { date, min: h * 60 + +t[2] + (t[3] ? Math.round(+t[3] / 60) : 0) };
}

/** بيقرا تاريخ لوحده (من غير وقت): رقم إكسيل، أو "2026-10-01"، أو "01/10/2026" */
export function parseDate(value         )                     {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value >= 1 ? isoFromUTC(EXCEL_EPOCH + Math.floor(value) * 86_400_000) : undefined;
  const s = toLatinDigits(String(value)).trim();
  const ymd = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${pad(+ymd[2])}-${pad(+ymd[3])}`;
  const dmy = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) return `${dmy[3]}-${pad(+dmy[2])}-${pad(+dmy[1])}`;
  return undefined;
}


// ---------- الأعمدة ----------

const HEADERS                                                                     = {
  name: /^(الاسم|اسم|اسم الموظف|name|employee|emp name|employee name|full name|user name)$/,
  in: /^(in|دخول|الدخول|حضور|الحضور|وقت الدخول|time in|check in|clock in|in time|checkin)$/,
  out: /^(out|خروج|الخروج|انصراف|الانصراف|وقت الخروج|time out|check out|clock out|out time|checkout)$/,
  reason: /(سبب|reason|cause)/,
  date: /^(التاريخ|تاريخ|date|اليوم|day|work date|att date|attendance date)$/,
  code: /^(الكود|كود|code|id|رقم الموظف|الرقم|emp id|employee id|emp code|employee code|emp no)$/,
};

/** عناوين XML بتيجي زي EmpName أو Time_In، فبنفصلها لكلمات */
const normalizeHeader = (s        ) =>
  normalizeArabic(s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' '));

// ---------- تقرير "حضور و إنصراف العاملين" (حركة في كل صف) ----------
// ده الشكل اللي سوفتك بيطلّعه فعلًا (htm): كل صف حركة واحدة IN أو OUT، بتاريخها الحقيقي (مش تاريخ بداية الشيفت)،
// وسبب الخروج على صف الـ OUT، واسم الموظف وكوده. الاسم بيتكرر مخفي في صفوف نفس الموظف.

const EVENT_HEADERS = {
  io: /^in ?\/ ?out$/,
  time: /^(الساعه|الوقت|time)$/,
  date: /^(اليوم|التاريخ|date)$/,
  name: /^(الموظف|اسم الموظف|الاسم|employee|name)$/,
  reason: /(سبب|reason)/,
};

function eventsToRows(table             )                                                                                {
  const headerIdx = table.slice(0, 20).findIndex((r) => r.some((c) => EVENT_HEADERS.io.test(normalizeHeader(String(c ?? '')))));
  if (headerIdx < 0) return null;
  const header = table[headerIdx].map((c) => normalizeHeader(String(c ?? '')));
  const find = (re        ) => header.findIndex((h) => re.test(h));
  const col = { io: find(EVENT_HEADERS.io), time: find(EVENT_HEADERS.time), date: find(EVENT_HEADERS.date), name: find(EVENT_HEADERS.name), reason: find(EVENT_HEADERS.reason) };
  if (col.time < 0 || col.date < 0 || col.name < 0) return null;
  const warnings           = [];
  const data = table.slice(headerIdx + 1).map((r, i) => ({ r, line: headerIdx + 2 + i }))
    .filter(({ r }) => /^(in|out)$/i.test(String(r[col.io] ?? '').trim()));
  // الكود: عمود كله أرقام بعد عمود الاسم (عنوانه مدموج مع الاسم)
  let codeCol = -1;
  for (let c = col.name + 1; c < header.length && codeCol < 0; c++) {
    const vals = data.map(({ r }) => String(r[c] ?? '').trim()).filter(Boolean);
    if (vals.length >= data.length * 0.9 && vals.every((v) => /^\d+$/.test(v))) codeCol = c;
  }

                                                                                                               
  const events       = [];
  for (const { r, line } of data) {
    const date = parseDate(r[col.date]);
    const at = date ? parseTimestamp(r[col.time], date) : undefined;
    if (!at) {
      warnings.push(`مش قادر أقرا الوقت "${r[col.time]}" أو التاريخ "${r[col.date]}"`);
      continue;
    }
    events.push({
      name: String(r[col.name] ?? '').trim(), code: codeCol >= 0 ? String(r[codeCol]).trim() : undefined, at, line,
      io: String(r[col.io]).trim().toLowerCase()                , reasonText: col.reason >= 0 ? String(r[col.reason] ?? '').trim().replace(/\s+/g, ' ') : '',
    });
  }
  if (!events.length) return { rows: [], warnings, from: undefined, to: undefined };

  // كل دخول مع الخروج اللي بعده = صف (فترة)، لكل موظف بترتيب الوقت
  const abs = (t           ) => Date.parse(t.date) / 60_000 + t.min;
  const byEmp = new Map              ();
  for (const e of events) {
    const k = e.code ?? normalizeArabic(e.name);
    (byEmp.get(k) ?? byEmp.set(k, []).get(k) ).push(e);
  }
  const rows               = [];
  for (const list of byEmp.values()) {
    list.sort((a, b) => abs(a.at) - abs(b.at) || a.line - b.line);
    const name = list.find((e) => e.name)?.name ?? '';
    let pending                ;
    for (const e of list) {
      if (e.io === 'in') {
        if (pending) rows.push({ name, code: pending.code, in: pending.at, reason: 'other', reasonText: '', line: pending.line });
        pending = e;
      } else {
        rows.push({ name, code: e.code, in: pending?.at, out: e.at, reason: classifyReason(e.reasonText), reasonText: e.reasonText, line: e.line });
        pending = undefined;
      }
    }
    if (pending) rows.push({ name, code: pending.code, in: pending.at, reason: 'other', reasonText: '', line: pending.line });
  }
  const dates = events.map((e) => e.at.date).sort();
  return { rows, warnings, from: dates[0], to: dates.at(-1) };
}

/** بيحوّل صفوف الملف (أول صف عناوين) لحركات. لو مفيش عناوين معروفة بيفترض الترتيب: الاسم، in، out، السبب */
export function rowsToSoftech(table             )                                                                                           {
  const ev = eventsToRows(table);
  if (ev) return { ...ev, events: true };
  const warnings           = [];
  // سطر العناوين: أول سطر فيه الاسم والدخول والخروج، في أول 10 سطور (الملفات بيبقى فوقها عنوان التقرير والتاريخ)
  const columnsOf = (row            = []) => {
    const header = row.map((c) => normalizeHeader(String(c ?? '')));
    const col                                                = {};
    for (const [key, re] of Object.entries(HEADERS)                                    ) {
      const i = header.findIndex((h) => re.test(h));
      if (i >= 0) col[key] = i;
    }
    return col;
  };
  let headerIdx = table.slice(0, 10).findIndex((r) => {
    const c = columnsOf(r);
    return c.name !== undefined && c.in !== undefined && c.out !== undefined;
  });
  const hasHeader = headerIdx >= 0;
  if (!hasHeader) headerIdx = 0;
  const col = columnsOf(table[headerIdx]);
  if (!hasHeader) {
    Object.assign(col, { name: 0, in: 1, out: 2, reason: 3 });
    warnings.push('مالقيتش عناوين الأعمدة، فافترضت الترتيب: الاسم، in، out، سبب الخروج');
  }

  // سوفتك بيكتب تاريخ بداية الشيفت على كل صفوفه، حتى اللي بعد نص الليل.
  // فلكل موظف في نفس التاريخ (بترتيب الملف): لو الوقت رجع لورا يبقى عدّى نص الليل.
  const lastMinByDay = new Map                ();
  const continueClock = (key        , t                       ) => {
    if (!t) return t;
    const last = lastMinByDay.get(key);
    let min = t.min;
    while (last !== undefined && min < last) min += 1440;
    lastMinByDay.set(key, min);
    return { date: t.date, min };
  };

  const rows               = [];
  table.slice(hasHeader ? headerIdx + 1 : 0).forEach((r, i) => {
    const line = i + (hasHeader ? headerIdx + 2 : 1);
    const name = String(r[col.name ] ?? '').trim();
    if (!name) return;
    const dateCell = col.date !== undefined ? parseDate(r[col.date]) : undefined;
    if (col.date !== undefined && r[col.date] && !dateCell) warnings.push(`مش قادر أقرا التاريخ "${r[col.date]}"`);
    let tin = parseTimestamp(r[col.in ], dateCell);
    let tout = parseTimestamp(r[col.out ], dateCell);
    if (r[col.in ] && !tin) warnings.push(`مش قادر أقرا وقت الدخول "${r[col.in ]}"`);
    if (r[col.out ] && !tout) warnings.push(`مش قادر أقرا وقت الخروج "${r[col.out ]}"`);
    if (dateCell) {
      const key = `${normalizeArabic(name)}|${dateCell}`;
      tin = continueClock(key, tin);
      tout = continueClock(key, tout);
    }
    const reasonText = col.reason !== undefined ? String(r[col.reason] ?? '').trim() : '';
    rows.push({
      name, line, in: tin, out: tout, reasonText,
      reason: classifyReason(reasonText),
      code: col.code !== undefined ? String(r[col.code] ?? '').trim() || undefined : undefined,
    });
  });
  return { rows, warnings };
}

// ---------- تجميع الأيام ----------

const DAY_MS = 86_400_000;
const dayDiff = (a        , b        ) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
/** لو بين خروج ودخول أكتر من كده، يبقى ده شيفت جديد حتى لو سبب الخروج مش "انتهاء الشيفت" */
const NEW_SHIFT_GAP_MIN = 6 * 60;
/** "انتهاء العمل" وبعده دخول في خلال المدة دي يبقى غلطة في اختيار السبب، والشيفت مكمّل */
const MIS_PRESS_GAP_MIN = 15;

                                  
     
                                                                       
                                                                                
     
                                                                                                    
                                                                                              
                                
 

/** بيجمّع الحركات لأيام: يوم لكل موظف لكل شيفت، وبيحسب وقت الصلاة والراحة من الفرق بين الخروج والرجوع */
export function buildPunchDays(rows              , options                  = {})             {
  const cutoff = options.previousDayCutoffMin ?? 6 * 60;
  const isPreviousDay = options.belongsToPreviousDay ?? ((_k        , _d        , firstInMin        ) => firstInMin < cutoff);
  const byEmployee = new Map                      ();
  for (const r of rows) {
    const key = r.code ?? normalizeArabic(r.name);
    (byEmployee.get(key) ?? byEmployee.set(key, []).get(key) ).push(r);
  }

  const abs = (t           ) => Date.parse(t.date) / 60_000 + t.min;
  const days             = [];

  for (const [key, list] of byEmployee) {
    list.sort((a, b) => abs((a.in ?? a.out) ) - abs((b.in ?? b.out) ));
    let cur                                                  ;

    const rel = (t           , base        ) => t.min + dayDiff(base, t.date) * 1440;
    const close = () => {
      if (!cur) return;
      const { day, last } = cur;
      if (last?.out) day.actualOut = rel(last.out, day.date);
      else day.warnings.push('مفيش خروج في آخر الشيفت');
      if (last?.out && last.reason !== 'shiftEnd') {
        day.exits.push({ outMin: day.actualOut , minutes: 0, reasonText: last.reasonText, line: last.line });
        day.warnings.push(`آخر خروج الساعة ${clk(day.actualOut )} سببه "${last.reasonText || 'فاضي'}" مش انتهاء الشيفت`);
      }
      days.push(day);
      cur = undefined;
    };

    for (const r of list) {
      if (!r.in && !r.out) continue;
      // "انتهاء العمل" وبعده دخول على طول (بيحصل لما الموظف يدوس السبب الغلط) يبقى نفس الشيفت مكمّل
      const misPress = cur?.last?.reason === 'shiftEnd' && cur.last.out && r.in && abs(r.in) - abs(cur.last.out) <= MIS_PRESS_GAP_MIN;
      const startsNew =
        !cur ||
        (cur.last?.reason === 'shiftEnd' && !misPress) ||
        !cur.last?.out ||
        (r.in && abs(r.in) - abs(cur.last.out) > NEW_SHIFT_GAP_MIN);
      if (startsNew) {
        close();
        const first = (r.in ?? r.out) ;
        // التاريخ الميلادي الحقيقي لأول دخول (بعد ما الوقت يعدّي نص الليل)
        const calDate = isoFromUTC(Date.parse(first.date) + Math.floor(first.min / 1440) * DAY_MS);
        const clock = first.min % 1440;
        const date = r.in && isPreviousDay(key, calDate, clock) ? isoFromUTC(Date.parse(calDate) - DAY_MS) : calDate;
        cur = {
          day: { name: r.name, code: r.code, date, prayerMin: 0, breakMin: 0, otherOutMin: 0, exits: [], warnings: [] },
        };
        if (r.in) cur.day.actualIn = rel(r.in, date);
        else cur.day.warnings.push('مفيش دخول');
      } else if (cur && cur.last?.out && r.in) {
        // رجوع بعد خروج في نص الشيفت
        const gap = abs(r.in) - abs(cur.last.out);
        const reason = cur.last.reason;
        if (reason === 'prayer') cur.day.prayerMin += gap;
        else if (reason === 'break') cur.day.breakMin += gap;
        else if (gap === 0) {
          // خرج ورجع في نفس الدقيقة: غلطة في الجهاز، مش خروج
        } else {
          cur.day.otherOutMin += gap;
          cur.day.exits.push({
            outMin: rel(cur.last.out, cur.day.date), backMin: rel(r.in, cur.day.date),
            minutes: gap, reasonText: cur.last.reasonText, line: cur.last.line,
          });
          cur.day.warnings.push(`خروج ${gap} دقيقة الساعة ${clk(rel(cur.last.out, cur.day.date))} بسبب "${cur.last.reasonText || 'فاضي'}"`);
        }
      }
      cur .last = r;
    }
    close();
  }
  return days.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

// ---------- ربط الأسامي بالموظفين ----------

                              
               
               
 

/**
 * بيربط الاسم اللي في سوفتك بكود الموظف. سوفتك بيطلّع الاسم بس، فـ:
 * 1) جدول الربط اللي الـ HR حفظه قبل كده (aliases) ليه الأولوية.
 * 2) بعده الاسم بالظبط بعد توحيد الحروف، أو الاسم الكامل اللي بيبدأ باسم سوفتك.
 * الأسامي المتكررة بتطلع في ambiguous، والـ HR يربطها بالإيد مرة واحدة وتتحفظ في aliases.
 */
export function matchEmployees(names          , directory               , aliases                         = {}) {
  const saved = new Map(Object.entries(aliases).map(([n, code]) => [normalizeArabic(n), code]));
  const index = new Map                       ();
  for (const e of directory) {
    const k = normalizeArabic(e.name);
    index.set(k, [...(index.get(k) ?? []), e]);
  }
  const matched = new Map                ();
  const unmatched           = [];
  const ambiguous           = [];
  for (const n of new Set(names)) {
    const k = normalizeArabic(n);
    if (saved.has(k)) {
      matched.set(n, saved.get(k) );
      continue;
    }
    let hits = index.get(k);
    // لو الاسم في سوفتك أقصر (مثلًا اسمين بس)، دوّر على اللي بيبدأ بيه
    if (!hits) hits = directory.filter((e) => normalizeArabic(e.name).startsWith(k + ' '));
    if (hits.length === 1) matched.set(n, hits[0].code);
    else if (hits.length > 1) ambiguous.push(n);
    else unmatched.push(n);
  }
  return { matched, unmatched, ambiguous };
}
