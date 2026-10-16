// بديل node:path في المتصفح (بيستخدمه النسخ الاحتياطي بس، وهو مقفول على الموقع)
export const join = (...p) => p.join('/').replace(/\/+/g, '/');
export const resolve = (...p) => join(...p);
export const basename = (p) => String(p).split(/[\\/]/).pop();
export const dirname = (p) => String(p).split(/[\\/]/).slice(0, -1).join('/') || '.';
export const relative = (_a, b) => b;
export const extname = (p) => (String(p).match(/\.[^./\\]*$/) || [''])[0];
export const normalize = (p) => p;
