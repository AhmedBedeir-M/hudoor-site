// روابط البرنامج (API) والصلاحيات، من غير أي حاجة خاصة بالسيرفر.
// نفس الروابط بتشتغل في سيرفر Node (http.ts) وجوه المتصفح على الموقع (src/web).
import { randomBytes } from '../web/shims/node-crypto.js';
import { canAccessBranch, checkPassword, createUser, login, LoginLimiter, logout, setPassword, userForToken,           } from './auth.js';
import { backupNow, listBackups } from './backup.js';
import { importBranchSheet } from '../import/branch-sheet.js';
import { audit,         } from './db.js';
import * as svc from './service.js';
import { HttpError } from './service.js';
import { toCsv } from '../report/deductions.js';
import { reportXlsx } from '../report/xlsx.js';
import { payrollPeriod } from '../engine/month.js';

                             
                                                                  
                                        
                                               
                             
                                                       
                     
                                                                                     
                         
                                                                                      
                                                     
 

/** طلب للـ API، من غير ما يهم جاي منين (سيرفر أو متصفح) */
                             
                 
           
                                     
             
                  
                                                         
                         
                    
                              
 

                              
                 
                 
                          
                                                               
                     
 

               
           
             
                    
                   
                   
                                               
                                     
                              
                                  
 

                                                        

/** رد بملف بدل JSON */
class FileResult {
  name        ;
  body                 ;
  type        ;
  constructor(name        , body                 , type = 'text/csv; charset=utf-8') {
    this.name = name;
    this.body = body;
    this.type = type;
  }
}
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const SHEET_IMPORT_PATH = '/api/import/branch-sheet';

/** من غير تسجيل دخول: أول حساب HR. ولو مفيش حساب خالص بيتعمل واحد (كلمة سره عشوائية، ويتغيّر من البرنامج) */
function defaultHrUser(db    )       {
  let u = db.prepare(`select id, username, name, role, branch_id from users where role = 'hr' order by id limit 1`).get()                    ;
  if (!u) {
    createUser(db, { username: 'hr', name: 'HR', password: randomBytes(24).toString('base64url'), role: 'hr' });
    u = db.prepare(`select id, username, name, role, branch_id from users where role = 'hr' order by id limit 1`).get()        ;
  }
  return u;
}

function need(ctx     , role       )       {
  if (!ctx.user) throw new HttpError(401, 'لازم تسجّل دخول');
  if (role && ctx.user.role !== role) throw new HttpError(403, 'العملية دي للـ HR بس');
  return ctx.user;
}

function needBranch(ctx     , branchId        )       {
  const u = need(ctx);
  if (!canAccessBranch(u, branchId)) throw new HttpError(403, 'مالكش صلاحية على الفرع ده');
  return u;
}

/** الموظف موجود، ومدير الفرع يشوفه لو كان في فرعه في أي وقت (حتى لو اتنقل بعد كده) */
function needEmployee(ctx     , db    , code                    ) {
  const u = need(ctx);
  const e = code ? svc.getEmployee(db, code) : undefined;
  if (!e) throw new HttpError(404, 'الموظف مش موجود');
  if (u.role !== 'hr' && !svc.wasInBranch(db, e.code, u.branch_id )) throw new HttpError(403, 'مالكش صلاحية على الموظف ده');
  return e;
}

/** مدير الفرع يعدّل أيام الموظف اللي كان فيها في فرعه بس */
function needEmployeeOn(ctx     , db    , code                    , dates          ) {
  const e = needEmployee(ctx, db, code);
  const u = ctx.user ;
  if (u.role !== 'hr' && dates.some((d) => svc.branchOn(db, e.code, d) !== u.branch_id)) {
    throw new HttpError(403, 'الموظف ماكانش في فرعك في الأيام دي');
  }
  return e;
}

function datesBetween(from        , to        ) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new HttpError(400, 'الفترة مش صحيحة');
  const out           = [];
  for (let d = Date.parse(from); d <= Date.parse(to) && out.length <= 62; d += 86_400_000) out.push(new Date(d).toISOString().slice(0, 10));
  return out;
}

function period(url     ) {
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  if (!(year >= 2000 && year <= 2100 && month >= 1 && month <= 12)) throw new HttpError(400, 'السنة والشهر مطلوبين');
  return { year, month };
}

function registerRoutes(route                                                          , db    , opts            , secureCookies         ) {
  const limiter = new LoginLimiter();
  const sessionCookie = (token        ) => `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookies ? '; Secure' : ''}`;

  // ----- الدخول -----
  route('POST', '/api/login', async (ctx) => {
    const { username, password } = await ctx.json                                        ();
    const name = String(username ?? '');
    const wait = limiter.blockedMinutes(ctx.ip, name);
    if (wait) throw new HttpError(429, `محاولات دخول غلط كتير. جرّب تاني بعد ${wait} دقيقة`);
    const r = login(db, name, String(password ?? ''));
    if (!r) {
      limiter.fail(ctx.ip, name);
      throw new HttpError(401, 'اسم المستخدم أو كلمة السر غلط');
    }
    limiter.succeed(ctx.ip, name);
    ctx.setCookie(sessionCookie(r.token));
    return r.user;
  });
  route('GET', '/api/health', () => ({ ok: true }));
  // أول تشغيل: لو مفيش ولا مستخدم، أول حد يفتح البرنامج يعمل حساب الـ HR. بعد كده الرابط ده بيترفض
  const noUsers = () => (db.prepare('select count(*) as n from users').get()                 ).n === 0;
  route('GET', '/api/setup', () => ({ needsSetup: opts.requireLogin !== false && noUsers(), demoLogin: opts.demoLogin ?? null }));
  route('POST', '/api/setup', async (ctx) => {
    if (!noUsers()) throw new HttpError(403, 'البرنامج متظبط قبل كده');
    const b = await ctx.json();
    try {
      createUser(db, { username: String(b.username ?? ''), name: String(b.name ?? ''), password: String(b.password ?? ''), role: 'hr' });
    } catch (e) {
      throw new HttpError(400, (e         ).message);
    }
    const r = login(db, String(b.username), String(b.password)) ;
    ctx.setCookie(sessionCookie(r.token));
    return r.user;
  });
  route('POST', '/api/logout', (ctx) => {
    logout(db, ctx.cookie('sid'));
    ctx.setCookie('sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });
  route('GET', '/api/me', (ctx) => ({ ...need(ctx), loginDisabled: opts.requireLogin === false }));
  route('POST', '/api/me/password', async (ctx) => {
    const u = need(ctx);
    const b = await ctx.json();
    if (!checkPassword(db, u.id, String(b.current ?? ''))) throw new HttpError(400, 'كلمة السر الحالية غلط');
    try {
      setPassword(db, u.id, String(b.password ?? ''), ctx.cookie('sid'));
    } catch (e) {
      throw new HttpError(400, (e         ).message);
    }
    audit(db, u.id, 'password.change');
    return { ok: true };
  });
  route('POST', '/api/users/:id/password', async (ctx) => {
    const u = need(ctx, 'hr');
    const id = Number(ctx.params[0]);
    if (!db.prepare('select 1 from users where id = ?').get(id)) throw new HttpError(404, 'المستخدم مش موجود');
    try {
      setPassword(db, id, String((await ctx.json()).password ?? ''));
    } catch (e) {
      throw new HttpError(400, (e         ).message);
    }
    audit(db, u.id, 'password.reset', { userId: id });
    return { ok: true };
  });
  route('GET', '/api/backups', (ctx) => {
    need(ctx, 'hr');
    return { enabled: !!opts.backupDir, dir: opts.backupDir ?? null, backups: opts.backupDir ? listBackups(opts.backupDir) : [] };
  });
  route('POST', '/api/backups', (ctx) => {
    const u = need(ctx, 'hr');
    if (!opts.backupDir) throw new HttpError(400, 'النسخ الاحتياطي مقفول في الإعدادات');
    const file = backupNow(db, opts.backupDir);
    audit(db, u.id, 'backup.create', { file });
    return { file };
  });

  // ----- المستخدمين -----
  route('GET', '/api/users', (ctx) => {
    need(ctx, 'hr');
    return db.prepare('select u.id, u.username, u.name, u.role, u.branch_id, b.name as branch from users u left join branches b on b.id = u.branch_id order by u.name').all();
  });
  route('POST', '/api/users', async (ctx) => {
    need(ctx, 'hr');
    const b = await ctx.json();
    try {
      return { id: createUser(db, { username: b.username, name: b.name, password: b.password, role: b.role, branchId: b.branch_id ? Number(b.branch_id) : null }) };
    } catch (e) {
      throw new HttpError(400, /UNIQUE/.test(String(e)) ? 'اسم المستخدم موجود قبل كده' : (e         ).message);
    }
  });

  // ----- الفروع والموظفين -----
  route('GET', '/api/branches', (ctx) => {
    const u = need(ctx);
    const all = svc.listBranches(db)                    ;
    return u.role === 'hr' ? all : all.filter((b) => b.id === u.branch_id);
  });
  route('POST', '/api/branches', async (ctx) => svc.createBranch(db, need(ctx, 'hr'), (await ctx.json()).name));
  route('GET', '/api/branches/:id/employees', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    // مع الشهر: الحاليين + اللي اتنقلوا من الفرع خلال الشهر
    if (ctx.url.searchParams.has('year')) {
      const { year, month } = period(ctx.url);
      const { from, to } = payrollPeriod(year, month);
      return svc.listEmployees(db, id, from, to);
    }
    return svc.listEmployees(db, id).filter((e) => e.branch_id === id);
  });
  route('POST', '/api/employees/:code/transfer', async (ctx) =>
    svc.transferEmployee(db, need(ctx, 'hr'), decodeURIComponent(ctx.params[0]), await ctx.json()));
  route('POST', '/api/employees', async (ctx) => svc.saveEmployee(db, need(ctx, 'hr'), await ctx.json()));
  route('POST', SHEET_IMPORT_PATH, async (ctx) => {
    const u = need(ctx, 'hr');
    const branchName = ctx.url.searchParams.get('branch') ?? undefined;
    return importBranchSheet(db, u, await ctx.body(), { branchName });
  });
  route('POST', '/api/branches/:id/employees/import', async (ctx) =>
    svc.importEmployees(db, need(ctx, 'hr'), Number(ctx.params[0]), await ctx.body()));

  // ----- سوفتك -----
  route('POST', '/api/branches/:id/softech', async (ctx) => {
    const id = Number(ctx.params[0]);
    const u = needBranch(ctx, id);
    return svc.uploadSoftech(db, u, id, ctx.fileName, await ctx.body());
  });
  route('GET', '/api/branches/:id/imports', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    return svc.listImports(db, id);
  });
  route('POST', '/api/imports/:id/reprocess', (ctx) => {
    const id = Number(ctx.params[0]);
    const branch = svc.importBranch(db, id);
    if (!branch) throw new HttpError(404, 'الملف مش موجود');
    return svc.processImport(db, needBranch(ctx, branch), id);
  });
  route('DELETE', '/api/imports/:id', (ctx) => {
    const id = Number(ctx.params[0]);
    const branch = svc.importBranch(db, id);
    if (!branch) throw new HttpError(404, 'الملف مش موجود');
    return svc.deleteEmptyImport(db, needBranch(ctx, branch), id);
  });
  route('POST', '/api/branches/:id/aliases', async (ctx) => {
    const id = Number(ctx.params[0]);
    const u = needBranch(ctx, id);
    const { softechName, code } = await ctx.json();
    svc.saveAlias(db, u, id, String(softechName), String(code));
    return { ok: true };
  });

  // ----- الخروج الغريب -----
  route('GET', '/api/branches/:id/exits', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    const { year, month } = period(ctx.url);
    return svc.listExits(db, id, year, month, ctx.url.searchParams.get('pending') === '1');
  });
  route('POST', '/api/exits/:id', async (ctx) => {
    const id = Number(ctx.params[0]);
    const x = svc.exitById(db, id);
    if (!x) throw new HttpError(404, 'الخروج مش موجود');
    needEmployeeOn(ctx, db, x.employee_code, [x.date]);
    svc.decideExit(db, need(ctx), id, (await ctx.json()).kind ?? null);
    return { ok: true };
  });

  // ----- المواعيد المختلفة عن الشيفت -----
  route('GET', '/api/branches/:id/mismatches', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    const { year, month } = period(ctx.url);
    return svc.branchMismatches(db, id, year, month);
  });
  route('POST', '/api/day-flags', async (ctx) => {
    const b = await ctx.json();
    // تأكيد التأخير قرار الـ HR (زي اعتماد تغيير الحالة)
    return svc.confirmLate(db, need(ctx, 'hr'), String(b.code), String(b.date));
  });

  // ----- الإجازات -----
  route('GET', '/api/branches/:id/leaves', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    const { year, month } = period(ctx.url);
    return svc.listLeaves(db, id, year, month);
  });
  route('POST', '/api/leaves', async (ctx) => {
    const b = await ctx.json();
    needEmployeeOn(ctx, db, b.code, datesBetween(String(b.from), String(b.to ?? b.from)));
    return svc.setLeave(db, need(ctx), b.code, b.from, b.to ?? b.from, b.type, b.note);
  });
  route('DELETE', '/api/leaves', (ctx) => {
    const code = ctx.url.searchParams.get('code') ?? undefined;
    needEmployeeOn(ctx, db, code, [String(ctx.url.searchParams.get('date'))]);
    svc.deleteLeave(db, need(ctx), code , String(ctx.url.searchParams.get('date')));
    return { ok: true };
  });

  // ----- تغيير الحالة -----
  route('GET', '/api/branches/:id/shift-changes', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    return svc.listShiftChanges(db, id);
  });
  route('POST', '/api/shift-changes', async (ctx) => {
    const b = await ctx.json();
    const e = needEmployee(ctx, db, b.employee_code);
    // تغيير الحالة لموظف في الفرع حاليًا بس
    needBranch(ctx, e.branch_id);
    return svc.requestShiftChange(db, need(ctx), b);
  });
  route('POST', '/api/shift-changes/:id', async (ctx) => {
    const u = need(ctx, 'hr');
    const id = Number(ctx.params[0]);
    if (!svc.shiftChangeEmployeeCode(db, id)) throw new HttpError(404, 'الطلب مش موجود');
    svc.decideShiftChange(db, u, id, !!(await ctx.json()).approve);
    return { ok: true };
  });

  // ----- الحسبة والتقرير -----
  route('GET', '/api/employees/:code/month', (ctx) => {
    const e = needEmployee(ctx, db, decodeURIComponent(ctx.params[0]));
    const { year, month } = period(ctx.url);
    // مدير الفرع بيشوف أيام فرعه بس، والـ HR يختار الفرع (أو الشهر كله)
    const branch = ctx.user .role === 'hr' ? Number(ctx.url.searchParams.get('branch')) || undefined : ctx.user .branch_id ;
    return svc.computeEmployeeMonth(db, e, year, month, branch);
  });
  route('GET', '/api/employees/:code/inputs', (ctx) => {
    const e = needEmployee(ctx, db, decodeURIComponent(ctx.params[0]));
    const { year, month } = period(ctx.url);
    return svc.getMonthlyInputs(db, e.code, year, month);
  });
  route('POST', '/api/employees/:code/inputs', async (ctx) => {
    const u = need(ctx, 'hr');
    const e = needEmployee(ctx, db, decodeURIComponent(ctx.params[0]));
    const { year, month } = period(ctx.url);
    svc.saveMonthlyInputs(db, u, e.code, year, month, await ctx.json());
    return { ok: true };
  });
  route('GET', '/api/branches/:id/attendance', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    const { year, month } = period(ctx.url);
    const rows = svc.branchAttendance(db, id, year, month);
    if (ctx.url.searchParams.get('format') !== 'csv') return rows;
    const hm = (m         ) => (m === undefined ? '' : `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`);
    const clock = (m         ) => (m === undefined ? '' : hm(((m % 1440) + 1440) % 1440));
    const cell = (v         ) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    const lines = [
      ['الكود', 'الاسم', 'الوظيفة', 'اليوم', 'التاريخ', 'الحضور الرسمي', 'الانصراف الرسمي', 'الحضور', 'الانصراف', 'التأخير', 'انصراف مبكر', 'الصلاة', 'الراحة', 'خروج غريب', 'مستني قرار', 'إجازة', 'خصم اليوم', 'ملاحظات'],
      ...rows.map((r) => [
        r.code, r.name, r.role, r.weekday, r.date, r.isWeeklyOff ? 'إجازة أسبوعية' : clock(r.officialIn), r.isWeeklyOff ? '' : clock(r.officialOut),
        clock(r.actualIn), r.mission && r.actualOut === undefined ? 'م' : clock(r.actualOut), hm(r.lateMin), hm(r.earlyLeaveMin),
        hm(r.prayerMin), hm(r.breakMin), r.exits || '', r.pendingExits || '', r.mission ? 'مأمورية' : r.leave ?? '', hm(r.totalMin),
        [r.missingPunch ? 'مفيش بصمة' : '', ...r.warnings].filter(Boolean).join(' / '),
      ]),
    ];
    return new FileResult(`سجل الحضور ${year}-${String(month).padStart(2, '0')}.csv`, '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n');
  });
  route('GET', '/api/branches/:id/report', (ctx) => {
    const id = Number(ctx.params[0]);
    needBranch(ctx, id);
    const { year, month } = period(ctx.url);
    const rows = svc.branchReport(db, id, year, month);
    const format = ctx.url.searchParams.get('format');
    const name = `تقرير الخصومات ${year}-${String(month).padStart(2, '0')}`;
    if (format === 'xlsx') return new FileResult(`${name}.xlsx`, reportXlsx(rows), XLSX_TYPE);
    if (format !== 'csv') return rows;
    return new FileResult(`${name}.csv`, toCsv(rows));
  });
}

/** بيرجّع دالة بتنفذ أي طلب API وترجّع الرد */
export function createRouter(db    , opts             = {}) {
  const routes                                                          = [];
  const route = (method        , path        , handler         ) =>
    routes.push({ method, pattern: new RegExp('^' + path.replace(/:\w+/g, '([^/]+)') + '$'), handler });
  registerRoutes(route, db, opts, !!opts.https || !!opts.behindHttpsProxy);

  return async function handle(req            )                       {
    let setCookie                    ;
    try {
      // حماية من الطلبات اللي جاية من مواقع تانية: أي تعديل لازم يبعت الهيدر ده
      if (req.method !== 'GET' && req.requestedWith !== 'hr-app') throw new HttpError(403, 'طلب مرفوض');
      const match = routes.map((r) => ({ r, m: r.method === req.method ? req.url.pathname.match(r.pattern) : null })).find((x) => x.m);
      if (!match) throw new HttpError(404, 'الرابط مش موجود');
      const cookies = Object.fromEntries((req.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k));
      const ctx      = {
        url: req.url, ip: req.ip, params: match.m .slice(1), fileName: req.fileName ?? 'file',
        user: userForToken(db, cookies.sid) ?? (opts.requireLogin === false ? defaultHrUser(db) : null),
        cookie: (name) => cookies[name],
        setCookie: (v) => (setCookie = v),
        body: req.body,
        json: async () => {
          const b = await req.body();
          try {
            return b.length ? JSON.parse(b.toString('utf8')) : {};
          } catch {
            throw new HttpError(400, 'بيانات مش مفهومة');
          }
        },
      };
      const out = await match.r.handler(ctx);
      if (out instanceof FileResult) return { status: 200, file: { name: out.name, type: out.type, body: out.body }, setCookie };
      return { status: 200, json: out, setCookie };
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return { status, json: { error: status === 500 ? 'حصلت مشكلة في السيرفر' : (e         ).message }, setCookie };
    }
  };
}
