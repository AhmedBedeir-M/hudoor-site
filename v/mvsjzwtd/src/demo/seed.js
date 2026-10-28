// البيانات الوهمية (فرعين وموظفين بأسامي تجريبية وشهر حضور). بيستخدمها سكريبت التجربة والموقع على النت.
// الدخول: demo-hr / demo-password  أو  demo-manager / demo-password
                                          
import { createUser } from '../server/auth.js';
import { saveEmployee, uploadSoftech, createBranch, setLeave, requestShiftChange, transferEmployee } from '../server/service.js';

export const DEMO_PASSWORD = 'demo-password';

/** بيملا قاعدة بيانات فاضية بالبيانات الوهمية، وبيرجّع نتيجة رفع ملف سوفتك التجريبي */
export function seedDemo(db    ) {
  const hrId = createUser(db, { username: 'demo-hr', name: 'موظف HR تجريبي', password: DEMO_PASSWORD, role: 'hr' });
  const hr = { id: hrId, username: 'demo-hr', name: 'موظف HR تجريبي', role: 'hr'         , branch_id: null };
  const branch = createBranch(db, hr, 'فرع تجريبي');
  const branch2 = createBranch(db, hr, 'فرع تجريبي تاني');
  createUser(db, { username: 'demo-manager', name: 'مدير فرع تجريبي', password: DEMO_PASSWORD, role: 'manager', branchId: branch.id });

  const t = (h        , m = 0) => h * 60 + m;
  const people = [
    { code: 'D01', name: 'أحمد تجريبي سعيد', role: 'صيدلى', s: t(9), e: t(17), off: 5 },
    { code: 'D02', name: 'منى تجريبية حسن', role: 'بيع', s: t(13), e: t(21), off: 4 },
    { code: 'D03', name: 'كريم تجريبي علي', role: 'كاشير', s: t(17), e: t(25), off: 3 },
    { code: 'D04', name: 'محمد تجريبي رضا', role: 'صيدلى', s: t(25), e: t(33), off: 6 }, // ليلي: 1 ص ← 9 ص
    { code: 'D05', name: 'محمد تجريبي يوسف', role: 'مدير', s: t(9), e: t(17), off: 5 },
    { code: 'D06', name: 'سارة تجريبية فؤاد', role: 'بيع', s: t(9), e: t(15), off: 1, hire: '2026-08-20' },
  ];
  for (const p of people) {
    saveEmployee(db, hr, {
      code: p.code, name: p.name, branch_id: branch.id, role: p.role, gender: /ة /.test(p.name) ? 'أنثى' : 'ذكر',
      hire_date: p.hire ?? '2022-03-01', shift_start: p.s, shift_end: p.e, weekly_off: p.off, late_grace: 1,
      handover: p.role === 'مدير' ? 0 : 1, method: 'attendance',
    });
  }

  // كريم اتنقل للفرع التاني يوم 5 أكتوبر، وشيفته هناك 15 ← 23
  transferEmployee(db, hr, 'D03', { to_branch_id: branch2.id, date: '2026-10-05', shift_start: t(15), shift_end: t(23) });

  // ملف سوفتك تجريبي لكل فرع: الاسم | التاريخ | in | out | سبب الخروج
  const header = ['الاسم', 'التاريخ', 'in', 'out', 'سبب الخروج'];
  const rows1             = [header];
  const rows2             = [header];
  const hhmm = (m        ) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const dmy = (d      ) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  let seed = 7;
  const rnd = (n        ) => ((seed = (seed * 9301 + 49297) % 233280) / 233280) * n;
  for (let d = Date.UTC(2026, 8, 21); d <= Date.UTC(2026, 9, 13); d += 86_400_000) {
    const date = new Date(d);
    for (const p0 of people) {
      const moved = p0.code === 'D03' && date.toISOString().slice(0, 10) >= '2026-10-05';
      const p = moved ? { ...p0, s: t(15), e: t(23) } : p0;
      const rows = moved ? rows2 : rows1;
      if (date.getUTCDay() === p.off) continue;
      if (p.hire && date.toISOString().slice(0, 10) < p.hire) continue;
      // الشيفت الليلي (1 ص) سوفتك بيكتبه على اليوم اللي بعده
      const sDate = p.s >= 1440 ? new Date(d + 86_400_000) : date;
      const name = p.code === 'D05' ? 'محمد تجريبي' : p.name; // اسم ناقص عشان نجرّب الربط
      const late = rnd(1) < 0.3 ? Math.round(rnd(25)) : -Math.round(rnd(8));
      const inMin = p.s + late;
      const prayer = 15 + (rnd(1) < 0.25 ? Math.round(rnd(12)) : 0);
      const mid = p.s + 240;
      rows.push([name, dmy(sDate), hhmm(inMin), hhmm(mid), 'صلاة']);
      if (rnd(1) < 0.08) {
        // خروج غريب في نص الشيفت
        rows.push([name, dmy(sDate), hhmm(mid + prayer), hhmm(mid + prayer + 60), 'مشوار']);
        rows.push([name, dmy(sDate), hhmm(mid + prayer + 60 + 45), hhmm(p.e + 15), 'انتهاء الشيفت']);
      } else {
        const early = rnd(1) < 0.1 ? Math.round(rnd(40)) : 0;
        rows.push([name, dmy(sDate), hhmm(mid + prayer), hhmm(p.e + 15 - early), 'انتهاء الشيفت']);
      }
    }
  }
  const toCsv = (rows            ) => Buffer.from(rows.map((r) => r.join(',')).join('\n'));
  const r = uploadSoftech(db, hr, branch.id, 'سوفتك تجريبي.csv', toCsv(rows1));
  uploadSoftech(db, hr, branch2.id, 'سوفتك الفرع التاني.csv', toCsv(rows2));
  setLeave(db, hr, 'D02', '2026-10-04', '2026-10-05', 'casual');
  setLeave(db, hr, 'D01', '2026-10-07', '2026-10-07', 'mission', 'مأمورية في فرع تاني');
  requestShiftChange(db, { ...hr, role: 'manager', branch_id: branch.id }, {
    employee_code: 'D01', kind: 'temporary', date_from: '2026-10-10', date_to: '2026-10-12', shift_start: t(13), shift_end: t(21),
    change_weekly_off: 0, weekly_off: null, note: 'تغطية شيفت',
  });
  return r;
}
