// منطق البرنامج: بيربط قاعدة البيانات بالمحرك والاستيراد والتقرير.
// كل دالة هنا بتفترض إن الصلاحيات اتراجعت قبلها (في http.ts).
import { computeDay } from '../engine/attendance.js';
import { computeMonthLeave, isNewHire,                                    } from '../engine/leave.js';
import { payrollPeriod } from '../engine/month.js';
import { DEFAULT_POLICY } from '../engine/policy.js';
import { scheduleFor, shiftOn,                                                              } from '../engine/schedule.js';
import { LEAVE_TYPES,                                                                } from '../engine/types.js';
import { toDayInput,                                  } from '../import/exits.js';
import { buildPunchDays, matchEmployees, normalizeArabic, parseDate, rowsToSoftech,                                } from '../import/softech.js';
import { parseTableBuffer } from '../import/table.js';
import { buildDeductionRow,                                            } from '../report/deductions.js';
import { audit, tx,         } from './db.js';
                                      

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export class HttpError extends Error {
  status        ;
  constructor(status        , message        ) {
    super(message);
    this.status = status;
  }
}

// ---------- الفروع والموظفين ----------

                           
               
               
                    
               
                        
                           
                               
                                  
                                          
                              
                     
                      
                    
                            
                     
                   
                                
                                                                      
                               
                 
 

export const listBranches = (db    ) => db.prepare('select id, name from branches order by name').all();

export function createBranch(db    , user      , name        ) {
  if (!name?.trim()) throw new HttpError(400, 'اسم الفرع مطلوب');
  const r = db.prepare('insert into branches (name) values (?)').run(name.trim());
  audit(db, user.id, 'branch.create', { name });
  return { id: Number(r.lastInsertRowid), name: name.trim() };
}

export const getEmployee = (db    , code        ) =>
  db.prepare('select * from employees where code = ?').get(code)                        ;

                             
                        
                    
                    
                         
 

const OPEN_END = '9999-12-31';
const addDays = (date        , n        ) => new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);

export const assignmentsOf = (db    , code        ) =>
  db.prepare('select * from employee_branches where employee_code = ? order by date_from').all(code)                           ;

/** الفرع اللي الموظف كان فيه في يوم معيّن */
export function branchOn(db    , code        , date        )                     {
  const r = db.prepare(
    `select branch_id from employee_branches where employee_code = ? and date_from <= ? and coalesce(date_to, '${OPEN_END}') >= ?`,
  ).get(code, date, date)                                     ;
  return r?.branch_id;
}

/** الموظف كان في الفرع ده في أي وقت؟ (مدير الفرع القديم بيشوف أيامه اللي قبل النقل) */
export const wasInBranch = (db    , code        , branchId        ) =>
  !!db.prepare('select 1 from employee_branches where employee_code = ? and branch_id = ? limit 1').get(code, branchId);

/** الفترات اللي الموظف كان فيها في الفرع ده، جوه [from, to] */
export function branchWindows(db    , code        , branchId        , from        , to        ) {
  return assignmentsOf(db, code)
    .filter((a) => a.branch_id === branchId && a.date_from <= to && (a.date_to ?? OPEN_END) >= from)
    .map((a) => ({ from: a.date_from > from ? a.date_from : from, to: (a.date_to ?? OPEN_END) < to ? a.date_to  : to }));
}

/**
 * موظفين الفرع: الحاليين، ومعاهم اللي كانوا فيه خلال الفترة واتنقلوا منه (left_on = آخر يوم ليهم في الفرع).
 * من غير فترة بيرجّع كل اللي كانوا في الفرع في أي وقت.
 */
export function listEmployees(db    , branchId        , from = '0000-01-01', to = OPEN_END) {
  return db.prepare(
    `select e.*, case when e.branch_id = ? then null
       else (select max(date_to) from employee_branches x where x.employee_code = e.code and x.branch_id = ?) end as left_on
     from employees e
     where e.branch_id = ? or exists (select 1 from employee_branches x where x.employee_code = e.code and x.branch_id = ?
       and x.date_from <= ? and coalesce(x.date_to, '${OPEN_END}') >= ?)
     order by e.active desc, e.name`,
  ).all(branchId, branchId, branchId, branchId, to, from)                                                        ;
}

const EMPLOYEE_FIELDS = [
  'name', 'branch_id', 'role', 'gender', 'hire_date', 'transfer_date', 'resignation_date', 'incentive_on_resignation',
  'expat_status', 'method', 'shift_start', 'shift_end', 'weekly_off', 'late_grace', 'handover', 'contract_hours', 'monthly_hours', 'active',
]         ;

export function saveEmployee(db    , user      , e                                      ) {
  if (!e.code?.toString().trim()) throw new HttpError(400, 'كود الموظف مطلوب');
  const code = String(e.code).trim();
  const existing = getEmployee(db, code);
  if (!existing && (!e.name || !e.branch_id)) throw new HttpError(400, 'اسم الموظف والفرع مطلوبين');
  if (existing && e.branch_id !== undefined && Number(e.branch_id) !== existing.branch_id) {
    throw new HttpError(400, 'تغيير الفرع بيتعمل من "نقل لفرع تاني" عشان تاريخ الموظف يتحفظ');
  }
  const defaults = { method: 'attendance', shift_start: 540, shift_end: 1020, late_grace: 1, handover: 0, active: 1, role: '' };
  const given = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined));
  const merged = { ...defaults, ...existing, ...given, code }            ;
  // المدير الجديد بيتحاسب بساعات الشهر من الأول
  if (!existing && given.monthly_hours === undefined && String(merged.role ?? '').trim() === MANAGER_ROLE) merged.monthly_hours = MANAGER_MONTHLY_HOURS;
  if (merged.shift_end <= merged.shift_start) throw new HttpError(400, 'نهاية الشيفت لازم تبقى بعد بدايته');
  const values = EMPLOYEE_FIELDS.map((f) =>
    f === 'role' ? String(merged.role ?? '').trim() : merged[f] === undefined || merged[f] === '' ? null : merged[f],
  );
  db.prepare(
    `insert into employees (code, ${EMPLOYEE_FIELDS.join(', ')}) values (?, ${EMPLOYEE_FIELDS.map(() => '?').join(', ')})
     on conflict (code) do update set ${EMPLOYEE_FIELDS.map((f) => `${f} = excluded.${f}`).join(', ')}`,
  ).run(code, ...values);
  // أول فرع للموظف بيبدأ من الأول، والتعيين نفسه بيتحسب من تاريخ التعيين
  if (!existing) db.prepare(`insert into employee_branches (employee_code, branch_id, date_from) values (?, ?, '2000-01-01')`).run(code, merged.branch_id);
  audit(db, user.id, existing ? 'employee.update' : 'employee.create', { code });
  return getEmployee(db, code);
}

export const MANAGER_ROLE = 'مدير';
export const MANAGER_MONTHLY_HOURS = 260;

/** الوظايف اللي عليها تسليم شيفت 15 دقيقة */
const HANDOVER_ROLES = ['كاشير', 'صيدلى', 'صيدلي', 'بيع', 'كول سنتر'];

/** استيراد الموظفين من ملف (زي شيت "بيانات العاملين"). الموجود بيتحدّث، ومواعيد الشيفت مش بتتغيّر */
export function importEmployees(db    , user      , branchId        , buf        ) {
  const table = parseTableBuffer(buf);
  const headerRow = table.findIndex((r) => r.some((c) => /^(الكود|كود|code)$/.test(normalizeArabic(String(c)))));
  if (headerRow < 0) throw new HttpError(400, 'مالقيتش عمود "الكود" في الملف');
  const header = table[headerRow].map((c) => normalizeArabic(String(c)));
  const col = (...names          ) => header.findIndex((h) => names.some((n) => h === normalizeArabic(n)));
  const c = {
    code: col('الكود', 'كود', 'code'),
    name: col('اسم الموظف', 'الاسم', 'الاســــــــــم', 'name'),
    role: col('الوظيفه', 'الوظيفة'),
    gender: col('النوع'),
    hire: col('تاريخ تعين', 'تاريخ التعيين'),
    expat: col('فى حالة التعيين فى فرع خارجى', 'في حالة التعيين في فرع خارجي'),
  };
  if (c.name < 0) throw new HttpError(400, 'مالقيتش عمود "اسم الموظف" في الملف');
  let created = 0, updated = 0;
  const otherBranch           = [];
  tx(db, () => {
    for (const r of table.slice(headerRow + 1)) {
      const code = String(r[c.code] ?? '').trim().replace(/\.0+$/, '');
      const name = String(r[c.name] ?? '').trim();
      if (!code || !name) continue;
      const role = c.role >= 0 ? String(r[c.role] ?? '').trim() : '';
      const existing = getEmployee(db, code);
      if (existing && existing.branch_id !== branchId) {
        otherBranch.push(`${name} (${code})`);
        continue;
      }
      saveEmployee(db, user, {
        code, name, branch_id: branchId, role,
        gender: c.gender >= 0 ? String(r[c.gender] ?? '').trim() || null : existing?.gender ?? null,
        hire_date: c.hire >= 0 ? parseDate(r[c.hire]) ?? null : existing?.hire_date ?? null,
        expat_status: c.expat >= 0 ? String(r[c.expat] ?? '').trim() || null : existing?.expat_status ?? null,
        ...(existing ? {} : { handover: HANDOVER_ROLES.some((x) => role.includes(x)) ? 1 : 0 }),
      });
      existing ? updated++ : created++;
    }
  });
  // الموظف اللي في فرع تاني مش بيتنقل من الاستيراد، النقل ليه شاشة لوحده
  return { created, updated, otherBranch };
}

// ---------- النقل من فرع لفرع ----------

                                  
                       
                                
               
                                         
                              
                            
                              
                             
 

export function transferEmployee(db    , user      , code        , t                 ) {
  const e = getEmployee(db, code);
  if (!e) throw new HttpError(404, 'الموظف مش موجود');
  const to = Number(t.to_branch_id);
  const toBranch = db.prepare('select name from branches where id = ?').get(to)                                ;
  if (!toBranch) throw new HttpError(400, 'الفرع مش موجود');
  if (to === e.branch_id) throw new HttpError(400, 'الموظف في الفرع ده أصلًا');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date))) throw new HttpError(400, 'تاريخ النقل مطلوب');
  const current = assignmentsOf(db, code).find((a) => a.date_to === null) ;
  if (t.date <= current.date_from) throw new HttpError(400, `تاريخ النقل لازم يبقى بعد ${current.date_from} (بداية فرعه الحالي)`);
  if ((t.shift_start == null) !== (t.shift_end == null)) throw new HttpError(400, 'لازم بداية ونهاية الشيفت الجديد مع بعض');
  if (t.shift_start != null && t.shift_end  <= t.shift_start) throw new HttpError(400, 'نهاية الشيفت لازم تبقى بعد بدايته');

  tx(db, () => {
    db.prepare('update employee_branches set date_to = ? where employee_code = ? and date_from = ?').run(addDays(t.date, -1), code, current.date_from);
    db.prepare('insert into employee_branches (employee_code, branch_id, date_from) values (?, ?, ?)').run(code, to, t.date);
    db.prepare('update employees set branch_id = ?, transfer_date = ? where code = ?').run(to, t.date, code);
    // الشيفت أو الإجازة الأسبوعية الجديدة بيتسجّلوا تغيير حالة دائم معتمد من يوم النقل
    if (t.shift_start != null || t.change_weekly_off) {
      db.prepare(
        `insert into shift_changes (employee_code, kind, date_from, shift_start, shift_end, change_weekly_off, weekly_off, note, status, requested_by, decided_by)
         values (?, 'permanent', ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
      ).run(code, t.date, t.shift_start ?? null, t.shift_end ?? null, t.change_weekly_off ? 1 : 0, t.weekly_off ?? null,
        `نقل لفرع ${toBranch.name}`, user.id, user.id);
    }
  });
  audit(db, user.id, 'employee.transfer', { code, from: e.branch_id, to, date: t.date });
  return { ok: true };
}

// ---------- الورديات وطلبات تغيير الحالة ----------

                          
                                                                                                                
                                                                                                             
                                      
 

function baseSchedule(e          )                   {
  return {
    shift: { startMin: e.shift_start, endMin: e.shift_end },
    weeklyOff: (e.weekly_off ?? null)                  ,
    lateGrace: !!e.late_grace,
    handover: !!e.handover,
  };
}

function approvedChanges(db    , code        )                       {
  const rows = db.prepare(`select * from shift_changes where employee_code = ? and status = 'approved'`).all(code)                               ;
  return rows.map((r) => ({
    kind: r.kind, from: r.date_from, to: r.date_to ?? undefined, approved: true,
    shift: r.shift_start !== null && r.shift_end !== null ? { startMin: r.shift_start, endMin: r.shift_end } : undefined,
    weeklyOff: r.change_weekly_off ? ((r.weekly_off ?? null)                  ) : undefined,
  }));
}

export function listShiftChanges(db    , branchId        ) {
  return db.prepare(
    `select c.*, e.name as employee_name, u.name as requested_by_name from shift_changes c
     join employees e on e.code = c.employee_code left join users u on u.id = c.requested_by
     where e.branch_id = ? order by c.status = 'pending' desc, c.created_at desc`,
  ).all(branchId);
}

export function requestShiftChange(db    , user      , r                                       ) {
  if (!r.date_from) throw new HttpError(400, 'تاريخ البداية مطلوب');
  if (r.kind === 'temporary' && !r.date_to) throw new HttpError(400, 'التغيير المؤقت لازم يبقى ليه تاريخ نهاية');
  if ((r.shift_start === null) !== (r.shift_end === null)) throw new HttpError(400, 'لازم بداية ونهاية الشيفت الجديد مع بعض');
  if (r.shift_start === null && !r.change_weekly_off) throw new HttpError(400, 'الطلب مافيهوش أي تغيير');
  // الـ HR بيعتمد طلبه على طول، وطلب مدير الفرع بيستنى الـ HR
  const status = user.role === 'hr' ? 'approved' : 'pending';
  const res = db.prepare(
    `insert into shift_changes (employee_code, kind, date_from, date_to, shift_start, shift_end, change_weekly_off, weekly_off, note, status, requested_by, decided_by)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.employee_code, r.kind, r.date_from, r.date_to ?? null, r.shift_start, r.shift_end, r.change_weekly_off ? 1 : 0,
    r.weekly_off ?? null, r.note ?? null, status, user.id, user.role === 'hr' ? user.id : null);
  audit(db, user.id, 'shiftChange.request', r);
  return { id: Number(res.lastInsertRowid), status };
}

export function decideShiftChange(db    , user      , id        , approve         ) {
  db.prepare(`update shift_changes set status = ?, decided_by = ? where id = ? and status = 'pending'`)
    .run(approve ? 'approved' : 'rejected', user.id, id);
  audit(db, user.id, approve ? 'shiftChange.approve' : 'shiftChange.reject', { id });
}

export const shiftChangeEmployeeCode = (db    , id        ) =>
  (db.prepare('select employee_code from shift_changes where id = ?').get(id)                                         )?.employee_code;

// ---------- استيراد سوفتك ----------

export function uploadSoftech(db    , user      , branchId        , fileName        , buf        ) {
  const table = parseTableBuffer(buf);
  if (table.length < 2) throw new HttpError(400, 'الملف فاضي أو مش مقروء');
  const r = db.prepare('insert into imports (branch_id, file_name, raw, created_by) values (?, ?, ?, ?)')
    .run(branchId, fileName, JSON.stringify(table), user.id);
  return processImport(db, user, Number(r.lastInsertRowid));
}

export function importBranch(db    , importId        ) {
  return (db.prepare('select branch_id from imports where id = ?').get(importId)                                     )?.branch_id;
}

/** بيعالج ملف سوفتك (أول مرة، أو تاني مرة بعد ربط الأسامي) */
export function processImport(db    , user      , importId        ) {
  const imp = db.prepare('select * from imports where id = ?').get(importId)                                                         ;
  const { rows, warnings, events, from } = rowsToSoftech(JSON.parse(imp.raw));
  // الموظفين اللي كانوا في الفرع في أي وقت، وكل يوم بيتسجّل بس لو الموظف كان في الفرع ده يومها
  const employees = listEmployees(db, imp.branch_id);
  const byCode = new Map(employees.map((e) => [e.code, e]));
  const aliases = Object.fromEntries(
    (db.prepare('select softech_name, employee_code from name_aliases where branch_id = ?').all(imp.branch_id)                                                     )
      .map((a) => [a.softech_name, a.employee_code]),
  );
  // لو الملف فيه كود الموظف ومعروف عندنا، بيتربط بالكود على طول. الباقي بالاسم
  const byFileCode = (r            ) => (r.code && byCode.has(r.code) ? r.code : undefined);
  const { matched, unmatched, ambiguous } = matchEmployees(rows.filter((r) => !byFileCode(r)).map((r) => r.name), employees, aliases);
  // اسمين مختلفين في سوفتك مربوطين بنفس الموظف: بصماتهم بتتجمع كأنها شخص واحد، فلازم الـ HR يعرف
  const namesByCode = new Map                  ();
  for (const [name, code] of matched) namesByCode.set(code, [...(namesByCode.get(code) ?? []), name]);
  for (const [code, names] of namesByCode) {
    if (names.length < 2) continue;
    const who = byCode.get(code)?.name ?? code;
    warnings.push(`الأسامي ${names.map((n) => `"${n}"`).join(' و')} مربوطين بنفس الموظف (${who} - ${code})، وبصماتهم اتحسبت كأنها شخص واحد. لو ده غلط، صلّح الربط من "ربط اسم سوفتك" تحت.`);
  }
  const known = rows
    .map((r) => ({ ...r, code: byFileCode(r) ?? matched.get(r.name) }))
    .filter((r)                                     => !!r.code);

  // ملف بالتاريخ الحقيقي بيبدأ نص الليل، فأول حركات فيه ممكن تبقى تكملة شيفت بدأ اليوم اللي قبله:
  // لو اليوم ده متسجل ولسه مالوش خروج، بنكمّله (الدخول من اللي متسجل + الحركات الجديدة).
  // ولو مش متسجل، الحركات دي بتتساب عشان ماتتحسبش "نسي يبصم دخول" غلط.
  const continued = new Map                                                       ();
  const dropLeading = new Set        ();
  if (events && from) {
    const prevDate = addDays(from, -1);
    const absOf = (t                                ) => (t ? Date.parse(t.date) / 60_000 + t.min : Infinity);
    for (const code of new Set(known.map((r) => r.code))) {
      const first = known.filter((r) => r.code === code).sort((a, b) => absOf(a.in ?? a.out) - absOf(b.in ?? b.out))[0];
      if (first.in || !first.out || first.out.date !== from) continue;
      const open = db.prepare('select actual_in, prayer_min, break_min from punch_days where employee_code = ? and date = ? and actual_in is not null and actual_out is null')
        .get(code, prevDate)                                                                            ;
      if (open) {
        first.in = { date: addDays(prevDate, Math.floor(open.actual_in / 1440)), min: open.actual_in % 1440 };
        continued.set(code, { date: prevDate, prayer: open.prayer_min, brk: open.break_min });
      } else dropLeading.add(code);
    }
  }

  // الشيفت اللي بيبدأ بعد نص الليل تبع اليوم اللي قبله
  const changes = new Map                              ();
  // بشرط إن الدخول نفسه يكون في الفجر (لحد 6 ساعات بعد ميعاده، وقبل الضهر):
  // لو الشيفت مكتوب غلط (مثلًا 12 بالليل) والموظف داخل 3 العصر، يفضل في يومه
  const previousDayShift = (code        , calendarDate        , firstInMin        ) => {
    const e = byCode.get(code);
    if (!e) return false;
    if (!changes.has(code)) changes.set(code, approvedChanges(db, code));
    const prev = new Date(Date.parse(calendarDate) - 86_400_000).toISOString().slice(0, 10);
    const start = shiftOn(prev, baseSchedule(e), changes.get(code)).shift.startMin;
    return start >= 1440 && firstInMin < Math.min(start - 1440 + 6 * 60, 12 * 60);
  };
  let built = buildPunchDays(known, { belongsToPreviousDay: previousDayShift });
  for (const d of built) {
    const c = continued.get(d.code );
    if (c && d.date === c.date) {
      d.prayerMin += c.prayer;
      d.breakMin += c.brk;
    }
  }
  const leftovers = built.filter((d) => dropLeading.has(d.code ) && d.actualIn === undefined && d.date === from &&
    built.filter((x) => x.code === d.code).every((x) => x.date >= d.date));
  if (leftovers.length) {
    built = built.filter((d) => !leftovers.includes(d));
    warnings.push(`${leftovers.length} موظف أول حركاتهم في الملف كانت تكملة شيفت بدأ قبل ${from} ومش متسجل عندنا، فالحركات دي اتسابت.`);
  }
  const days = built.filter((d) => branchOn(db, d.code , d.date) === imp.branch_id);
  const otherBranchDays = built.filter((d) => !days.includes(d)).map((d) => ({ code: d.code, name: d.name, date: d.date }));

  tx(db, () => {
    const upsertDay = db.prepare(
      `insert into punch_days (employee_code, date, actual_in, actual_out, prayer_min, break_min, warnings, import_id)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (employee_code, date) do update set actual_in = excluded.actual_in, actual_out = excluded.actual_out,
         prayer_min = excluded.prayer_min, break_min = excluded.break_min, warnings = excluded.warnings, import_id = excluded.import_id`,
    );
    // قرار المدير على الخروج بيفضل محفوظ لو نفس الخروج رجع في ملف تاني
    const upsertExit = db.prepare(
      `insert into exits (employee_code, date, out_min, back_min, minutes, reason_text) values (?, ?, ?, ?, ?, ?)
       on conflict (employee_code, date, out_min) do update set back_min = excluded.back_min, minutes = excluded.minutes, reason_text = excluded.reason_text`,
    );
    const dropStaleExits = db.prepare(`delete from exits where employee_code = ? and date = ? and out_min not in (select value from json_each(?))`);
    for (const d of days) {
      upsertDay.run(d.code , d.date, d.actualIn ?? null, d.actualOut ?? null, d.prayerMin, d.breakMin,
        d.warnings.length ? JSON.stringify(d.warnings) : null, importId);
      for (const e of d.exits) upsertExit.run(d.code , d.date, e.outMin, e.backMin ?? null, e.minutes, e.reasonText);
      // اليوم اللي اتكمّل من ملف قبله: خروجاته القديمة بتفضل
      if (continued.get(d.code )?.date !== d.date) dropStaleExits.run(d.code , d.date, JSON.stringify(d.exits.map((e) => e.outMin)));
    }
    db.prepare('update imports set rows = ?, days = ?, unmatched = ? where id = ?')
      .run(rows.length, days.length, JSON.stringify({ unmatched, ambiguous }), importId);
  });
  audit(db, user.id, 'softech.import', { importId, file: imp.file_name, days: days.length });

  return {
    importId, fileName: imp.file_name, rows: rows.length, days: days.length,
    matchedNames: new Set(known.map((r) => r.code)).size, unmatched, ambiguous, warnings,
    dayWarnings: days.filter((d) => d.warnings.length).map((d) => ({ code: d.code, name: d.name, date: d.date, warnings: d.warnings })),
    exits: days.reduce((n, d) => n + d.exits.length, 0),
    otherBranchDays,
  };
}

export function saveAlias(db    , user      , branchId        , softechName        , code        ) {
  const e = getEmployee(db, code);
  if (!e || !wasInBranch(db, code, branchId)) throw new HttpError(400, 'الموظف مش في الفرع ده');
  db.prepare(
    `insert into name_aliases (branch_id, softech_name, employee_code) values (?, ?, ?)
     on conflict (branch_id, softech_name) do update set employee_code = excluded.employee_code`,
  ).run(branchId, softechName, code);
  audit(db, user.id, 'alias.save', { branchId, softechName, code });
}

export const listImports = (db    , branchId        ) =>
  db.prepare('select id, file_name, rows, days, unmatched, created_at from imports where branch_id = ? order by id desc limit 20').all(branchId);

// ---------- الخروج الغريب ----------

export function listExits(db    , branchId        , year        , month        , pendingOnly         ) {
  const { from, to } = payrollPeriod(year, month);
  return db.prepare(
    `select x.*, e.name as employee_name, u.name as decided_by_name from exits x
     join employees e on e.code = x.employee_code left join users u on u.id = x.decided_by
     join employee_branches eb on eb.employee_code = x.employee_code and eb.branch_id = ?
       and x.date between eb.date_from and coalesce(eb.date_to, '${OPEN_END}')
     where x.date between ? and ? ${pendingOnly ? 'and x.kind is null' : ''}
     order by x.date, e.name, x.out_min`,
  ).all(branchId, from, to);
}

export const exitById = (db    , id        ) =>
  db.prepare('select employee_code, date from exits where id = ?').get(id)                                                       ;

export function decideExit(db    , user      , id        , kind                 ) {
  if (kind !== null && !['permission', 'sickPermission', 'mission'].includes(kind)) throw new HttpError(400, 'نوع غير معروف');
  db.prepare(`update exits set kind = ?, decided_by = ?, decided_at = datetime('now', 'localtime') where id = ?`)
    .run(kind, kind ? user.id : null, id);
  audit(db, user.id, 'exit.decide', { id, kind });
}

// ---------- الإجازات ----------

const DAY_TYPES = [...LEAVE_TYPES, 'mission'];

export function listLeaves(db    , branchId        , year        , month        ) {
  const { from, to } = payrollPeriod(year, month);
  return db.prepare(
    `select l.*, e.name as employee_name from leaves l join employees e on e.code = l.employee_code
     join employee_branches eb on eb.employee_code = l.employee_code and eb.branch_id = ?
       and l.date between eb.date_from and coalesce(eb.date_to, '${OPEN_END}')
     where l.date between ? and ? order by l.date, e.name`,
  ).all(branchId, from, to);
}

/** تسجيل إجازة أو مأمورية يوم كامل لفترة (من ← إلى) */
export function setLeave(db    , user      , code        , from        , to        , type        , note         ) {
  if (!DAY_TYPES.includes(type)) throw new HttpError(400, 'نوع إجازة غير معروف');
  if (!from || !to || to < from) throw new HttpError(400, 'الفترة مش صحيحة');
  const dates           = [];
  for (let d = Date.parse(from); d <= Date.parse(to); d += 86_400_000) dates.push(new Date(d).toISOString().slice(0, 10));
  if (dates.length > 62) throw new HttpError(400, 'الفترة أطول من شهرين');
  const stmt = db.prepare(
    `insert into leaves (employee_code, date, type, note, entered_by) values (?, ?, ?, ?, ?)
     on conflict (employee_code, date) do update set type = excluded.type, note = excluded.note, entered_by = excluded.entered_by`,
  );
  tx(db, () => dates.forEach((d) => stmt.run(code, d, type, note ?? null, user.id)));
  audit(db, user.id, 'leave.set', { code, from, to, type });
  return { days: dates.length };
}

export function deleteLeave(db    , user      , code        , date        ) {
  db.prepare('delete from leaves where employee_code = ? and date = ?').run(code, date);
  audit(db, user.id, 'leave.delete', { code, date });
}

// ---------- بنود الشهر ----------

export function getMonthlyInputs(db    , code        , year        , month        ) {
  const m = db.prepare('select data from monthly_inputs where employee_code = ? and year = ? and month = ?').get(code, year, month)                                ;
  const a = db.prepare('select casual, annual, sick, tenure_override from leave_adjustments where employee_code = ? and year = ? and month = ?').get(code, year, month)   
                                                                                                  ;
  return { manual: (m ? JSON.parse(m.data) : {})                      , adjustment: a ?? { casual: 0, annual: 0, sick: 0, tenure_override: null } };
}

export function saveMonthlyInputs(
  db    , user      , code        , year        , month        ,
  body                                                                                                                                    ,
) {
  tx(db, () => {
    if (body.manual) {
      db.prepare(`insert into monthly_inputs (employee_code, year, month, data) values (?, ?, ?, ?)
                  on conflict (employee_code, year, month) do update set data = excluded.data`).run(code, year, month, JSON.stringify(body.manual));
    }
    if (body.adjustment) {
      const a = body.adjustment;
      if (a.tenure_override && !['new', 'new1', 'new2', 'old1', 'old'].includes(a.tenure_override)) throw new HttpError(400, 'تصنيف غير معروف');
      db.prepare(`insert into leave_adjustments (employee_code, year, month, casual, annual, sick, tenure_override) values (?, ?, ?, ?, ?, ?, ?)
                  on conflict (employee_code, year, month) do update set casual = excluded.casual, annual = excluded.annual, sick = excluded.sick, tenure_override = excluded.tenure_override`)
        .run(code, year, month, +(a.casual ?? 0), +(a.annual ?? 0), +(a.sick ?? 0), a.tenure_override || null);
    }
  });
  audit(db, user.id, 'monthly.save', { code, year, month });
}

// ---------- الحسبة والتقرير ----------

                            
               
                  
                      
                       
                       
                    
                     
                    
                   
                 
                   
                                                                                                                                 
                     
                    
                                                                            
                    
                       
 

function leaveYear(db    , e          , year        , month        )                   {
  let prev                              ;
  const count = db.prepare(`select type, count(*) as n from leaves where employee_code = ? and date between ? and ? and type != 'mission' group by type`);
  for (let m = 1; m <= month; m++) {
    const { from, to } = payrollPeriod(year, m);
    const leaveDays = Object.fromEntries((count.all(e.code, from, to)                                    ).map((r) => [r.type, r.n]));
    const { adjustment } = getMonthlyInputs(db, e.code, year, m);
    prev = computeMonthLeave({
      year, month: m, hireDate: e.hire_date ?? undefined, resignationDate: e.resignation_date ?? undefined,
      transferDate: e.transfer_date ?? undefined, leaveDays,
      adjustment: { casual: adjustment.casual, annual: adjustment.annual, sick: adjustment.sick },
      tenureOverride: (adjustment.tenure_override ?? undefined)                      ,
    }, prev);
  }
  return prev ;
}

/**
 * حسبة شهر لموظف. لو branchId متبعت، الحسبة بتبقى لأيامه في الفرع ده بس، فشهر النقل بيتقسم على الفرعين.
 * بنود الشهر (خصم الإجازات والرصيد والجزاءات والإضافي والبدلات) بتطلع مرة واحدة بس،
 * في الفرع اللي الموظف خلّص فيه الشهر، عشان مايتخصمش مرتين.
 */
export function computeEmployeeMonth(db    , e          , year        , month        , branchId         ) {
  const base = baseSchedule(e);
  const changes = approvedChanges(db, e.code);
  const { from, to, days: dates } = payrollPeriod(year, month);
  const assignments = assignmentsOf(db, e.code);
  const branchOfDate = (date        ) => assignments.find((a) => a.date_from <= date && (a.date_to ?? OPEN_END) >= date)?.branch_id;
  const windows = branchId ? branchWindows(db, e.code, branchId, from, to) : [{ from, to }];
  const inBranch = (date        ) => windows.some((w) => date >= w.from && date <= w.to);
  const lastInPeriod = [...assignments].reverse().find((a) => a.date_from <= to && (a.date_to ?? OPEN_END) >= from);
  const owner = !branchId || lastInPeriod?.branch_id === branchId;

  const punches = new Map((db.prepare('select * from punch_days where employee_code = ? and date between ? and ?').all(e.code, from, to)     
                                                                                                                                      
     ).map((p) => [p.date, p]));
  const exitRows = db.prepare('select * from exits where employee_code = ? and date between ? and ? order by out_min').all(e.code, from, to)     
                                                                                                                                           
     ;
  const leaves = new Map((db.prepare('select date, type from leaves where employee_code = ? and date between ? and ?').all(e.code, from, to)                                    )
    .map((l) => [l.date, l.type]));

  // آخر يوم في بصمات الفرع ممكن يكون لسه شغالين فيه (الملف اتسحب في نص الشيفت)، فالخروج الناقص فيه مش نسيان
  const lastPunchDate = (db.prepare(
    `select max(p.date) d from punch_days p join employees x on x.code = p.employee_code where x.branch_id = ?`,
  ).get(branchId ?? e.branch_id)                        ).d;

  const details              = dates.map((date) => {
    const sched = scheduleFor(date, base, changes, DEFAULT_POLICY);
    const p = punches.get(date);
    const dayExits = exitRows.filter((x) => x.date === date);
    const leaveType = leaves.get(date);
    const mission = leaveType === 'mission';
    const leave = mission ? undefined : (leaveType                         );
    let input          ;
    if (p) {
      const punch           = {
        name: e.name, code: e.code, date, actualIn: p.actual_in ?? undefined, actualOut: p.actual_out ?? undefined,
        prayerMin: p.prayer_min, breakMin: p.break_min, otherOutMin: 0, warnings: [],
        exits: dayExits.map((x) => ({ outMin: x.out_min, backMin: x.back_min ?? undefined, minutes: x.minutes, reasonText: x.reason_text ?? '', line: 0 })),
      };
      const decisions                 = dayExits.filter((x) => x.kind).map((x) => ({ date, atMin: x.out_min, kind: x.kind  }));
      input = toDayInput(punch, sched, decisions, leave).input;
      if (mission) input.mission = true;
      if (lastPunchDate && date >= lastPunchDate) input.open = true;
    } else {
      input = { date, isWeeklyOff: sched.isWeeklyOff, officialIn: sched.officialIn, officialOut: sched.officialOut, leave, mission };
    }
    const result = computeDay(input, e.method, DEFAULT_POLICY, sched.shiftMin);
    const here = inBranch(date);
    const other = here ? undefined : branchOfDate(date);
    // أيام الفرع التاني بتظهر من غير تفاصيل، عشان مدير الفرع مايشوفش بيانات فرع تاني
    if (!here) {
      return {
        date, weekday: WEEKDAYS[new Date(date).getUTCDay()], isWeeklyOff: false, prayerMin: 0, breakMin: 0, mission: false,
        exits: [], warnings: [], result, inBranch: false, otherBranch: other === undefined ? undefined : branchName(db, other),
      };
    }
    return {
      date, weekday: WEEKDAYS[new Date(date).getUTCDay()], officialIn: sched.officialIn, officialOut: sched.officialOut,
      isWeeklyOff: sched.isWeeklyOff, actualIn: input.actualIn, actualOut: input.actualOut, prayerMin: input.prayerMin ?? 0,
      breakMin: input.breakMin ?? 0, leave: leaveType, mission,
      exits: dayExits.map((x) => ({ id: x.id, outMin: x.out_min, backMin: x.back_min, minutes: x.minutes, reason: x.reason_text, kind: x.kind })),
      warnings: p?.warnings ? JSON.parse(p.warnings) : [], result,
      inBranch: here, otherBranch: other === undefined ? undefined : branchName(db, other),
    };
  });
  const mine = details.filter((d) => d.inBranch);

  // الرصيد بيتحسب للموظف كله. لكن عدد الإجازات في كل صف = أيامه في الفرع ده بس (عشان بدون مرتب مثلًا مايتعدّش مرتين)،
  // والرصيد وخصم الإجازات والتعيين والاستقالة بيطلعوا في صف الفرع اللي خلّص فيه الشهر بس
  const full = leaveYear(db, e, year, month);
  let leave                   = full;
  if (branchId) {
    const n = (t        ) => mine.filter((d) => d.leave === t).length;
    const fresh = isNewHire(full.tenure);
    leave = {
      ...full,
      used: fresh ? { casual: 0, annual: 0, sick: 0 } : { casual: n('casual'), annual: n('annual'), sick: n('sick') },
      missingStamps: n('missingStamps'), absentNoPermission: n('absentNoPermission'), absentNoNotice: n('absentNoNotice'),
      unpaidDays: Math.min(30, fresh ? n('casual') + n('annual') + n('sick') + n('unpaid') : n('unpaid')),
      paidDays: Math.min(30, n('paid')), specialDays: n('marriage') + n('bereavement'),
      ...(owner ? {} : { accruedAtResignation: 0, hireResignDays: 0, deduction: { newHire: 0, negativeBalance: 0, resignation: 0, total: 0 } }),
    };
  }

  // الحالة من وجهة نظر الفرع: منقول جديد (خارج منه) / منقول وارد (جاي له)
  let status = full.status;
  const notes           = [];
  if (branchId && windows.length) {
    const firstHere = windows[0].from;
    const lastHere = windows.at(-1) .to;
    const nextBranch = lastHere < to ? branchOfDate(addDays(lastHere, 1)) : undefined;
    const prevBranch = firstHere > from ? branchOfDate(addDays(firstHere, -1)) : undefined;
    if (nextBranch !== undefined && nextBranch !== branchId) {
      status = 'transferredNew';
      notes.push(`منقول لـ"${branchName(db, nextBranch)}" من ${addDays(lastHere, 1)}`);
    } else if (prevBranch !== undefined && prevBranch !== branchId) {
      if (!status.startsWith('resigned')) status = 'transferredIn';
      notes.push(`منقول من "${branchName(db, prevBranch)}" من ${firstHere}`);
    } else if (status.startsWith('transferred')) {
      status = 'active';
    }
  }
  if (!owner && lastInPeriod) notes.push(`بنود الشهر وخصم الإجازات في تقرير "${branchName(db, lastInPeriod.branch_id)}"`);

  const { manual } = getMonthlyInputs(db, e.code, year, month);
  const rowManual = owner ? manual : {};
  if (notes.length) rowManual.notes = [...notes, rowManual.notes].filter(Boolean).join(' - ');
  const { shift } = shiftOn(windows.at(-1)?.to ?? to, base, changes);
  const row = buildDeductionRow({
    code: e.code, name: e.name, branch: branchName(db, branchId ?? e.branch_id), role: e.role, gender: e.gender ?? undefined,
    hireDate: e.hire_date ?? undefined, transferDate: e.transfer_date ?? undefined, resignationDate: e.resignation_date ?? undefined,
    incentiveOnResignation: e.incentive_on_resignation ?? undefined, expatStatus: e.expat_status ?? undefined, method: e.method,
    shift, contractHours: e.contract_hours ?? undefined, monthlyHours: e.monthly_hours ?? undefined, periodDays: dates.length, weeklyOff: e.weekly_off === null ? undefined : WEEKDAYS[e.weekly_off],
  }, year, month, mine.map((d) => d.result), { ...leave, status }, rowManual);

  return {
    employee: e, days: details, leave, row, owner,
    pendingExits: exitRows.filter((x) => !x.kind && inBranch(x.date)).length,
  };
}

const branchName = (db    , id        ) => (db.prepare('select name from branches where id = ?').get(id)                                )?.name ?? '';

/** الموظفين اللي بيتحسبوا للفرع في الشهر ده: كل اللي كانوا فيه خلال الشهر، كل واحد بأيامه فيه */
function branchMonth(db    , branchId        , year        , month        ) {
  const { from, to } = payrollPeriod(year, month);
  return listEmployees(db, branchId, from, to)
    .filter((e) => e.active || e.left_on || (e.resignation_date && e.resignation_date >= from))
    .filter((e) => !e.hire_date || e.hire_date <= to)
    .filter((e) => branchWindows(db, e.code, branchId, from, to).length)
    .map((e) => computeEmployeeMonth(db, e, year, month, branchId));
}

/** تقرير الخصومات لفرع */
export function branchReport(db    , branchId        , year        , month        ) {
  return branchMonth(db, branchId, year, month).map((r) => ({ ...r.row, pendingExits: r.pendingExits }));
}

                                
               
               
               
               
                  
                       
                      
                       
                    
                     
                  
                        
                    
                   
                
                       
                 
                   
                   
                                                                                                                    
                        
                     
 

/** سجل الحضور: كل يوم لكل موظف في الفرع في الشهر ده */
export function branchAttendance(db    , branchId        , year        , month        )                  {
  const today = new Date().toISOString().slice(0, 10);
  const rows                  = [];
  for (const m of branchMonth(db, branchId, year, month)) {
    const e = m.employee;
    for (const d of m.days) {
      if (!d.inBranch) continue;
      if (e.hire_date && d.date < e.hire_date) continue;
      if (e.resignation_date && d.date > e.resignation_date) continue;
      const punched = d.actualIn !== undefined && d.actualOut !== undefined;
      rows.push({
        code: e.code, name: e.name, role: e.role, date: d.date, weekday: d.weekday, isWeeklyOff: d.isWeeklyOff,
        officialIn: d.officialIn, officialOut: d.officialOut, actualIn: d.actualIn, actualOut: d.actualOut,
        lateMin: d.result.lateMin, earlyLeaveMin: d.result.earlyLeaveMin, prayerMin: d.prayerMin, breakMin: d.breakMin,
        exits: d.exits.length, pendingExits: d.exits.filter((x) => !x.kind).length, leave: d.leave, mission: d.mission,
        totalMin: d.result.totalMin,
        missingPunch: !d.isWeeklyOff && !d.leave && !d.mission && !punched && d.date <= today,
        warnings: d.warnings,
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
