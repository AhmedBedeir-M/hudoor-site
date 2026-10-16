// قاعدة البيانات: SQLite المدمجة في Node (node:sqlite) من غير مكتبات خارجية.
import { DatabaseSync } from '../web/shims/node-sqlite.js';

const SCHEMA = `
pragma foreign_keys = on;
pragma journal_mode = wal;

create table if not exists branches (
  id integer primary key,
  name text not null unique
);

create table if not exists employees (
  code text primary key,
  name text not null,
  branch_id integer not null references branches(id),
  role text not null default '',
  gender text,
  hire_date text,
  transfer_date text,
  resignation_date text,
  incentive_on_resignation text,
  expat_status text,
  method text not null default 'attendance'
    check (method in ('attendance', 'daily', 'monthlyNoDeduct', 'monthlyDeduct')),
  -- دقايق من نص الليل. الشيفت اللي بيعدّي نص الليل نهايته أكبر من 1440،
  -- والشيفت اللي بيبدأ بعد نص الليل (تبع اليوم اللي قبله) بدايته أكبر من أو تساوي 1440
  shift_start integer not null default 540,
  shift_end integer not null default 1020,
  weekly_off integer check (weekly_off between 0 and 6),
  late_grace integer not null default 1,
  handover integer not null default 0,
  contract_hours real,
  active integer not null default 1
);

-- اسم الموظف في سوفتك ← كوده (سوفتك بيطلّع الاسم بس)
create table if not exists name_aliases (
  branch_id integer not null references branches(id),
  softech_name text not null,
  employee_code text not null references employees(code),
  primary key (branch_id, softech_name)
);

-- طلبات تغيير الحالة: مشرف الفرع بيطلب، والـ HR بيعتمد
create table if not exists shift_changes (
  id integer primary key,
  employee_code text not null references employees(code),
  kind text not null check (kind in ('temporary', 'permanent')),
  date_from text not null,
  date_to text,
  shift_start integer,
  shift_end integer,
  change_weekly_off integer not null default 0,
  weekly_off integer,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  requested_by integer references users(id),
  decided_by integer references users(id),
  created_at text not null default (datetime('now', 'localtime'))
);

create table if not exists imports (
  id integer primary key,
  branch_id integer not null references branches(id),
  file_name text,
  raw text not null,            -- جدول الملف كـ JSON، عشان نعيد المعالجة بعد ربط الأسامي
  rows integer,
  days integer,
  unmatched text,               -- JSON
  created_by integer references users(id),
  created_at text not null default (datetime('now', 'localtime'))
);

create table if not exists punch_days (
  employee_code text not null references employees(code),
  date text not null,
  actual_in integer,
  actual_out integer,
  prayer_min integer not null default 0,
  break_min integer not null default 0,
  warnings text,
  import_id integer references imports(id),
  primary key (employee_code, date)
);

-- الخروج الغريب: kind فاضي = مستني قرار مدير الفرع (وبيتحسب استئذان لحد ما يتقرر)
create table if not exists exits (
  id integer primary key,
  employee_code text not null references employees(code),
  date text not null,
  out_min integer not null,
  back_min integer,
  minutes integer not null,
  reason_text text,
  kind text check (kind in ('permission', 'sickPermission', 'mission')),
  decided_by integer references users(id),
  decided_at text,
  unique (employee_code, date, out_min)
);

-- الإجازات وأيام المأمورية الكاملة (type = 'mission')
create table if not exists leaves (
  employee_code text not null references employees(code),
  date text not null,
  type text not null,
  note text,
  entered_by integer references users(id),
  primary key (employee_code, date)
);

-- ضبط الإجازات والتصنيف اليدوي لكل شهر
create table if not exists leave_adjustments (
  employee_code text not null references employees(code),
  year integer not null,
  month integer not null,
  casual real not null default 0,
  annual real not null default 0,
  sick real not null default 0,
  tenure_override text,
  primary key (employee_code, year, month)
);

-- بنود الشهر اليدوية (الجزاءات، الإضافي، البدلات…) كـ JSON بنفس شكل ReportManualInputs
create table if not exists monthly_inputs (
  employee_code text not null references employees(code),
  year integer not null,
  month integer not null,
  data text not null,
  primary key (employee_code, year, month)
);

create table if not exists users (
  id integer primary key,
  username text not null unique,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('hr', 'manager')),
  branch_id integer references branches(id)
);

create table if not exists sessions (
  token text primary key,
  user_id integer not null references users(id) on delete cascade,
  expires_at text not null
);

create table if not exists audit (
  id integer primary key,
  user_id integer references users(id),
  action text not null,
  detail text,
  at text not null default (datetime('now', 'localtime'))
);
`;

                              

/**
 * تحديثات قاعدة البيانات بالترتيب. كل تحديث بيتنفذ مرة واحدة، ورقم آخر تحديث متسجّل في user_version.
 * أي تغيير جديد في الجداول بيتضاف هنا كتحديث جديد، ومش بيتعدّل في SCHEMA، عشان القواعد الشغالة تتحدّث من غير ما بياناتها تضيع.
 */
const MIGRATIONS           = [
  // 1: تاريخ فروع الموظف (النقل من فرع لفرع). date_to فاضي = الفرع الحالي
  `create table employee_branches (
     employee_code text not null references employees(code),
     branch_id integer not null references branches(id),
     date_from text not null,
     date_to text,
     primary key (employee_code, date_from)
   );
   create index employee_branches_branch on employee_branches (branch_id, date_from);
   insert into employee_branches (employee_code, branch_id, date_from)
     select code, branch_id, '2000-01-01' from employees;`,
];

export function openDb(path        )     {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const version = (db.prepare('pragma user_version').get()                            ).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`pragma user_version = ${v + 1}`);
    });
  }
  return db;
}

export function audit(db    , userId               , action        , detail          ) {
  db.prepare('insert into audit (user_id, action, detail) values (?, ?, ?)').run(
    userId, action, detail === undefined ? null : JSON.stringify(detail),
  );
}

/** تنفيذ كذا عملية مع بعض: يا كلهم يتسجّلوا يا ولا واحدة */
export function tx   (db    , fn         )    {
  db.exec('begin');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (e) {
    db.exec('rollback');
    throw e;
  }
}
