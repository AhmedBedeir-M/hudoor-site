// بديل node:zlib في المتصفح (فك ضغط ملفات Excel) فوق مكتبة fflate.
import { inflateSync, deflateSync } from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm';

export const inflateRawSync = (buf) => globalThis.Buffer.from(inflateSync(buf));
export const deflateRawSync = (buf) => globalThis.Buffer.from(deflateSync(buf));
