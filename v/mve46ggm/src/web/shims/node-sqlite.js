// بديل node:sqlite في المتصفح: نفس واجهة DatabaseSync اللي البرنامج بيستخدمها، فوق sql.js (SQLite مبني WebAssembly).
// sql.js لازم يبقى متحمّل قبل ما أي قاعدة تتفتح: globalThis.__SQL (من src/web/main.ts).

const norm = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

export class DatabaseSync {
  constructor(_path, _options) {
    const SQL = globalThis.__SQL;
    if (!SQL) throw new Error('sql.js لسه ماتحمّلش');
    // لو فيه قاعدة محمّلة (من التخزين) بنفتحها، غير كده قاعدة فاضية
    const bytes = globalThis.__HR_DB_BYTES;
    globalThis.__HR_DB_BYTES = undefined;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    const db = this.db;
    const rows = (params, first) => {
      const st = db.prepare(sql);
      try {
        st.bind(norm(params));
        const out = [];
        while (st.step()) {
          out.push(st.getAsObject());
          if (first) break;
        }
        return out;
      } finally {
        st.free();
      }
    };
    return {
      run: (...params) => {
        db.run(sql, norm(params));
        const id = db.exec('select last_insert_rowid()')[0]?.values[0][0] ?? 0;
        return { changes: db.getRowsModified(), lastInsertRowid: id };
      },
      get: (...params) => rows(params, true)[0],
      all: (...params) => rows(params, false),
    };
  }

  /** نسخة كاملة من القاعدة (للحفظ) */
  export() {
    return this.db.export();
  }

  close() {
    this.db.close();
  }
}
