// بديل node:crypto في المتصفح. الموقع شغال من غير تسجيل دخول، فكلمات السر هنا مش بتتراجع أبدًا.
// الهاش ده مش آمن، ومعمول بحيث لو القاعدة اتنقلت لسيرفر حقيقي، الدخول بكلمات السر دي يفشل (بيبقى لازم إعادة تعيين).

const bytes = (u8) => {
  const b = globalThis.Buffer.from(u8);
  const toString = b.toString.bind(b);
  b.toString = (enc, ...rest) => {
    if (enc === 'base64url') return toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return toString(enc, ...rest);
  };
  return b;
};

export function randomBytes(n) {
  return bytes(crypto.getRandomValues(new Uint8Array(n)));
}

export function scryptSync(password, salt, keylen) {
  // هاش بسيط (FNV) بطول المطلوب: كفاية لإن الموقع مش بيتحقق من كلمات السر
  const input = new TextEncoder().encode('web-demo:' + String(password)) ;
  const s = salt instanceof Uint8Array ? salt : new TextEncoder().encode(String(salt));
  const out = new Uint8Array(keylen);
  let h = 2166136261;
  for (let i = 0; i < keylen; i++) {
    for (const x of input) h = Math.imul(h ^ x, 16777619);
    for (const x of s) h = Math.imul(h ^ x, 16777619);
    out[i] = (h ^ (h >>> 16)) & 255;
  }
  return bytes(out);
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
