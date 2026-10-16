// تسجيل الدخول: كلمات السر متخزنة scrypt مع salt، والجلسة كوكي HttpOnly.
import { randomBytes, scryptSync, timingSafeEqual } from '../web/shims/node-crypto.js';
                                  

                       
             
                   
               
                         
                           
 

const SESSION_HOURS = 12;

export function hashPassword(password        )         {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password        , stored        )          {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function createUser(
  db    ,
  u                                                                                                        ,
)         {
  if (!/^[A-Za-z0-9._-]{2,30}$/.test(u.username.trim())) throw new Error('اسم المستخدم بالإنجليزي من حرفين على الأقل، من غير مسافات');
  if (!u.name.trim()) throw new Error('الاسم مطلوب');
  if (u.password.length < 8) throw new Error('كلمة السر لازم تبقى 8 حروف على الأقل');
  if (u.role === 'manager' && !u.branchId) throw new Error('مدير الفرع لازم يتربط بفرع');
  const r = db
    .prepare('insert into users (username, name, password_hash, role, branch_id) values (?, ?, ?, ?, ?)')
    .run(u.username.trim(), u.name.trim(), hashPassword(u.password), u.role, u.role === 'manager' ? u.branchId  : null);
  return Number(r.lastInsertRowid);
}

/** تغيير كلمة السر (أو إعادة تعيينها من الـ HR). كل الجلسات المفتوحة للحساب بتتقفل ماعدا keepToken */
export function setPassword(db    , userId        , password        , keepToken         ) {
  if (password.length < 8) throw new Error('كلمة السر لازم تبقى 8 حروف على الأقل');
  db.prepare('update users set password_hash = ? where id = ?').run(hashPassword(password), userId);
  db.prepare('delete from sessions where user_id = ? and token != ?').run(userId, keepToken ?? '');
}

export function checkPassword(db    , userId        , password        )          {
  const row = db.prepare('select password_hash from users where id = ?').get(userId)                                         ;
  return !!row && verifyPassword(password, row.password_hash);
}

/**
 * حماية من تخمين كلمة السر: بعد 5 محاولات غلط لنفس الحساب من نفس الجهاز، أو 20 من نفس الجهاز،
 * الدخول بيتقفل 15 دقيقة.
 */
export class LoginLimiter {
          failures = new Map                  ();
                   windowMs = 15 * 60_000;
          perAccount        ;
          perIp        ;
  constructor(perAccount = 5, perIp = 20) {
    this.perAccount = perAccount;
    this.perIp = perIp;
  }

          recent(key        , now        ) {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.failures.set(key, list);
    return list;
  }

  /** بيرجّع الدقايق الباقية على فك القفل، أو 0 لو مسموح */
  blockedMinutes(ip        , username        , now = Date.now())         {
    const acc = this.recent(`${ip}|${username.toLowerCase()}`, now);
    const all = this.recent(ip, now);
    const over = acc.length >= this.perAccount ? acc : all.length >= this.perIp ? all : null;
    return over ? Math.ceil((this.windowMs - (now - over[0])) / 60_000) : 0;
  }

  fail(ip        , username        , now = Date.now()) {
    this.recent(`${ip}|${username.toLowerCase()}`, now).push(now);
    this.recent(ip, now).push(now);
  }

  succeed(ip        , username        ) {
    this.failures.delete(`${ip}|${username.toLowerCase()}`);
  }
}

export function login(db    , username        , password        )                                       {
  const row = db.prepare('select * from users where username = ?').get(username.trim())   
                                        
               ;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
  db.prepare('delete from sessions where expires_at < ?').run(new Date().toISOString());
  db.prepare('insert into sessions (token, user_id, expires_at) values (?, ?, ?)').run(token, row.id, expires);
  const { password_hash: _, ...user } = row;
  return { token, user };
}

export function userForToken(db    , token                    )              {
  if (!token) return null;
  const row = db
    .prepare(
      `select u.id, u.username, u.name, u.role, u.branch_id from sessions s join users u on u.id = s.user_id
       where s.token = ? and s.expires_at > ?`,
    )
    .get(token, new Date().toISOString())                    ;
  return row ?? null;
}

export function logout(db    , token                    ) {
  if (token) db.prepare('delete from sessions where token = ?').run(token);
}

/** مدير الفرع يشوف فرعه بس، والـ HR يشوف كل الفروع */
export function canAccessBranch(user      , branchId        )          {
  return user.role === 'hr' || user.branch_id === branchId;
}
