// استيراد شيت فرع كامل (Excel زي شيت "arabesque"): الموظفين، والمواعيد، والحضور، والإجازات، والبنود الشهرية.
// بعد الاستيراد بيقارن حسبة البرنامج لكل موظف في كل شهر بأرقام الشيت نفسه.
//
// شكل الشيت (docs/attendance-logic-spec.md): شيت لكل موظف، فيه 12 بلوك شهري كل واحد 39 صف.
//   الرأس: N3 الكود، O3 الاسم، S3 الوظيفة، V3 النوع، W3 التعيين، Z3 الاستقالة، AB3 الحافز، AD3 النقل
//   البلوك k (o = 39k): U6..W6 ضبط الإجازات، N8/O8 الشيفت، L8 الإجازة الأسبوعية، Q8 ساعات الشيفت، T8 التصنيف،
//     X8 طريقة الحساب، Z8 الاغتراب، N9 السماح، O9 تسليم الشيفت، AS8/AT8 ملاحظات
//   الأيام صفوف 12..42: H التاريخ، M/O الحضور والانصراف، N/P الرسمي، W الراحة الزيادة، Y نوع الإذن، Z استئذان مرضي،
//     AA استئذان، AE الصلاة الزيادة، AG الإجازة، AI الجزاءات، AK الإضافي
//   صف 43: إجمالي الشهر (AH الخصم، AR أيام العمل، U/V/AM/AN فروق تغيير الحالة، AP طلعات الإشراف، G مرات الختم اليدوي)
import { DEFAULT_POLICY } from '../engine/policy.js';
import { scheduleFor, weekdayOf,                                     } from '../engine/schedule.js';
                                                     
                                              
import { audit, tx,         } from '../server/db.js';
import { computeEmployeeMonth, getEmployee, HttpError, saveEmployee,               } from '../server/service.js';
import { parseWorkbook,                       } from './workbook.js';

const NOT_EMPLOYEE = new Set(['Drop', 'بيانات العاملين', 'تقرير الخصومات', 'تقرير الجزاءات', 'شيت الطلعات']);
const BLOCK = 39;
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const METHODS                             = { 'حضور & انصراف': 'attendance', 'يومى': 'daily', 'شهرى لا يخصم': 'monthlyNoDeduct', 'شهري بالخصم': 'monthlyDeduct' };
const TENURES                         = { 'جديد': 'new', 'جديد1': 'new1', 'جديد2': 'new2', 'قديم1': 'old1', 'قديم': 'old' };
const LEAVES                         = {
  'عارضة': 'casual', 'اعتيادي': 'annual', 'مرضي': 'sick', 'غياب بدون اذن ×2': 'absentNoPermission', 'غياب بدون علم ×4': 'absentNoNotice',
  'اختام ناقصه': 'missingStamps', 'اجازه بدون مرتب': 'unpaid', 'اجازه مدفوعة الاجر': 'paid', 'اجازة زواج': 'marriage', 'اجازة عيد': 'eid',
  'اجازة وفاة 1 & 2': 'bereavement',
};
const OTHER_BRANCH = 'فروع تانية (من الشيت)';

const num = (c       ) => (typeof c?.v === 'number' ? c.v : undefined);
const mins = (c       ) => (num(c) === undefined ? undefined : Math.round(num(c)  * 1440));
const text = (c       ) => (typeof c?.v === 'string' ? c.v.trim() : '');
const iso = (c       ) =>
  num(c) && num(c)  > 0 ? new Date(Date.UTC(1899, 11, 30) + Math.round(num(c) ) * 86_400_000).toISOString().slice(0, 10) : undefined;
const addDays = (d        , n        ) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

                                    
                                       
                    
               
                 
                       
                
                 
                     
                 
                    
                    
                                                                               
                                                                                                                          
    
 

function branchId(db    , name        ) {
  const row = db.prepare('select id from branches where name = ?').get(name)                              ;
  return row?.id ?? Number(db.prepare('insert into branches (name) values (?)').run(name).lastInsertRowid);
}

/** أيام البلوك اللي فيها أي بيانات (بصمة، أو إجازة، أو مأمورية) */
function blockHasData(s       , k        ) {
  for (let r = 12 + k * BLOCK; r <= 42 + k * BLOCK; r++) {
    if (num(s.get('M' + r)) !== undefined || s.get('O' + r)?.v !== undefined || text(s.get('AG' + r))) return true;
  }
  return false;
}

/**
 * بيستورد شيت الفرع. الاستيراد بيبدّل بيانات الموظفين اللي في الشيت بالكامل
 * (الحضور، والإجازات، وتغييرات الحالة، والبنود)، فممكن يتعاد من غير ما حاجة تتكرر.
 */
export function importBranchSheet(db    , user      , buf        , opts                          = {})                    {
  const wb = parseWorkbook(buf);
  const staff = wb.get('بيانات العاملين');
  const name = opts.branchName?.trim() || text(staff?.get('D2'));
  if (!name) throw new HttpError(400, 'مالقيتش اسم الفرع في الشيت (خانة D2 في "بيانات العاملين")');
  const employeeSheets = [...wb.entries()].filter(([n, s]) => !NOT_EMPLOYEE.has(n) && num(s.get('N3')) !== undefined && text(s.get('O3')));
  if (!employeeSheets.length) throw new HttpError(400, 'مالقيتش شيتات موظفين في الملف (كود الموظف في N3 واسمه في O3)');

  const warnings           = [];
  const counts = { days: 0, leaves: 0, shiftChanges: 0, exits: 0, months: 0 };
  const expected                                                                                                                                                       = [];
  let branch = 0;

  tx(db, () => {
    branch = branchId(db, name);
    const insChange = db.prepare(
      `insert into shift_changes (employee_code, kind, date_from, date_to, shift_start, shift_end, change_weekly_off, weekly_off, note, status, requested_by, decided_by)
       values (?, 'temporary', ?, ?, ?, ?, ?, ?, 'من الشيت', 'approved', ?, ?)`,
    );
    const insPunch = db.prepare('insert into punch_days (employee_code, date, actual_in, actual_out, prayer_min, break_min) values (?, ?, ?, ?, ?, ?)');
    const insExit = db.prepare(
      `insert into exits (employee_code, date, out_min, back_min, minutes, reason_text, kind, decided_by, decided_at) values (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
    );
    const insLeave = db.prepare(`insert into leaves (employee_code, date, type, note, entered_by) values (?, ?, ?, 'من الشيت', ?)`);
    const insAdj = db.prepare('insert into leave_adjustments (employee_code, year, month, casual, annual, sick, tenure_override) values (?, ?, ?, ?, ?, ?, ?)');
    const insInputs = db.prepare('insert into monthly_inputs (employee_code, year, month, data) values (?, ?, ?, ?)');

    for (const [sheetName, s] of employeeSheets) {
      const c = (a        ) => s.get(a);
      const code = String(num(c('N3')));
      const year = Number(iso(c('H3'))?.slice(0, 4));
      const blocks = [...Array(12).keys()].filter((k) => blockHasData(s, k));
      // رأس الشهر سليم لو فيه شيفت حقيقي (بداية بعد نص الليل ونهاية بعدها بأقل من 24 ساعة)
      const headerOk = (k        ) => {
        const a = num(c('N' + (8 + k * BLOCK)));
        const b = num(c('O' + (8 + k * BLOCK)));
        return a !== undefined && b !== undefined && a > 0 && b > a && b - a <= 1;
      };
      // الشيفت الأساسي من آخر شهر سليم فيه بيانات
      const K = [...blocks].reverse().find(headerOk) ?? blocks.at(-1) ?? 0;
      // مشاكل في الشيت نفسه لكل شهر، عشان المقارنة توضّح سبب الاختلاف
      const sheetIssues = new Map                     ();
      const issue = (k        , msg        ) => sheetIssues.set(k, (sheetIssues.get(k) ?? new Set()).add(msg));
      for (const k of blocks) if (!headerOk(k)) issue(k, 'مواعيد الشيفت في الشهر ده مكسورة في الشيت');
      const h = (col        ) => c(col + (8 + K * BLOCK));

      const existing = getEmployee(db, code);
      if (existing && existing.branch_id !== branch && !db.prepare('select 1 from employee_branches where employee_code = ? and branch_id = ?').get(code, branch)) {
        warnings.push(`${text(c('O3'))} (${code}) موجود في فرع تاني في البرنامج، فماتستوردش`);
        continue;
      }

      // الشيفت والإعدادات من آخر شهر فيه بيانات
      const start = mins(h('N')) ?? 540;
      let end = mins(h('O')) ?? start + 480;
      while (end <= start) end += 1440;
      const shiftLen = mins(h('Q'));
      const offName = text(h('L'));
      const base                   = {
        shift: { startMin: start, endMin: end },
        weeklyOff: (WEEKDAYS.indexOf(offName) >= 0 ? WEEKDAYS.indexOf(offName) : null)                  ,
        lateGrace: c('N' + (9 + K * BLOCK))?.v === true,
        handover: c('O' + (9 + K * BLOCK))?.v === true,
      };
      const hire = iso(c('W3'));
      const resign = iso(c('Z3'));
      const transfer = iso(c('AD3'));

      // الاستيراد بيبدّل بيانات الموظف بالكامل (ربط أسامي سوفتك بيفضل زي ما هو)
      for (const t of ['punch_days', 'exits', 'leaves', 'shift_changes', 'leave_adjustments', 'monthly_inputs', 'employee_branches']) {
        db.prepare(`delete from ${t} where employee_code = ?`).run(code);
      }
      if (existing) db.prepare('update employees set branch_id = ? where code = ?').run(branch, code);
      const gender = text(c('V3'));
      saveEmployee(db, user, {
        code, name: text(c('O3')), branch_id: branch, role: text(c('S3')),
        gender: gender && gender !== '-' ? gender : null,
        hire_date: hire ?? null, resignation_date: resign ?? null, transfer_date: transfer ?? null,
        incentive_on_resignation: text(c('AB3')) || null, expat_status: text(h('Z')) && text(h('Z')) !== '-' ? text(h('Z')) : null,
        method: METHODS[text(h('X'))] ?? 'attendance',
        shift_start: base.shift.startMin, shift_end: base.shift.endMin, weekly_off: base.weeklyOff,
        late_grace: base.lateGrace ? 1 : 0, handover: base.handover ? 1 : 0,
        contract_hours: shiftLen !== undefined && Math.abs(shiftLen - (end - start)) > 1 ? shiftLen / 60 : null,
      }                                        );
      if (existing) db.prepare(`insert into employee_branches (employee_code, branch_id, date_from) values (?, ?, '2000-01-01')`).run(code, branch);

      // الأيام
      const changes                                                                                                      = [];
      const dataDates           = [];
      for (const k of blocks) {
        const o = k * BLOCK;
        for (let r = 12 + o; r <= 42 + o; r++) {
          const date = iso(c('H' + r));
          if (!date) continue;
          const inM = mins(c('M' + r));
          const outM = mins(c('O' + r));
          const outText = text(c('O' + r));
          const leaveText = text(c('AG' + r));
          const leave = LEAVES[leaveText];
          const mission = outText === 'م';
          if (leaveText && !leave) warnings.push(`${sheetName} ${date}: نوع إجازة مش معروف "${leaveText}"`);
          if (inM === undefined && outM === undefined && !leave && !mission) continue;
          if (outText && !mission) issue(k, `ميعاد متكتب غلط يوم ${date}`);
          if (outText && !mission) warnings.push(`${sheetName} ${date}: ميعاد الانصراف متكتب غلط "${outText}"، ماتستوردش`);
          if (num(c('Q' + r)) !== undefined) warnings.push(`${sheetName} ${date}: فيه فترة تانية في اليوم، ومش بتتستورد`);
          dataDates.push(date);

          // الرسمي في الشيت مختلف عن الشيفت الأساسي؟ يبقى تغيير حالة مؤقت لليوم ده
          const sheetOff = typeof c('N' + r)?.v === 'string';
          const offIn = mins(c('N' + r));
          const offOut = mins(c('P' + r));
          const expect = scheduleFor(date, base, [], DEFAULT_POLICY);
          // ميعاد رسمي مش منطقي (صفر، أو تاريخ، أو أطول من 24 ساعة) بيتجاهل واليوم بيتحسب على الشيفت الأساسي
          const officialOk = offIn !== undefined && offOut !== undefined && offIn > 0 && offIn < 2880 && offOut > offIn && offOut - offIn <= 1440;
          if (!sheetOff && offIn !== undefined && !officialOk) issue(k, 'مواعيد رسمية مكسورة في الشيت');
          if (sheetOff && !expect.isWeeklyOff) {
            changes.push({ date, start: null, end: null, changeOff: 1, off: weekdayOf(date) });
          } else if (!sheetOff && officialOk &&
            (expect.isWeeklyOff || Math.abs(offIn - expect.officialIn ) > 0.5 || Math.abs(offOut - expect.officialOut ) > 0.5)) {
            const sStart = offIn - (base.lateGrace ? DEFAULT_POLICY.lateGraceMin : 0);
            let sEnd = offOut - (base.handover ? DEFAULT_POLICY.handoverMin : 0);
            while (sEnd <= sStart) sEnd += 1440;
            changes.push({ date, start: sStart, end: sEnd, changeOff: expect.isWeeklyOff ? 1 : 0, off: null });
          }

          if (inM !== undefined || outM !== undefined) {
            const ae = mins(c('AE' + r)) ?? 0;
            const w = mins(c('W' + r)) ?? 0;
            insPunch.run(code, date, inM ?? null, outM ?? null, ae > 0 ? ae + DEFAULT_POLICY.prayerAllowanceMin : 0,
              w > 0 ? w + DEFAULT_POLICY.breakAllowanceMin : 0);
            counts.days++;
            // الاستئذان والاستئذان المرضي بيتسجّلوا خروج اتقرر خلاص، والانصراف المبكر المرضي خروج آخر اليوم
            const anchor = inM ?? offIn ?? 0;
            const aa = mins(c('AA' + r)) ?? 0;
            const z = mins(c('Z' + r)) ?? 0;
            if (aa > 0) { insExit.run(code, date, anchor + 1, anchor + 1 + aa, aa, 'استئذان (من الشيت)', 'permission', user.id); counts.exits++; }
            if (z > 0) { insExit.run(code, date, anchor + 2, anchor + 2 + z, z, 'استئذان مرضي (من الشيت)', 'sickPermission', user.id); counts.exits++; }
            if (text(c('Y' + r)) === 'مرضى' && outM !== undefined) {
              insExit.run(code, date, outM, null, 0, 'انصراف مرضي (من الشيت)', 'sickPermission', user.id);
              counts.exits++;
            }
          }
          if (leave || mission) {
            insLeave.run(code, date, leave ?? 'mission', user.id);
            counts.leaves++;
          }
        }

        // بنود الشهر
        const sum = (col        ) => {
          let t = 0;
          for (let r = 12 + o; r <= 42 + o; r++) t += mins(c(col + r)) ?? 0;
          return t;
        };
        const tCell = c('T' + (8 + o));
        const tenure = tCell && !tCell.f ? TENURES[text(tCell)] : undefined;
        const adj = ['U', 'V', 'W'].map((col) => num(c(col + (6 + o))) ?? 0);
        if (adj.some(Boolean) || tenure) insAdj.run(code, year, k + 1, adj[0], adj[1], adj[2], tenure ?? null);
        const manual = {
          penaltiesMin: sum('AI') || undefined,
          manualStampPenalties: num(c('G' + (43 + o))) || undefined,
          overtimeMin: sum('AK') || undefined,
          statusChange: {
            deductMin: mins(c('U' + (43 + o))) || undefined, nightDeductMin: mins(c('V' + (43 + o))) || undefined,
            overtimeMin: mins(c('AM' + (43 + o))) || undefined, nightOvertimeMin: mins(c('AN' + (43 + o))) || undefined,
          },
          supervisionTrips: num(c('AP' + (43 + o))) || undefined,
          notes: text(c('AS' + (8 + o))) || undefined,
          otherNotes: text(c('AT' + (8 + o))).replace(/^-\s*$/, '') || undefined,
        };
        insInputs.run(code, year, k + 1, JSON.stringify(manual));
        counts.months++;
        expected.push({
          code, name: text(c('O3')), year, month: k + 1,
          ah: mins(c('AH' + (43 + o))), ag: num(c('AG' + (8 + o))), ar: num(c('AR' + (43 + o))),
          note: sheetIssues.has(k) ? [...sheetIssues.get(k) ].slice(0, 2).join('، ') : undefined,
        });
      }

      // تغييرات الحالة: الأيام المتتالية اللي ليها نفس التغيير بتتجمع في طلب واحد
      changes.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 0; i < changes.length; ) {
        let j = i;
        const same = (x                     , y                     ) =>
          x.start === y.start && x.end === y.end && x.changeOff === y.changeOff && x.off === y.off;
        while (j + 1 < changes.length && same(changes[j + 1], changes[i]) && changes[j + 1].date === addDays(changes[j].date, 1)) j++;
        const ch = changes[i];
        insChange.run(code, ch.date, changes[j].date, ch.start, ch.end, ch.changeOff, ch.off, user.id, user.id);
        counts.shiftChanges++;
        i = j + 1;
      }

      // النقل: اتجاهه من الناحية اللي فيها أغلب أيام الحضور في الشيت. ولو فيه أيام في الشيت
      // على الناحية التانية من تاريخ النقل (زي أيام تسليم)، الشيت بيحسبها على الفرع ده، فالفرع بيتمد ليها
      if (transfer) {
        const other = branchId(db, OTHER_BRANCH);
        const before = dataDates.filter((d) => d < transfer);
        const after = dataDates.filter((d) => d >= transfer);
        db.prepare('delete from employee_branches where employee_code = ?').run(code);
        if (after.length > before.length) {
          const from = before[0] ?? transfer;
          if (from < transfer) warnings.push(`${sheetName}: النقل للفرع مكتوب ${transfer}، بس فيه حضور في الفرع من ${from}، فاتحسب من ${from}`);
          db.prepare(`insert into employee_branches (employee_code, branch_id, date_from, date_to) values (?, ?, '2000-01-01', ?)`).run(code, other, addDays(from, -1));
          db.prepare('insert into employee_branches (employee_code, branch_id, date_from) values (?, ?, ?)').run(code, branch, from);
        } else {
          const lastHere = after.at(-1) ?? addDays(transfer, -1);
          if (after.length) warnings.push(`${sheetName}: النقل من الفرع مكتوب ${transfer}، بس فيه حضور في الفرع لحد ${lastHere}، فاتحسب لحد ${lastHere}`);
          db.prepare(`insert into employee_branches (employee_code, branch_id, date_from, date_to) values (?, ?, '2000-01-01', ?)`).run(code, branch, lastHere);
          db.prepare('insert into employee_branches (employee_code, branch_id, date_from) values (?, ?, ?)').run(code, other, addDays(lastHere, 1));
          db.prepare('update employees set branch_id = ? where code = ?').run(other, code);
        }
      }
    }
  });
  audit(db, user.id, 'sheet.import', { branch: name, employees: employeeSheets.length, ...counts });

  // المقارنة بالشيت
  const mismatches                                                  = [];
  let checked = 0;
  for (const x of expected) {
    const e = getEmployee(db, x.code);
    if (!e) continue;
    const r = computeEmployeeMonth(db, e, x.year, x.month, branch);
    if (!r.days.some((d) => d.inBranch)) continue;
    const pairs                                         = [
      ['إجمالي الخصم (دقايق)', x.ah, Number(r.row.totalDeductionMin) || 0],
      ['أيام العمل', x.ar, Number(r.row.workDays) || 0],
      ['خصم الإجازات (أيام)', x.ag, Number(r.row.leaveDeduction) || 0],
    ];
    for (const [field, sheet, app] of pairs) {
      checked++;
      if (Math.abs((sheet ?? 0) - app) > 0.5) mismatches.push({ code: x.code, name: x.name, month: x.month, field, sheet: sheet ?? 0, app, note: x.note });
    }
  }

  return {
    branch: { id: branch, name },
    employees: employeeSheets.length - warnings.filter((w) => w.includes('موجود في فرع تاني')).length,
    ...counts,
    warnings,
    verification: { checked, matched: checked - mismatches.length, mismatches },
  };
}
