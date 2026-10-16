// النسخ الاحتياطي: نسخة كاملة من قاعدة البيانات كل يوم (VACUUM INTO بيعمل نسخة متسقة والبرنامج شغال)،
// والنسخ الأقدم من keepDays بتتمسح.
import { mkdirSync, readdirSync, rmSync, statSync } from '../web/shims/node-fs.js';
import { join, resolve } from '../web/shims/node-path.js';
                                  

                               
                    
              
                                          
                   
                                                      
               
 

const PREFIX = 'hr-backup-';
const stamp = (d = new Date()) => {
  const p = (n        ) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function backupNow(db    , dir        )         {
  mkdirSync(dir, { recursive: true });
  const file = resolve(join(dir, `${PREFIX}${stamp()}.db`));
  db.prepare('vacuum into ?').run(file);
  return file;
}

export function listBackups(dir        ) {
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
      .map((f) => {
        const s = statSync(join(dir, f));
        return { file: f, size: s.size, createdAt: s.mtime.toISOString() };
      })
      .sort((a, b) => b.file.localeCompare(a.file));
  } catch {
    return [];
  }
}

export function pruneBackups(dir        , keepDays        , now = Date.now()) {
  const removed           = [];
  for (const b of listBackups(dir)) {
    if (now - Date.parse(b.createdAt) > keepDays * 86_400_000) {
      rmSync(join(dir, b.file), { force: true });
      removed.push(b.file);
    }
  }
  return removed;
}

const hasBackupToday = (dir        ) => {
  const today = stamp().slice(0, 10);
  return listBackups(dir).some((b) => b.file.startsWith(PREFIX + today));
};

/** بيعمل نسخة لو مفيش نسخة النهارده، وبعد كده كل يوم في الساعة المحددة. بيرجّع دالة لإيقافه */
export function scheduleBackups(db    , cfg              , log                        = console.log) {
  const run = () => {
    try {
      const file = backupNow(db, cfg.dir);
      const removed = pruneBackups(cfg.dir, cfg.keepDays);
      log(`اتعملت نسخة احتياطية: ${file}${removed.length ? ` (اتمسح ${removed.length} نسخة قديمة)` : ''}`);
    } catch (e) {
      log(`⚠ النسخة الاحتياطية فشلت: ${(e         ).message}`);
    }
  };
  if (!hasBackupToday(cfg.dir)) run();
  // كل ساعة بنشوف: لو جت الساعة المحددة ومفيش نسخة النهارده نعمل واحدة
  const timer = setInterval(() => {
    if (new Date().getHours() >= cfg.hour && !hasBackupToday(cfg.dir)) run();
  }, 3_600_000);
  timer.unref();
  return () => clearInterval(timer);
}
