// بديل node:fs في المتصفح: مفيش ملفات على الموقع (النسخ الاحتياطي والملفات المحلية للسيرفر بس).
const unavailable = (name) => () => {
  throw new Error(`${name} مش متاح على الموقع`);
};
export const readFileSync = unavailable('قراءة الملفات');
export const writeFileSync = unavailable('كتابة الملفات');
export const mkdirSync = () => {};
export const rmSync = () => {};
export const existsSync = () => false;
export const readdirSync = () => [];
export const statSync = unavailable('بيانات الملفات');
