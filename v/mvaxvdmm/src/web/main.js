// الموقع: البرنامج كله بيشتغل جوه المتصفح بنفس كود السيرفر (routes.ts)، وقاعدة البيانات SQLite (sql.js).
// التخزين:
//   - Supabase (لو متظبط في site-config.js): قاعدة واحدة مشتركة لكل اللي بيفتحوا الموقع.
//   - غير كده: في متصفح الزائر بس (IndexedDB).
// أي تعديل بيتحفظ فورًا. لو حد تاني حفظ قبله، الموقع بيحمّل آخر نسخة ويعيد التعديل عليها.
import { Buffer } from 'https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm';
(globalThis       ).Buffer = Buffer;

const SQLJS = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/';

                  
                           
                  
 
                 
               
                          
                                                                                                           
                                                                           
                             
 

// ---------- Supabase ----------

const toB64 = (u8            ) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64        ) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function supabaseStore(url        , key        )        {
  const api = `${url.replace(/\/$/, '')}/rest/v1/app_state`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const get = async (select        ) => {
    const r = await fetch(`${api}?id=eq.1&select=${select}`, { headers });
    if (!r.ok) throw new Error(`مش قادر يوصل لقاعدة البيانات المشتركة (${r.status})`);
    return (await r.json())[0]                                                  ;
  };
  return {
    name: 'مشتركة (Supabase)',
    async load() {
      const row = await get('version,data');
      return row ? { bytes: fromB64(row.data ), version: row.version } : { bytes: null, version: 0 };
    },
    async version() {
      return (await get('version'))?.version ?? 0;
    },
    async save(bytes, expected) {
      const data = toB64(bytes);
      const prefer = { ...headers, Prefer: 'return=representation' };
      const r = expected === 0
        ? await fetch(api, { method: 'POST', headers: prefer, body: JSON.stringify({ id: 1, version: 1, data }) })
        : await fetch(`${api}?id=eq.1&version=eq.${expected}`, { method: 'PATCH', headers: prefer, body: JSON.stringify({ version: expected + 1, data }) });
      if (r.status === 409) return null;
      if (!r.ok) throw new Error(`الحفظ فشل (${r.status})`);
      const rows = await r.json();
      return rows.length ? rows[0].version : null;
    },
  };
}

// ---------- في المتصفح (IndexedDB) ----------

function browserStore()        {
  const open = () =>
    new Promise             ((res, rej) => {
      const req = indexedDB.open('hudoor-al-forou3', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('state');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  const tx = async    (mode                    , fn                                      ) => {
    const idb = await open();
    return new Promise   ((res, rej) => {
      const r = fn(idb.transaction('state', mode).objectStore('state'));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  };
  return {
    name: 'في المتصفح ده بس',
    async load() {
      const v = (await tx('readonly', (s) => s.get('db')))                      ;
      return v ?? { bytes: null, version: 0 };
    },
    async version() {
      return ((await tx('readonly', (s) => s.get('db')))                      )?.version ?? 0;
    },
    async save(bytes, expected) {
      const cur = await this.version();
      if (cur !== expected) return null;
      await tx('readwrite', (s) => s.put({ bytes, version: expected + 1 }, 'db'));
      return expected + 1;
    },
  };
}

// ---------- التشغيل ----------

const status = (msg        ) => {
  const el = document.getElementById('app');
  if (el) el.innerHTML = `<p class="loading">${msg}</p>`;
};

async function start() {
  status('بيحمّل البرنامج…');
  const initSqlJs = (globalThis       ).initSqlJs;
  (globalThis       ).__SQL = await initSqlJs({ locateFile: (f        ) => SQLJS + f });

  const { openDb } = await import('../server/db.js');
  const { createRouter } = await import('../server/routes.js');
  const { seedDemo } = await import('../demo/seed.js');
  const cfg = (globalThis       ).HR_SITE_CONFIG ?? {};
  const store = cfg.supabaseUrl && cfg.supabaseKey ? supabaseStore(cfg.supabaseUrl, cfg.supabaseKey) : browserStore();

  let db     ;
  let router                                 ;
  let version = 0;
  let lastCheck = 0;

  const loadFrom = (s        ) => {
    (globalThis       ).__HR_DB_BYTES = s.bytes ?? undefined;
    db = openDb(':memory:');
    version = s.version;
    router = createRouter(db, { requireLogin: false });
  };

  status('بيحمّل البيانات…');
  loadFrom(await store.load());
  if (version === 0) {
    // أول مرة: البيانات الوهمية
    seedDemo(db);
    const v = await store.save(db.export(), 0);
    if (v === null) loadFrom(await store.load());
    else version = v;
  }

  /** لو حد تاني حفظ نسخة أحدث، نحمّلها */
  const refresh = async (force = false) => {
    if (!force && Date.now() - lastCheck < 4000) return;
    lastCheck = Date.now();
    if ((await store.version()) !== version) loadFrom(await store.load());
  };

  (globalThis       ).HR_STORE_NAME = store.name;
  (globalThis       ).HR_API = async (method        , path        , body          , isFile = false) => {
    const url = new URL(path, location.origin);
    let raw        ;
    if (body === undefined) raw = Buffer.alloc(0);
    else if (isFile) raw = Buffer.from(await (body        ).arrayBuffer());
    else raw = Buffer.from(JSON.stringify(body));
    const req = {
      method, url, ip: 'browser', requestedWith: 'hr-app', body: async () => raw,
      fileName: isFile ? (body        ).name : undefined,
    };
    if (method === 'GET') {
      await refresh();
      return router(req);
    }
    // تعديل: بينفذ ويحفظ، ولو حد سبقه بيحمّل آخر نسخة ويعيد
    for (let attempt = 0; attempt < 3; attempt++) {
      await refresh(true);
      const res = await router(req);
      if (res.status >= 400) return res;
      const v = await store.save(db.export(), version);
      if (v !== null) {
        version = v;
        return res;
      }
      loadFrom(await store.load());
    }
    return { status: 409, json: { error: 'حد تاني بيعدّل في نفس الوقت. جرّب تاني.' } };
  };

  await import('../../app.js');
}

start().catch((e) => {
  console.error(e);
  status(`البرنامج ماشتغلش: ${e.message}. اعمل تحديث للصفحة.`);
});
