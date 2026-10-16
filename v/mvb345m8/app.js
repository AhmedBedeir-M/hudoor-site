// واجهة برنامج الحضور. JavaScript عادي من غير مكتبات.
// كل البيانات اللي بتتعرض بتعدّي على esc() عشان محدش يحقن HTML.

const $app = document.getElementById('app');
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const METHODS = { attendance: 'حضور & انصراف', daily: 'يومى', monthlyNoDeduct: 'شهرى لا يخصم', monthlyDeduct: 'شهري بالخصم' };
const LEAVE_TYPES = {
  casual: 'عارضة', annual: 'اعتيادي', sick: 'مرضي', absentNoPermission: 'غياب بدون اذن ×2', absentNoNotice: 'غياب بدون علم ×4',
  missingStamps: 'اختام ناقصه', unpaid: 'اجازه بدون مرتب', paid: 'اجازه مدفوعة الاجر', marriage: 'اجازة زواج', eid: 'اجازة عيد',
  bereavement: 'اجازة وفاة', mission: 'مأمورية (يوم كامل)',
};
const EXIT_KINDS = { permission: 'استئذان', sickPermission: 'استئذان مرضي', mission: 'مأمورية' };
const TENURES = { new: 'جديد', new1: 'جديد1', new2: 'جديد2', old1: 'قديم1', old: 'قديم' };

const state = {
  user: null,
  branches: [],
  branchId: null,
  employees: [],
  ...currentPeriod(),
  tab: 'report',
  pendingExits: 0,
};

// الشهر الحسابي من 21 لـ 20: بعد يوم 20 بنبقى في الشهر الجاي
function currentPeriod() {
  const d = new Date();
  let year = d.getFullYear(), month = d.getMonth() + 1;
  if (d.getDate() >= 21) month++;
  if (month > 12) { month = 1; year++; }
  return { year, month };
}

// ---------- أدوات ----------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hm(min) {
  if (min === null || min === undefined || min === '') return '';
  const sign = min < 0 ? '-' : '';
  const m = Math.round(Math.abs(min));
  return `${sign}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
/** وقت الساعة من دقايق (ممكن تعدّي 1440) */
const clock = (min) => (min === null || min === undefined ? '' : hm(((min % 1440) + 1440) % 1440).padStart(5, '0'));
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const dur = (min) => (min ? hm(min) : '<span class="sub">—</span>');

let toastTimer;
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3500);
}

/** على الموقع البرنامج شغال جوه المتصفح (src/web/main.ts) بدل السيرفر */
async function localApi(method, path, body, isFile) {
  const r = await window.HR_API(method, path, body, isFile);
  if (r.status === 401 && path !== '/api/login') {
    state.user = null;
    renderLogin();
    throw new Error(r.json?.error);
  }
  if (r.status >= 400) throw new Error(r.json?.error || 'حصلت مشكلة');
  return r.file ?? r.json;
}

// على الموقع: زراير تنزيل Excel بتتجهز جوه المتصفح
document.addEventListener('click', async (ev) => {
  const a = ev.target.closest?.('a[download][href^="/api/"]');
  if (!a || !window.HR_API) return;
  ev.preventDefault();
  const f = await run(() => localApi('GET', a.getAttribute('href')));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([f.body], { type: f.type }));
  link.download = f.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// سحب وإفلات: أي خانة فيها اختيار ملف تقبل الملف لو اتسحب عليها، ولو في الصفحة خانة واحدة بس تقبله من أي حتة.
// الملف بيترفع على طول من غير ما تدوس الزرار.
const fileInputs = () => [...document.querySelectorAll('#app input[type=file]')];
const dropTarget = (el) => {
  const card = el.closest?.('.card');
  const inCard = card?.querySelector('input[type=file]');
  if (inCard) return inCard;
  const all = fileInputs();
  return all.length === 1 ? all[0] : null;
};
let dropCard = null;
const markDrop = (input) => {
  const card = input?.closest('.card') ?? null;
  if (card === dropCard) return;
  dropCard?.classList.remove('dropping');
  dropCard = card;
  dropCard?.classList.add('dropping');
};
document.addEventListener('dragover', (ev) => {
  if (!ev.dataTransfer?.types.includes('Files')) return;
  ev.preventDefault(); // من غيره المتصفح بيفتح الملف بدل البرنامج
  const input = dropTarget(ev.target);
  ev.dataTransfer.dropEffect = input ? 'copy' : 'none';
  markDrop(input);
});
document.addEventListener('dragleave', (ev) => {
  if (!ev.relatedTarget) markDrop(null);
});
document.addEventListener('drop', (ev) => {
  if (!ev.dataTransfer?.files.length) return;
  ev.preventDefault();
  const input = dropTarget(ev.target);
  markDrop(null);
  if (!input) return toast(fileInputs().length ? 'حط الملف على الخانة اللي عايز ترفعه فيها' : 'مفيش رفع ملفات في الصفحة دي', true);
  const dt = new DataTransfer();
  dt.items.add(ev.dataTransfer.files[0]);
  input.files = dt.files;
  if (input.form) input.form.requestSubmit();
  else input.dispatchEvent(new Event('change', { bubbles: true }));
});

async function api(method, path, body, isFile = false) {
  if (window.HR_API) return localApi(method, path, body, isFile);
  const opts = { method, headers: { 'x-requested-with': 'hr-app' } };
  if (body !== undefined) {
    if (isFile) {
      opts.body = body;
      opts.headers['content-type'] = 'application/octet-stream';
      opts.headers['x-file-name'] = encodeURIComponent(body.name);
    } else {
      opts.body = JSON.stringify(body);
      opts.headers['content-type'] = 'application/json';
    }
  }
  const res = await fetch(path, opts);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && path !== '/api/login') {
    state.user = null;
    renderLogin();
    throw new Error(data.error);
  }
  if (!res.ok) throw new Error(data.error || 'حصلت مشكلة');
  return data;
}

/** بيشغّل عملية ويعرض الغلط لو حصل */
async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast(e.message, true);
    throw e;
  }
}

const isHR = () => state.user?.role === 'hr';
const q = () => `year=${state.year}&month=${state.month}`;
/** currentOnly: من غير اللي اتنقلوا من الفرع (لطلبات تغيير الحالة) */
const employeeOptions = (selected, currentOnly = false) =>
  state.employees.filter((e) => e.active && !(currentOnly && e.left_on)).map((e) => `<option value="${esc(e.code)}" ${e.code === selected ? 'selected' : ''}>${esc(e.name)} (${esc(e.code)})</option>`).join('');
const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- الدخول ----------

function renderLogin(demo = state.demoLogin) {
  $app.innerHTML = `
    <div class="card login">
      <h2>تسجيل الدخول</h2>
      ${demo ? `<p class="hint">ده موقع تجربة ببيانات وهمية. ادخل بحساب التجربة:<br>
        اسم المستخدم <strong>${esc(demo.username)}</strong> · كلمة السر <strong>${esc(demo.password)}</strong></p>
        <button type="button" class="btn" id="demoFill">ادخل بحساب التجربة</button>` : ''}
      <form id="login" class="row">
        <label>اسم المستخدم <input name="username" autocomplete="username" required></label>
        <label>كلمة السر <input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary">دخول</button>
      </form>
    </div>`;
  document.getElementById('demoFill')?.addEventListener('click', () => {
    const f = document.getElementById('login');
    f.username.value = demo.username;
    f.password.value = demo.password;
    f.requestSubmit();
  });
  document.getElementById('login').onsubmit = async (ev) => {
    ev.preventDefault();
    state.user = await run(() => api('POST', '/api/login', formData(ev.target)));
    await start();
  };
}

async function start() {
  state.branches = await api('GET', '/api/branches');
  if (!state.branchId || !state.branches.some((b) => b.id === state.branchId)) state.branchId = state.branches[0]?.id ?? null;
  await loadBranch();
  renderShell();
}

async function loadBranch() {
  state.employees = state.branchId ? await api('GET', `/api/branches/${state.branchId}/employees?${q()}`) : [];
  state.pendingExits = state.branchId ? (await api('GET', `/api/branches/${state.branchId}/exits?${q()}&pending=1`)).length : 0;
}

// ---------- الهيكل ----------

const TABS = [
  ['report', 'تقرير الخصومات'],
  ['attendance', 'سجل الحضور'],
  ['exits', 'الخروج الغريب'],
  ['leaves', 'الإجازات'],
  ['shifts', 'تغيير الحالة'],
  ['upload', 'رفع ملف سوفتك'],
  ['employees', 'الموظفين'],
  ['users', 'المستخدمين والنسخ الاحتياطي', true],
];

function renderShell() {
  const years = [state.year - 1, state.year, state.year + 1];
  $app.innerHTML = `
    <header class="top">
      <h1>حضور الفروع</h1>
      <select id="branch" aria-label="الفرع">${state.branches.map((b) => `<option value="${b.id}" ${b.id === state.branchId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
      ${isHR() ? '<button class="btn small" id="newBranch">+ فرع</button>' : ''}
      <select id="month" aria-label="الشهر">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === state.month ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="year" aria-label="السنة">${years.map((y) => `<option ${y === state.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <span class="who" id="periodHint"></span>
      <span class="spacer"></span>
      <span class="who">${esc(state.user.name)} · ${isHR() ? 'HR' : 'مدير فرع'}</span>
      ${window.HR_STORE_NAME ? `<span class="badge" title="مكان حفظ البيانات">البيانات: ${esc(window.HR_STORE_NAME)}</span>` : ''}
      ${window.HR_LOGOUT ? `<span class="who">${esc(window.HR_USER_EMAIL ?? '')}</span><button class="btn small" id="webLogout">خروج</button>` : state.user.loginDisabled ? '<span class="badge">من غير تسجيل دخول (تجربة)</span>' : `
      <button class="btn small" id="changePw">تغيير كلمة السر</button>
      <button class="btn small" id="logout">خروج</button>`}
    </header>
    <nav class="tabs" role="tablist">
      ${TABS.filter(([, , hrOnly]) => !hrOnly || isHR()).map(([id, label]) => `
        <button role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${label}${id === 'exits' && state.pendingExits ? `<span class="badge warn">${state.pendingExits}</span>` : ''}</button>`).join('')}
    </nav>
    <main id="main"></main>`;

  const p = periodRange();
  document.getElementById('periodHint').textContent = `من ${p.from} لحد ${p.to}`;
  document.getElementById('branch').onchange = async (e) => { state.branchId = Number(e.target.value); await loadBranch(); renderShell(); };
  document.getElementById('month').onchange = async (e) => { state.month = Number(e.target.value); await loadBranch(); renderShell(); };
  document.getElementById('year').onchange = async (e) => { state.year = Number(e.target.value); await loadBranch(); renderShell(); };
  document.getElementById('logout')?.addEventListener('click', async () => { await api('POST', '/api/logout'); state.user = null; renderLogin(); });
  document.getElementById('webLogout')?.addEventListener('click', () => window.HR_LOGOUT());
  document.getElementById('changePw')?.addEventListener('click', changePasswordDialog);
  document.getElementById('newBranch')?.addEventListener('click', async () => {
    const name = prompt('اسم الفرع الجديد');
    if (!name) return;
    const b = await run(() => api('POST', '/api/branches', { name }), 'اتعمل الفرع');
    state.branchId = b.id;
    await start();
  });
  document.querySelectorAll('nav.tabs button').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; renderShell(); }));

  const main = document.getElementById('main');
  if (!state.branchId) {
    main.innerHTML = `<div class="card empty">${isHR() ? 'مفيش فروع لسه. اعمل أول فرع من زرار "+ فرع" فوق.' : 'حسابك مش مربوط بفرع.'}</div>`;
    return;
  }
  ({ report, attendance, exits, leaves, shifts, upload, employees, users })[state.tab](main);
}

function periodRange() {
  const start = new Date(Date.UTC(state.year, state.month - 2, 21));
  const end = new Date(Date.UTC(state.year, state.month - 1, 20));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

// ---------- تقرير الخصومات ----------

async function report(main) {
  main.innerHTML = '<p class="loading">بيحسب…</p>';
  const rows = await run(() => api('GET', `/api/branches/${state.branchId}/report?${q()}`));
  const sum = (k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const pending = sum('pendingExits');
  main.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">الموظفين</div><div class="value">${rows.length}</div></div>
      <div class="stat"><div class="label">إجمالي الخصم (ساعات)</div><div class="value">${hm(sum('totalDeductionMin'))}</div></div>
      <div class="stat"><div class="label">خصم الإجازات (أيام)</div><div class="value">${sum('leaveDeduction')}</div></div>
      <div class="stat"><div class="label">خروج مستني قرار</div><div class="value">${pending ? `<span class="badge warn">${pending}</span>` : '<span class="badge ok">0</span>'}</div></div>
    </div>
    <div class="card">
      <div class="row" style="justify-content: space-between">
        <h2>تقرير الخصومات — ${MONTHS[state.month - 1]} ${state.year}</h2>
        <a class="btn primary" href="/api/branches/${state.branchId}/report?${q()}&format=csv" download>تنزيل Excel (CSV) بكل الأعمدة</a>
      </div>
      ${pending ? `<p class="hint">⚠ فيه ${pending} خروج غريب لسه مستني قرار مدير الفرع، ومتحسوبين استئذان لحد ما يتقرروا.</p>` : ''}
      <p class="hint">دوس على أي موظف عشان تشوف أيامه بالتفصيل${isHR() ? ' وتدخّل بنود الشهر (الجزاءات، الإضافي، البدلات، ضبط الإجازات)' : ''}.</p>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>الكود</th><th>الاسم</th><th>الوظيفة</th><th class="num">أيام العمل</th>
          <th class="num">التأخير</th><th class="num">خصم التأخير</th><th class="num">انصراف مبكر</th><th class="num">استئذان</th><th class="num">خصم الاستئذان</th>
          <th class="num">صلاة زيادة</th><th class="num">راحة زيادة</th><th class="num">إجمالي الخصم</th>
          <th class="num">ع / ا / م</th><th class="num">غياب</th><th class="num">خصم الإجازات</th><th class="num">الرصيد ع / ا / م</th><th>الحالة</th><th class="num">مستني قرار</th>
        </tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="clickable" data-code="${esc(r.code)}">
            <td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.role)}${r.monthlyRequiredMin !== undefined ? `<div class="sub" title="بيتحاسب على ساعات الشهر">${hm(r.monthlyActualMin) || '0:00'} من ${hm(r.monthlyRequiredMin)} ساعة</div>` : ''}</td><td class="num">${r.workDays}</td>
            <td class="num">${dur(r.lateMin)}</td><td class="num">${dur(r.latePenaltyMin)}</td><td class="num">${dur(r.earlyLeaveMin)}</td>
            <td class="num">${dur(r.permissionMin)}</td><td class="num">${dur(r.permissionPenaltyMin)}</td>
            <td class="num">${dur(r.prayerExcessMin)}</td><td class="num">${dur(r.breakExcessMin)}</td>
            <td class="num"><strong>${dur(r.totalDeductionMin)}</strong></td>
            <td class="num">${r.casual} / ${r.annual} / ${r.sick}</td>
            <td class="num">${r.absentNoPermission + r.absentNoNotice || ''}</td>
            <td class="num">${r.leaveDeduction ? `<span class="badge danger">${r.leaveDeduction}</span>` : ''}</td>
            <td class="num">${r.balanceCasual} / ${r.balanceAnnual} / ${r.balanceSick}</td>
            <td>${r.status !== '-' ? `<span class="badge accent">${esc(r.status)}</span>` : ''} <span class="sub">${esc(r.tenure)}</span></td>
            <td class="num">${r.pendingExits ? `<span class="badge warn">${r.pendingExits}</span>` : ''}</td>
          </tr>`).join('') || '<tr><td colspan="18" class="empty">مفيش موظفين في الفرع ده لسه</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  main.querySelectorAll('tr.clickable').forEach((tr) => (tr.onclick = () => employeeDrawer(tr.dataset.code)));
}

async function employeeDrawer(code) {
  const [m, inputs] = await run(() => Promise.all([
    api('GET', `/api/employees/${encodeURIComponent(code)}/month?${q()}&branch=${state.branchId}`),
    api('GET', `/api/employees/${encodeURIComponent(code)}/inputs?${q()}`),
  ]));
  const e = m.employee, r = m.row, man = inputs.manual, adj = inputs.adjustment;
  const bg = document.createElement('div');
  bg.className = 'drawer-bg';
  const d = document.createElement('div');
  d.className = 'drawer';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-label', `تفاصيل ${e.name}`);
  const close = async (reload) => { bg.remove(); d.remove(); if (reload) { await loadBranch(); renderShell(); } };
  bg.onclick = () => close(false);

  d.innerHTML = `
    <header><h2>${esc(e.name)} <span class="sub">${esc(e.code)} · ${esc(e.role)} · ${r.monthlyRequiredMin !== undefined ? `بساعات الشهر (${e.monthly_hours} ساعة)` : METHODS[e.method]}</span></h2><button class="btn" id="close">إغلاق</button></header>
    <div class="stats">
      <div class="stat"><div class="label">إجمالي الخصم</div><div class="value">${hm(r.totalDeductionMin) || '0:00'}</div></div>
      <div class="stat"><div class="label">أيام العمل</div><div class="value">${r.workDays}</div></div>
      ${r.monthlyRequiredMin !== undefined ? `<div class="stat"><div class="label">ساعات الشهر: الفعلي / المطلوب</div><div class="value">${hm(r.monthlyActualMin) || '0:00'} / ${hm(r.monthlyRequiredMin)}</div></div>` : ''}
      <div class="stat"><div class="label">خصم الإجازات (أيام)</div><div class="value">${r.leaveDeduction}</div></div>
      <div class="stat"><div class="label">الرصيد ع / ا / م</div><div class="value">${r.balanceCasual} / ${r.balanceAnnual} / ${r.balanceSick}</div></div>
      <div class="stat"><div class="label">التصنيف</div><div class="value">${esc(r.tenure)}</div></div>
    </div>
    <div class="card">
      <h2>الأيام</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>اليوم</th><th class="num">الرسمي</th><th class="num">حضور</th><th class="num">انصراف</th><th class="num">تأخير</th><th class="num">انصراف مبكر</th>
          <th class="num">صلاة</th><th class="num">راحة</th><th>خروج غريب</th><th>إجازة</th><th class="num">خصم اليوم</th><th>ملاحظات</th></tr></thead>
        <tbody>${m.days.map((day) => `
          <tr class="${day.isWeeklyOff || !day.inBranch ? 'off' : ''}">
            <td>${esc(day.weekday)} <span class="sub">${esc(day.date)}</span></td>
            <td class="num">${!day.inBranch ? `<span class="badge">في ${esc(day.otherBranch ?? 'فرع تاني')}</span>` : day.isWeeklyOff ? 'إجازة أسبوعية' : `${clock(day.officialIn)} ← ${clock(day.officialOut)}`}</td>
            <td class="num">${clock(day.actualIn)}</td><td class="num">${day.mission && day.actualOut === undefined ? 'م' : clock(day.actualOut)}</td>
            <td class="num">${dur(day.result.lateMin)}</td><td class="num">${dur(day.result.earlyLeaveMin)}</td>
            <td class="num">${dur(day.prayerMin)}</td><td class="num">${dur(day.breakMin)}</td>
            <td>${day.exits.map((x) => `${clock(x.outMin)} (${x.backMin === null ? 'مارجعش' : hm(x.minutes)}) ${x.kind ? `<span class="badge ${x.kind === 'mission' ? 'ok' : 'accent'}">${EXIT_KINDS[x.kind]}</span>` : '<span class="badge warn">مستني قرار</span>'}`).join('<br>')}</td>
            <td>${day.leave ? `<span class="badge accent">${esc(LEAVE_TYPES[day.leave] ?? day.leave)}</span>` : ''}</td>
            <td class="num"><strong>${day.inBranch ? dur(day.result.totalMin) : ''}</strong></td>
            <td><span class="sub">${day.warnings.map(esc).join('<br>')}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
    ${r.notes ? `<p class="hint">${esc(r.notes)}</p>` : ''}
    ${isHR() && m.owner ? `
    <div class="card">
      <h2>بنود الشهر</h2>
      <p class="hint">البنود اللي مش جاية من سوفتك. الدقايق بتتكتب ساعات:دقايق.</p>
      <form id="inputs">
        <div class="row">
          <label>الجزاءات <input name="penalties" placeholder="0:00" value="${hm(man.penaltiesMin)}" size="6"></label>
          <label>مرات الختم اليدوي (4 ساعات) <input name="manualStampPenalties" type="number" min="0" value="${man.manualStampPenalties ?? ''}" style="width:90px"></label>
          <label>الإضافي <input name="overtime" placeholder="0:00" value="${hm(man.overtimeMin)}" size="6"></label>
          <label>فرق تغيير حالة خصم <input name="scDeduct" placeholder="0:00" value="${hm(man.statusChange?.deductMin)}" size="6"></label>
          <label>فرق تغيير حالة إضافي <input name="scOvertime" placeholder="0:00" value="${hm(man.statusChange?.overtimeMin)}" size="6"></label>
          <label>أيام بدل الوجبة <input name="mealDays" type="number" min="0" value="${man.mealDays ?? ''}" style="width:90px"></label>
          <label>طلعات الإشراف <input name="supervisionTrips" type="number" min="0" value="${man.supervisionTrips ?? ''}" style="width:90px"></label>
        </div>
        <div class="row" style="margin-top:10px">
          <label style="flex:1">ملاحظات <input name="notes" value="${esc(man.notes)}"></label>
        </div>
        <h3>ضبط الإجازات والتصنيف</h3>
        <div class="row">
          <label>ضبط عارضة <input name="adjCasual" type="number" step="0.5" value="${adj.casual}" style="width:80px"></label>
          <label>ضبط اعتيادي <input name="adjAnnual" type="number" step="0.5" value="${adj.annual}" style="width:80px"></label>
          <label>ضبط مرضي <input name="adjSick" type="number" step="0.5" value="${adj.sick}" style="width:80px"></label>
          <label>تصنيف يدوي (زميل راجع بأقدميته مثلًا)
            <select name="tenure"><option value="">حسب تاريخ التعيين</option>${Object.entries(TENURES).map(([k, v]) => `<option value="${k}" ${adj.tenure_override === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <button class="btn primary">حفظ</button>
        </div>
      </form>
    </div>` : ''}`;

  document.body.append(bg, d);
  d.querySelector('#close').onclick = () => close(false);
  d.querySelector('#inputs')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const mins = (v) => (v ? toMin(v) : 0);
    const n = (v) => (v === '' ? undefined : Number(v));
    await run(() => api('POST', `/api/employees/${encodeURIComponent(code)}/inputs?${q()}`, {
      manual: {
        ...man,
        penaltiesMin: mins(f.penalties), manualStampPenalties: n(f.manualStampPenalties), overtimeMin: mins(f.overtime),
        statusChange: { ...man.statusChange, deductMin: mins(f.scDeduct), overtimeMin: mins(f.scOvertime) },
        mealDays: n(f.mealDays), supervisionTrips: n(f.supervisionTrips), notes: f.notes || undefined,
      },
      adjustment: { casual: Number(f.adjCasual) || 0, annual: Number(f.adjAnnual) || 0, sick: Number(f.adjSick) || 0, tenure_override: f.tenure || null },
    }), 'اتحفظ');
    await close(true);
  });
}

// ---------- سجل الحضور ----------

const attendanceFilter = { code: '', date: '', problems: false };

async function attendance(main) {
  main.innerHTML = '<p class="loading">بيحمّل…</p>';
  const all = await run(() => api('GET', `/api/branches/${state.branchId}/attendance?${q()}`));
  const f = attendanceFilter;
  const people = [...new Map(all.map((r) => [r.code, r.name])).entries()];
  const dates = [...new Set(all.map((r) => r.date))];
  if (f.code && !people.some(([c]) => c === f.code)) f.code = '';
  if (f.date && !dates.includes(f.date)) f.date = '';
  const problem = (r) => r.missingPunch || r.lateMin > 0 || r.earlyLeaveMin > 0 || r.pendingExits > 0 || r.warnings.length > 0;
  const rows = all.filter((r) => (!f.code || r.code === f.code) && (!f.date || r.date === f.date) && (!f.problems || problem(r)));

  const count = (fn) => all.filter(fn).length;
  const status = (r) => {
    if (r.mission) return '<span class="badge ok">مأمورية</span>';
    if (r.leave) return `<span class="badge accent">${esc(LEAVE_TYPES[r.leave] ?? r.leave)}</span>`;
    if (r.isWeeklyOff) return '<span class="sub">إجازة أسبوعية</span>';
    if (r.missingPunch) return '<span class="badge danger">مفيش بصمة</span>';
    return '';
  };

  main.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">أيام اتسجلت</div><div class="value">${count((r) => r.actualIn !== undefined)}</div></div>
      <div class="stat"><div class="label">أيام فيها تأخير</div><div class="value">${count((r) => r.lateMin > 0)}</div></div>
      <div class="stat"><div class="label">انصراف مبكر</div><div class="value">${count((r) => r.earlyLeaveMin > 0)}</div></div>
      <div class="stat"><div class="label">أيام من غير بصمة</div><div class="value">${count((r) => r.missingPunch) ? `<span class="badge danger">${count((r) => r.missingPunch)}</span>` : '0'}</div></div>
    </div>
    <div class="card">
      <div class="row" style="justify-content: space-between">
        <h2>سجل الحضور والانصراف — ${MONTHS[state.month - 1]} ${state.year}</h2>
        <a class="btn" href="/api/branches/${state.branchId}/attendance?${q()}&format=csv" download>تنزيل Excel (CSV)</a>
      </div>
      <p class="hint">كل يوم لكل موظف في الفرع. "مفيش بصمة" يعني يوم شغل مالوش حضور أو انصراف ومفيش إجازة متسجّلة، فمحتاج يتسجّل سببه من شاشة الإجازات (غياب، إجازة، أختام ناقصة…).</p>
      <div class="row" style="margin-bottom: 12px">
        <label>الموظف <select id="fCode"><option value="">كل الموظفين</option>${people.map(([c, n]) => `<option value="${esc(c)}" ${c === f.code ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label>اليوم <select id="fDate"><option value="">كل الأيام</option>${dates.map((d) => `<option ${d === f.date ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="fProblems" ${f.problems ? 'checked' : ''}> اللي فيه مشكلة بس (تأخير، انصراف مبكر، من غير بصمة، خروج مستني قرار)</label>
        <span class="sub">${rows.length} سطر</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>اليوم</th><th>الموظف</th><th class="num">الرسمي</th><th class="num">حضور</th><th class="num">انصراف</th>
          <th class="num">تأخير</th><th class="num">انصراف مبكر</th><th class="num">صلاة</th><th class="num">راحة</th>
          <th class="num">خروج غريب</th><th>الحالة</th><th class="num">خصم اليوم</th><th>ملاحظات</th>
        </tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="clickable ${r.isWeeklyOff ? 'off' : ''}" data-code="${esc(r.code)}">
            <td>${esc(r.weekday)} <span class="sub">${esc(r.date)}</span></td>
            <td>${esc(r.name)} <span class="sub">${esc(r.role)}</span></td>
            <td class="num">${r.isWeeklyOff ? '' : `${clock(r.officialIn)} ← ${clock(r.officialOut)}`}</td>
            <td class="num">${clock(r.actualIn)}</td>
            <td class="num">${r.mission && r.actualOut === undefined ? 'م' : clock(r.actualOut)}</td>
            <td class="num">${r.lateMin ? `<span class="badge warn">${hm(r.lateMin)}</span>` : ''}</td>
            <td class="num">${r.earlyLeaveMin ? `<span class="badge warn">${hm(r.earlyLeaveMin)}</span>` : ''}</td>
            <td class="num">${dur(r.prayerMin)}</td><td class="num">${dur(r.breakMin)}</td>
            <td class="num">${r.exits ? (r.pendingExits ? `<span class="badge warn">${r.exits} · مستني قرار</span>` : r.exits) : ''}</td>
            <td>${status(r)}</td>
            <td class="num"><strong>${r.totalMin ? hm(r.totalMin) : ''}</strong></td>
            <td><span class="sub">${r.warnings.map(esc).join('<br>')}</span></td>
          </tr>`).join('') || '<tr><td colspan="13" class="empty">مفيش أيام بالفلتر ده</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  main.querySelector('#fCode').onchange = (e) => { f.code = e.target.value; attendance(main); };
  main.querySelector('#fDate').onchange = (e) => { f.date = e.target.value; attendance(main); };
  main.querySelector('#fProblems').onchange = (e) => { f.problems = e.target.checked; attendance(main); };
  main.querySelectorAll('tr.clickable').forEach((tr) => (tr.onclick = () => employeeDrawer(tr.dataset.code)));
}

// ---------- الخروج الغريب ----------

async function exits(main, pendingOnly = true) {
  const list = await run(() => api('GET', `/api/branches/${state.branchId}/exits?${q()}${pendingOnly ? '&pending=1' : ''}`));
  main.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content: space-between">
        <h2>الخروج الغريب</h2>
        <label class="check"><input type="checkbox" id="all" ${pendingOnly ? '' : 'checked'}> اعرض اللي اتقرر كمان</label>
      </div>
      <p class="hint">أي خروج سببه مش صلاة ولا راحة ولا انتهاء شيفت. مدير الفرع بيحدد: <strong>استئذان</strong> (بيتخصم ×2)، أو <strong>استئذان مرضي</strong> (×1)، أو <strong>مأمورية</strong> (مالهاش خصم). اللي مالوش قرار بيتحسب استئذان.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>اليوم</th><th>الموظف</th><th>القرار</th><th class="num">خرج</th><th class="num">رجع</th><th class="num">المدة</th><th>السبب في سوفتك</th></tr></thead>
        <tbody>${list.map((x) => `
          <tr>
            <td>${esc(x.date)}</td><td>${esc(x.employee_name)}</td>
            <td>${Object.entries(EXIT_KINDS).map(([k, v]) => `<button class="btn small ${x.kind === k ? 'primary' : ''}" data-id="${x.id}" data-kind="${k}">${v}</button>`).join(' ')}
              ${x.decided_by_name ? `<span class="sub">${esc(x.decided_by_name)}</span>` : ''}</td>
            <td class="num">${clock(x.out_min)}</td>
            <td class="num">${x.back_min === null ? 'مارجعش' : clock(x.back_min)}</td>
            <td class="num">${x.back_min === null ? 'انصراف مبكر' : hm(x.minutes)}</td>
            <td>${esc(x.reason_text)}</td>
          </tr>`).join('') || `<tr><td colspan="7" class="empty">${pendingOnly ? 'مفيش خروج مستني قرار 👍' : 'مفيش خروج غريب في الشهر ده'}</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
  main.querySelector('#all').onchange = (e) => exits(main, !e.target.checked);
  main.querySelectorAll('button[data-kind]').forEach((b) => (b.onclick = async () => {
    await run(() => api('POST', `/api/exits/${b.dataset.id}`, { kind: b.dataset.kind }), 'اتسجّل القرار');
    await loadBranch();
    renderShell();
  }));
}

// ---------- الإجازات ----------

async function leaves(main) {
  const list = await run(() => api('GET', `/api/branches/${state.branchId}/leaves?${q()}`));
  const p = periodRange();
  main.innerHTML = `
    <div class="card">
      <h2>تسجيل إجازة أو مأمورية</h2>
      <form id="leave" class="row">
        <label>الموظف <select name="code" required>${employeeOptions()}</select></label>
        <label>النوع <select name="type">${Object.entries(LEAVE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>من <input type="date" name="from" value="${p.from}" required></label>
        <label>لحد <input type="date" name="to" value="${p.from}" required></label>
        <label>ملاحظة <input name="note"></label>
        <button class="btn primary">تسجيل</button>
      </form>
    </div>
    <div class="card">
      <h2>إجازات الشهر</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>اليوم</th><th>الموظف</th><th>النوع</th><th>ملاحظة</th><th></th></tr></thead>
        <tbody>${list.map((l) => `
          <tr><td>${esc(l.date)}</td><td>${esc(l.employee_name)}</td><td><span class="badge accent">${esc(LEAVE_TYPES[l.type] ?? l.type)}</span></td><td>${esc(l.note)}</td>
          <td><button class="btn small danger" data-code="${esc(l.employee_code)}" data-date="${esc(l.date)}">حذف</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">مفيش إجازات في الشهر ده</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  main.querySelector('#leave').onsubmit = async (ev) => {
    ev.preventDefault();
    const r = await run(() => api('POST', '/api/leaves', formData(ev.target)));
    toast(`اتسجّل ${r.days} يوم`);
    leaves(main);
  };
  main.querySelectorAll('button[data-date]').forEach((b) => (b.onclick = async () => {
    await run(() => api('DELETE', `/api/leaves?code=${encodeURIComponent(b.dataset.code)}&date=${b.dataset.date}`), 'اتحذف');
    leaves(main);
  }));
}

// ---------- الورديات ----------

/** خانات الشيفت: بداية ونهاية، ولو الشيفت بيبدأ بعد نص الليل بيتحسب على اليوم اللي قبله */
function shiftFields(start = 540, end = 1020, prefix = '') {
  return `
    <label>من <input type="time" name="${prefix}start" value="${clock(start)}" required></label>
    <label>لحد <input type="time" name="${prefix}end" value="${clock(end)}" required></label>
    <label class="check"><input type="checkbox" name="${prefix}afterMidnight" ${start >= 1440 ? 'checked' : ''}> الشيفت بيبدأ بعد نص الليل (تبع اليوم اللي قبله)</label>`;
}
function readShift(f, prefix = '') {
  let s = toMin(f[prefix + 'start']);
  let e = toMin(f[prefix + 'end']);
  if (f[prefix + 'afterMidnight']) s += 1440;
  while (e <= s) e += 1440;
  return { start: s, end: e };
}

async function shifts(main) {
  const list = await run(() => api('GET', `/api/branches/${state.branchId}/shift-changes`));
  const p = periodRange();
  main.innerHTML = `
    <div class="card">
      <h2>طلب تغيير حالة</h2>
      <p class="hint">${isHR() ? 'طلب الـ HR بيتعتمد على طول.' : 'الطلب بيروح للـ HR يعتمده.'} المؤقت بيرجع الموظف لشيفته الأصلي بعد آخر يوم.</p>
      <form id="change">
        <div class="row">
          <label>الموظف <select name="employee_code" required>${employeeOptions(undefined, true)}</select></label>
          <label>النوع <select name="kind"><option value="temporary">مؤقت</option><option value="permanent">دائم</option></select></label>
          <label>من يوم <input type="date" name="date_from" value="${p.from}" required></label>
          <label>لحد يوم (للمؤقت) <input type="date" name="date_to"></label>
        </div>
        <div class="row" style="margin-top:10px">
          <label class="check"><input type="checkbox" name="changeShift" checked> تغيير الشيفت:</label>
          ${shiftFields()}
        </div>
        <div class="row" style="margin-top:10px">
          <label class="check"><input type="checkbox" name="change_weekly_off"> تغيير الإجازة الأسبوعية:</label>
          <label><select name="weekly_off"><option value="">من غير إجازة</option>${WEEKDAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label>
          <label style="flex:1">ملاحظة <input name="note"></label>
          <button class="btn primary">إرسال</button>
        </div>
      </form>
    </div>
    <div class="card">
      <h2>الطلبات</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>الموظف</th><th>النوع</th><th>الفترة</th><th>الشيفت الجديد</th><th>الإجازة الأسبوعية</th><th>ملاحظة</th><th>طلبه</th><th>الحالة</th></tr></thead>
        <tbody>${list.map((c) => `
          <tr><td>${esc(c.employee_name)}</td><td>${c.kind === 'temporary' ? 'مؤقت' : 'دائم'}</td>
            <td>${esc(c.date_from)}${c.date_to ? ` ← ${esc(c.date_to)}` : ''}</td>
            <td class="num">${c.shift_start === null ? '—' : `${clock(c.shift_start)} ← ${clock(c.shift_end)}`}</td>
            <td>${c.change_weekly_off ? (c.weekly_off === null ? 'من غير' : WEEKDAYS[c.weekly_off]) : '—'}</td>
            <td>${esc(c.note)}</td><td>${esc(c.requested_by_name)}</td>
            <td>${c.status === 'pending'
              ? (isHR() ? `<button class="btn small primary" data-id="${c.id}" data-ok="1">اعتماد</button> <button class="btn small danger" data-id="${c.id}">رفض</button>` : '<span class="badge warn">مستني الـ HR</span>')
              : c.status === 'approved' ? '<span class="badge ok">معتمد</span>' : '<span class="badge danger">مرفوض</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">مفيش طلبات</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  main.querySelector('#change').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const s = f.changeShift ? readShift(f) : { start: null, end: null };
    const r = await run(() => api('POST', '/api/shift-changes', {
      employee_code: f.employee_code, kind: f.kind, date_from: f.date_from, date_to: f.date_to || null,
      shift_start: s.start, shift_end: s.end, change_weekly_off: !!f.change_weekly_off,
      weekly_off: f.weekly_off === '' ? null : Number(f.weekly_off), note: f.note || null,
    }));
    toast(r.status === 'approved' ? 'اتعتمد' : 'اتبعت للـ HR');
    shifts(main);
  };
  main.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = async () => {
    await run(() => api('POST', `/api/shift-changes/${b.dataset.id}`, { approve: !!b.dataset.ok }), b.dataset.ok ? 'اتعتمد' : 'اترفض');
    shifts(main);
  }));
}

// ---------- رفع سوفتك ----------

async function upload(main, result) {
  const imports = await run(() => api('GET', `/api/branches/${state.branchId}/imports`));
  main.innerHTML = `
    <div class="card">
      <h2>رفع ملف سوفتك</h2>
      <p class="hint">ملف الحضور والانصراف زي ما بيطلع من سوفتك (XML أو Excel أو HTML أو CSV). لو نفس الأيام اترفعت قبل كده، بتتحدّث، وقرارات المدير على الخروج الغريب بتفضل زي ما هي.</p>
      <form id="up" class="row">
        <input type="file" name="file" accept=".xml,.xls,.xlsx,.csv,.html,.htm,.txt" required>
        <button class="btn primary">رفع</button>
      </form>
    </div>
    <div id="result"></div>
    ${imports.length ? `
    <div class="card">
      <h2>ربط اسم سوفتك</h2>
      <p class="hint">لو اسم في سوفتك اتربط بموظف غلط، اكتبه هنا زي ما هو في الملف واختار الموظف الصح. الربط بيتحفظ، وآخر ملف بيتعاد حسابه.</p>
      <form id="alias" class="row">
        <label>الاسم في سوفتك <input name="softechName" required size="24"></label>
        <label>الموظف <select name="code" required><option value="">اختار الموظف…</option>${employeeOptions()}</select></label>
        <button class="btn primary">حفظ الربط</button>
      </form>
    </div>` : ''}
    <div class="card">
      <h2>آخر الملفات</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>الملف</th><th>اترفع</th><th class="num">صفوف</th><th class="num">أيام</th><th>أسامي محتاجة ربط</th><th></th></tr></thead>
        <tbody>${imports.map((i) => {
          const u = i.unmatched ? JSON.parse(i.unmatched) : { unmatched: [], ambiguous: [] };
          const n = u.unmatched.length + u.ambiguous.length;
          return `<tr><td>${esc(i.file_name)}</td><td>${esc(i.created_at)}</td><td class="num">${i.rows ?? ''}</td><td class="num">${i.days ?? ''}</td>
            <td>${n ? `<span class="badge warn">${n}</span>` : '<span class="badge ok">0</span>'}</td>
            <td><button class="btn small" data-id="${i.id}">إعادة معالجة</button></td></tr>`;
        }).join('') || '<tr><td colspan="6" class="empty">مفيش ملفات لسه</td></tr>'}
        </tbody>
      </table></div>
    </div>`;

  const showResult = (r) => {
    const names = [...r.ambiguous.map((n) => [n, 'متكرر']), ...r.unmatched.map((n) => [n, 'مش معروف'])];
    document.getElementById('result').innerHTML = `
      <div class="card">
        <h2>نتيجة ${esc(r.fileName)}</h2>
        <div class="stats">
          <div class="stat"><div class="label">صفوف</div><div class="value">${r.rows}</div></div>
          <div class="stat"><div class="label">أيام اتسجلت</div><div class="value">${r.days}</div></div>
          <div class="stat"><div class="label">أسامي اتربطت</div><div class="value">${r.matchedNames}</div></div>
          <div class="stat"><div class="label">خروج غريب</div><div class="value">${r.exits}</div></div>
        </div>
        ${r.warnings.map((w) => `<p class="hint">⚠ ${esc(w)}</p>`).join('')}
        ${r.otherBranchDays?.length ? `<p class="hint">⚠ ${r.otherBranchDays.length} يوم ماتسجّلوش لأن الموظف كان في فرع تاني يومها: ${r.otherBranchDays.slice(0, 10).map((d) => `${esc(d.name)} ${esc(d.date)}`).join('، ')}${r.otherBranchDays.length > 10 ? '…' : ''}</p>` : ''}
        ${names.length ? `
          <h3>أسامي محتاجة ربط (${names.length})</h3>
          <p class="hint">سوفتك بيطلّع الاسم بس. اختار الموظف لكل اسم مرة واحدة، والربط بيتحفظ للمرات الجاية.</p>
          <div class="table-wrap"><table><tbody>${names.map(([n, why]) => `
            <tr><td>${esc(n)} <span class="badge warn">${why}</span></td>
              <td><select data-name="${esc(n)}"><option value="">اختار الموظف…</option>${employeeOptions()}</select></td></tr>`).join('')}
          </tbody></table></div>
          <div class="row" style="margin-top:10px"><button class="btn primary" id="saveAliases">حفظ الربط وإعادة المعالجة</button></div>` : ''}
        ${r.dayWarnings.length ? `
          <h3>تنبيهات على الأيام (${r.dayWarnings.length})</h3>
          <div class="table-wrap"><table><tbody>${r.dayWarnings.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.date)}</td><td>${d.warnings.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>`;
    document.getElementById('saveAliases')?.addEventListener('click', async () => {
      const picks = [...document.querySelectorAll('select[data-name]')].filter((s) => s.value);
      if (!picks.length) return toast('مااخترتش أي موظف', true);
      for (const s of picks) await run(() => api('POST', `/api/branches/${state.branchId}/aliases`, { softechName: s.dataset.name, code: s.value }));
      const again = await run(() => api('POST', `/api/imports/${r.importId}/reprocess`), 'اتعادت المعالجة');
      await loadBranch();
      upload(main, again);
    });
  };
  if (result) showResult(result);

  main.querySelector('#alias')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    await run(() => api('POST', `/api/branches/${state.branchId}/aliases`, { softechName: f.softechName.trim(), code: f.code }));
    const again = await run(() => api('POST', `/api/imports/${imports[0].id}/reprocess`), 'اتحفظ الربط واتعاد الحساب');
    await loadBranch();
    upload(main, again);
  });

  main.querySelector('#up').onsubmit = async (ev) => {
    ev.preventDefault();
    const file = ev.target.file.files[0];
    if (!file) return;
    const r = await run(() => api('POST', `/api/branches/${state.branchId}/softech`, file, true), 'اترفع الملف');
    await loadBranch();
    upload(main, r);
  };
  main.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = async () => {
    const r = await run(() => api('POST', `/api/imports/${b.dataset.id}/reprocess`), 'اتعادت المعالجة');
    upload(main, r);
  }));
}

// ---------- الموظفين ----------

function employees(main, editing) {
  const e = editing ?? {};
  main.innerHTML = `
    ${isHR() ? `
    <div class="card">
      <h2>${editing ? `تعديل ${esc(e.name)}` : 'إضافة موظف'}</h2>
      <form id="emp">
        <div class="row">
          <label>الكود <input name="code" value="${esc(e.code)}" ${editing ? 'readonly' : ''} required size="8"></label>
          <label>الاسم <input name="name" value="${esc(e.name)}" required size="28"></label>
          <label>الوظيفة <input name="role" value="${esc(e.role)}" size="14"></label>
          <label>النوع <select name="gender"><option></option>${['ذكر', 'أنثى'].map((g) => `<option ${e.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
          <label>تاريخ التعيين <input type="date" name="hire_date" value="${esc(e.hire_date)}"></label>
          <label>تاريخ الاستقالة <input type="date" name="resignation_date" value="${esc(e.resignation_date)}"></label>
        </div>
        <div class="row" style="margin-top:10px">
          <label>طريقة الحساب <select name="method">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${e.method === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          ${shiftFields(e.shift_start ?? 540, e.shift_end ?? 1020)}
          <label>الإجازة الأسبوعية <select name="weekly_off"><option value="">من غير</option>${WEEKDAYS.map((d, i) => `<option value="${i}" ${e.weekly_off === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        </div>
        <div class="row" style="margin-top:10px">
          <label class="check"><input type="checkbox" name="late_grace" ${e.late_grace ?? 1 ? 'checked' : ''}> سماح تأخير 10 دقايق</label>
          <label class="check"><input type="checkbox" name="handover" ${e.handover ? 'checked' : ''}> تسليم شيفت 15 دقيقة</label>
          <label>ساعات العقد (لو مختلفة عن الشيفت) <input type="number" step="0.5" name="contract_hours" value="${e.contract_hours ?? ''}" style="width:90px"></label>
          <label title="زي المدير: بيتحاسب على مجموع ساعات الشهر بدل التأخير اليومي">ساعات الشهر المطلوبة <input type="number" step="1" name="monthly_hours" value="${e.monthly_hours ?? ''}" placeholder="${editing ? '' : 'المدير 260'}" style="width:90px"></label>
          <label>التعيين في فرع خارجي <input name="expat_status" value="${esc(e.expat_status)}" size="14"></label>
          <label class="check"><input type="checkbox" name="active" ${e.active ?? 1 ? 'checked' : ''}> شغال</label>
          <button class="btn primary">حفظ</button>
          ${editing ? '<button type="button" class="btn" id="cancel">إلغاء</button>' : ''}
        </div>
      </form>
    </div>
    ${editing && state.branches.length > 1 ? `
    <div class="card">
      <h2>نقل ${esc(e.name)} لفرع تاني</h2>
      <p class="hint">شهر النقل بيتقسم: كل فرع بيتحسب له أيامه. بنود الشهر وخصم الإجازات والرصيد بيطلعوا في تقرير الفرع الجديد. الشيفت الجديد اختياري، ولو ماتحددش الموظف بيفضل على شيفته.</p>
      <form id="transfer">
        <div class="row">
          <label>الفرع الجديد <select name="to_branch_id" required>${state.branches.filter((b) => b.id !== e.branch_id).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>
          <label>أول يوم في الفرع الجديد <input type="date" name="date" required></label>
        </div>
        <div class="row" style="margin-top:10px">
          <label class="check"><input type="checkbox" name="changeShift"> شيفت جديد:</label>
          ${shiftFields(e.shift_start, e.shift_end, 't_')}
        </div>
        <div class="row" style="margin-top:10px">
          <label class="check"><input type="checkbox" name="change_weekly_off"> إجازة أسبوعية جديدة:</label>
          <label><select name="weekly_off"><option value="">من غير إجازة</option>${WEEKDAYS.map((d, i) => `<option value="${i}" ${e.weekly_off === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <button class="btn primary">نقل</button>
        </div>
      </form>
    </div>` : ''}
    <div class="card">
      <h2>استيراد شيت فرع كامل</h2>
      <p class="hint">شيت الفرع اللي كان بيتعمل على الدرايف (زي شيت أرابيسك). نزّله من جوجل شيتس: <strong>ملف ← تنزيل ← Microsoft Excel (.xlsx)</strong>، وارفعه هنا.
        البرنامج بيدخّل الموظفين ومواعيدهم، وكل الحضور والإجازات والبنود اللي في الشيت، وبعد كده بيقارن حسبته بأرقام الشيت.
        لو الشيت اترفع قبل كده، بيانات موظفينه بتتبدّل بالجديدة.</p>
      <form id="impSheet" class="row"><input type="file" name="file" accept=".xlsx" required><button class="btn primary">استيراد الشيت</button></form>
      <div id="sheetResult"></div>
    </div>
    <div class="card">
      <h2>استيراد موظفين من ملف</h2>
      <p class="hint">زي شيت "بيانات العاملين": أعمدة الكود واسم الموظف (لازم)، والوظيفة والنوع وتاريخ التعيين (اختياري). الموظف الموجود بيتحدّث، ومواعيد الشيفت بتتظبط من هنا بعد كده.</p>
      <form id="impEmp" class="row"><input type="file" name="file" accept=".xml,.xls,.xlsx,.csv,.html,.htm,.txt" required><button class="btn">استيراد</button></form>
    </div>` : ''}
    <div class="card">
      <h2>موظفين الفرع (${state.employees.length})</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>الكود</th><th>الاسم</th><th>الوظيفة</th><th>طريقة الحساب</th><th class="num">الشيفت</th><th>الإجازة الأسبوعية</th><th>التعيين</th><th>الحالة</th></tr></thead>
        <tbody>${state.employees.map((x) => `
          <tr class="${isHR() && !x.left_on ? 'clickable' : ''} ${x.active && !x.left_on ? '' : 'muted'}" data-code="${esc(x.code)}">
            <td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${METHODS[x.method]}</td>
            <td class="num">${clock(x.shift_start)} ← ${clock(x.shift_end)}${x.shift_start >= 1440 ? ' <span class="badge">ليلي</span>' : ''}</td>
            <td>${x.weekly_off === null ? '—' : WEEKDAYS[x.weekly_off]}</td><td>${esc(x.hire_date)}</td>
            <td>${x.left_on ? `<span class="badge accent">اتنقل · آخر يوم ${esc(x.left_on)}</span>` : x.resignation_date ? `<span class="badge danger">استقال ${esc(x.resignation_date)}</span>` : x.active ? '' : '<span class="badge">مش شغال</span>'}</td>
          </tr>`).join('') || '<tr><td colspan="8" class="empty">مفيش موظفين لسه</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  if (!isHR()) return;
  main.querySelectorAll('tr.clickable').forEach((tr) => (tr.onclick = () => {
    employees(main, state.employees.find((x) => x.code === tr.dataset.code));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  main.querySelector('#cancel')?.addEventListener('click', () => employees(main));
  main.querySelector('#emp').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const s = readShift(f);
    await run(() => api('POST', '/api/employees', {
      code: f.code, name: f.name, role: f.role, gender: f.gender || null, branch_id: editing?.branch_id ?? state.branchId,
      hire_date: f.hire_date || null, resignation_date: f.resignation_date || null,
      method: f.method, shift_start: s.start, shift_end: s.end, weekly_off: f.weekly_off === '' ? null : Number(f.weekly_off),
      late_grace: f.late_grace ? 1 : 0, handover: f.handover ? 1 : 0, contract_hours: f.contract_hours === '' ? null : Number(f.contract_hours),
      // فاضي في موظف جديد = الافتراضي (المدير 260)
      monthly_hours: f.monthly_hours === '' ? (editing ? null : undefined) : Number(f.monthly_hours),
      expat_status: f.expat_status || null, active: f.active ? 1 : 0,
    }), 'اتحفظ');
    await loadBranch();
    employees(main);
  };
  main.querySelector('#transfer')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const to = state.branches.find((b) => b.id === Number(f.to_branch_id));
    if (!confirm(`نقل ${e.name} لفرع ${to.name} من يوم ${f.date}؟`)) return;
    const sh = f.changeShift ? readShift(f, 't_') : { start: null, end: null };
    await run(() => api('POST', `/api/employees/${encodeURIComponent(e.code)}/transfer`, {
      to_branch_id: Number(f.to_branch_id), date: f.date, shift_start: sh.start, shift_end: sh.end,
      change_weekly_off: !!f.change_weekly_off, weekly_off: f.weekly_off === '' ? null : Number(f.weekly_off),
    }), 'اتنقل الموظف');
    await loadBranch();
    employees(main);
  });
  main.querySelector('#impSheet').onsubmit = async (ev) => {
    ev.preventDefault();
    const file = ev.target.file.files[0];
    const box = main.querySelector('#sheetResult');
    box.innerHTML = '<p class="loading">بيستورد ويقارن… ممكن ياخد دقيقة</p>';
    const r = await run(() => api('POST', '/api/import/branch-sheet', file, true)).catch(() => null);
    if (!r) { box.innerHTML = ''; return; }
    const v = r.verification;
    const pct = v.checked ? Math.round((v.matched / v.checked) * 1000) / 10 : 0;
    box.innerHTML = `
      <div class="stats" style="margin-top:12px">
        <div class="stat"><div class="label">الفرع</div><div class="value">${esc(r.branch.name)}</div></div>
        <div class="stat"><div class="label">موظفين</div><div class="value">${r.employees}</div></div>
        <div class="stat"><div class="label">أيام حضور</div><div class="value">${r.days}</div></div>
        <div class="stat"><div class="label">إجازات</div><div class="value">${r.leaves}</div></div>
        <div class="stat"><div class="label">المطابقة مع الشيت</div><div class="value">${v.matched} / ${v.checked} <span class="sub">(${pct}%)</span></div></div>
      </div>
      ${v.mismatches.length ? `<h3>الاختلافات مع الشيت (${v.mismatches.length})</h3>
        <div class="table-wrap"><table><thead><tr><th>الموظف</th><th class="num">الشهر</th><th>البند</th><th class="num">الشيت</th><th class="num">البرنامج</th><th>السبب</th></tr></thead>
        <tbody>${v.mismatches.map((m) => `<tr><td>${esc(m.name)} <span class="sub">${esc(m.code)}</span></td><td class="num">${MONTHS[m.month - 1]}</td><td>${esc(m.field)}</td><td class="num">${m.sheet}</td><td class="num">${m.app}</td><td>${m.note ? `<span class="badge warn">غلط في الشيت: ${esc(m.note)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">✔ كل الأرقام طابقت الشيت.</p>'}
      ${r.warnings.length ? `<h3>تنبيهات (${r.warnings.length})</h3><p class="hint">${r.warnings.map(esc).join('<br>')}</p>` : ''}`;
    state.branches = await api('GET', '/api/branches');
  };
  main.querySelector('#impEmp').onsubmit = async (ev) => {
    ev.preventDefault();
    const file = ev.target.file.files[0];
    const r = await run(() => api('POST', `/api/branches/${state.branchId}/employees/import`, file, true));
    toast(`اتضاف ${r.created} واتحدّث ${r.updated}${r.otherBranch.length ? ` · ${r.otherBranch.length} في فرع تاني ماتغيّروش (استخدم النقل)` : ''}`);
    await loadBranch();
    employees(main);
  };
}

// ---------- المستخدمين ----------

async function users(main) {
  const [list, bk] = await run(() => Promise.all([api('GET', '/api/users'), api('GET', '/api/backups')]));
  const size = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
  main.innerHTML = `
    ${window.HR_REPLACE_DB ? `
    <div class="card">
      <h2>رفع بيانات البرنامج من الجهاز</h2>
      <p class="hint">اختار ملف <strong>بيانات للموقع.db</strong> من فولدر البرنامج. البيانات اللي على الموقع دلوقتي هتتشال وتتحط مكانها بيانات الجهاز.</p>
      <label class="btn">اختار الملف <input type="file" id="replaceDb" accept=".db" hidden></label>
    </div>` : ''}
    ${window.HR_LOGOUT ? `
    <div class="card">
      <h2>حسابات الموقع</h2>
      <p class="hint">الحسابات بتتعمل من لوحة Supabase: Authentication ← Users ← Add user (إيميل وكلمة سر، وعلّم على Auto Confirm User).
        كل اللي ليهم حساب بيشوفوا ويعدّلوا نفس البيانات.</p>
    </div>` : ''}
    <div class="card" ${window.HR_LOGOUT ? 'hidden' : ''}>
      <h2>إضافة مستخدم</h2>
      <form id="user" class="row">
        <label>اسم المستخدم <input name="username" required autocomplete="off"></label>
        <label>الاسم <input name="name" required></label>
        <label>الدور <select name="role"><option value="manager">مدير فرع</option><option value="hr">HR</option></select></label>
        <label>الفرع (لمدير الفرع) <select name="branch_id">${state.branches.map((b) => `<option value="${b.id}" ${b.id === state.branchId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
        <label>كلمة السر <input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn primary">إضافة</button>
      </form>
    </div>
    <div class="card" ${window.HR_LOGOUT ? 'hidden' : ''}>
      <h2>المستخدمين</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>اسم المستخدم</th><th>الاسم</th><th>الدور</th><th>الفرع</th><th></th></tr></thead>
        <tbody>${list.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${u.role === 'hr' ? 'HR' : 'مدير فرع'}</td><td>${esc(u.branch)}</td>
          <td>${u.id === state.user.id ? '' : `<button class="btn small" data-reset="${u.id}" data-name="${esc(u.name)}">إعادة تعيين كلمة السر</button>`}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="card" ${window.HR_LOGOUT ? 'hidden' : ''}>
      <div class="row" style="justify-content: space-between">
        <h2>النسخ الاحتياطي</h2>
        ${bk.enabled ? '<button class="btn primary" id="backupNow">اعمل نسخة دلوقتي</button>' : ''}
      </div>
      ${bk.enabled
        ? `<p class="hint">نسخة كاملة من البيانات بتتعمل لوحدها كل يوم في فولدر <strong>${esc(bk.dir)}</strong>. انسخ الفولدر ده على فلاشة أو جهاز تاني كل فترة، عشان لو الجهاز ده حصله حاجة.</p>
          <div class="table-wrap"><table>
            <thead><tr><th>النسخة</th><th>اتعملت</th><th class="num">الحجم</th></tr></thead>
            <tbody>${bk.backups.map((b) => `<tr><td>${esc(b.file)}</td><td>${esc(new Date(b.createdAt).toLocaleString('ar-EG'))}</td><td class="num">${size(b.size)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">مفيش نسخ لسه</td></tr>'}</tbody>
          </table></div>`
        : '<p class="hint">النسخ الاحتياطي مقفول (ده طبيعي في البيانات الوهمية).</p>'}
    </div>`;
  main.querySelector('#user').onsubmit = async (ev) => {
    ev.preventDefault();
    await run(() => api('POST', '/api/users', formData(ev.target)), 'اتضاف المستخدم');
    users(main);
  };
  main.querySelectorAll('button[data-reset]').forEach((b) => (b.onclick = async () => {
    const pw = prompt(`كلمة السر الجديدة لـ ${b.dataset.name} (8 حروف على الأقل). ابعتها له بنفسك، وهو يغيّرها بعد ما يدخل.`);
    if (!pw) return;
    await run(() => api('POST', `/api/users/${b.dataset.reset}/password`, { password: pw }), 'اتغيرت كلمة السر');
  }));
  main.querySelector('#replaceDb')?.addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file || !confirm(`البيانات اللي على الموقع هتتشال وتتحط مكانها "${file.name}". متأكد؟`)) return;
    await run(() => window.HR_REPLACE_DB(file), 'اترفعت البيانات');
    await start();
  });
  main.querySelector('#backupNow')?.addEventListener('click', async () => {
    await run(() => api('POST', '/api/backups'), 'اتعملت النسخة');
    users(main);
  });
}

/** تغيير كلمة السر لأي مستخدم (من زرار في الهيدر) */
function changePasswordDialog() {
  const bg = document.createElement('div');
  bg.className = 'drawer-bg';
  const box = document.createElement('div');
  box.className = 'card login';
  box.style.cssText = 'position: fixed; inset-inline: 0; top: 10vh; z-index: 21; margin-inline: auto;';
  box.setAttribute('role', 'dialog');
  box.innerHTML = `
    <h2>تغيير كلمة السر</h2>
    <form id="pw" class="row">
      <label>كلمة السر الحالية <input name="current" type="password" required autocomplete="current-password"></label>
      <label>كلمة السر الجديدة (8 حروف على الأقل) <input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <label>اكتبها تاني <input name="again" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primary">حفظ</button>
      <button type="button" class="btn" id="pwCancel">إلغاء</button>
    </form>`;
  const close = () => { bg.remove(); box.remove(); };
  bg.onclick = close;
  document.body.append(bg, box);
  box.querySelector('#pwCancel').onclick = close;
  box.querySelector('#pw').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    if (f.password !== f.again) return toast('كلمتين السر مش زي بعض', true);
    await run(() => api('POST', '/api/me/password', { current: f.current, password: f.password }), 'اتغيرت كلمة السر');
    close();
  };
}

// ---------- البداية ----------

/** أول تشغيل: مفيش ولا مستخدم، فبنعمل حساب الـ HR */
function renderSetup() {
  $app.innerHTML = `
    <div class="card login">
      <h2>أهلًا بيك 👋</h2>
      <p class="hint">ده أول تشغيل للبرنامج. اعمل حساب الـ HR اللي هتدخل بيه، وبعد كده هتقدر تعمل الفروع وحسابات مديرين الفروع من جوه البرنامج.</p>
      <form id="setup" class="row">
        <label>اسمك <input name="name" required></label>
        <label>اسم المستخدم (بالإنجليزي) <input name="username" required pattern="[A-Za-z0-9._\\-]{2,30}" autocomplete="username"></label>
        <label>كلمة السر (8 حروف على الأقل) <input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <label>اكتب كلمة السر تاني <input name="again" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn primary">إنشاء الحساب والدخول</button>
      </form>
    </div>`;
  document.getElementById('setup').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    if (f.password !== f.again) return toast('كلمتين السر مش زي بعض', true);
    state.user = await run(() => api('POST', '/api/setup', { name: f.name, username: f.username, password: f.password }));
    await start();
  };
}

(async () => {
  if (location.protocol === 'file:') return; // boot.js بيتعامل مع الحالة دي
  try {
    state.user = await api('GET', '/api/me');
    await start();
  } catch {
    const s = await api('GET', '/api/setup').catch(() => ({ needsSetup: false }));
    state.demoLogin = s.demoLogin;
    if (s.needsSetup) renderSetup();
    else renderLogin();
  }
})();
