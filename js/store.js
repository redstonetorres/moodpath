/* ============================================================
   store.js — 数据层
   本地优先：所有内容存在浏览器 localStorage，永不外发。
   身份：一本日记 = 一个「记录空间」，带一枚恢复密钥。
   隐私：可选访问密码，开启后用 PBKDF2 + AES-GCM 加密落盘。
   ============================================================ */
(function (global) {
  'use strict';

  var NS = 'moodpath:v1:';
  var K_INDEX = NS + 'index';
  var K_DATA = NS + 'data:';   // 明文
  var K_ENC = NS + 'enc:';     // 密文

  var DEFAULT_QUOTE =
    '直到有一天我足够坚强，直面现实如剃刀般锋利，却再也不能破碎我的心。';

  var Store = {
    DEFAULT_QUOTE: DEFAULT_QUOTE,
    data: null,        // 当前空间的完整数据（内存）
    index: null,       // 空间目录
    spaceId: null,
    password: null,    // 会话内保存，仅用于加密落盘
    locked: false
  };

  var subtle = (global.crypto && global.crypto.subtle) ? global.crypto.subtle : null;
  Store.cryptoAvailable = !!subtle;

  /* ---------------- 底层读写 ---------------- */
  function readJSON(k, fallback) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.error('[moodpath] 写入失败', e); return false; }
  }

  function loadIndex() {
    Store.index = readJSON(K_INDEX, null) || { spaces: [], current: null };
    return Store.index;
  }
  function saveIndex() { writeJSON(K_INDEX, Store.index); }

  function emptyData(name) {
    return {
      version: 1,
      space: {
        id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name || '我的日子',
        key: U.randomKey(),
        createdAt: new Date().toISOString()
      },
      settings: {
        theme: 'system',
        quote: DEFAULT_QUOTE
      },
      entries: {}
    };
  }

  /* ---------------- 加密 ---------------- */
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    var s = atob(str), bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  function deriveKey(password, salt) {
    var enc = new TextEncoder();
    return subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false, ['encrypt', 'decrypt']
        );
      });
  }

  function encryptData(obj, password) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(password, salt).then(function (key) {
      var enc = new TextEncoder();
      return subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj)));
    }).then(function (ct) {
      return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
    });
  }

  function decryptData(pack, password) {
    var salt = unb64(pack.salt), iv = unb64(pack.iv), ct = unb64(pack.ct);
    return deriveKey(password, salt).then(function (key) {
      return subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    }).then(function (buf) {
      return JSON.parse(new TextDecoder().decode(buf));
    });
  }

  /* ---------------- 启动 ---------------- */
  /**
   * @returns {'new'|'locked'|'ready'}
   */
  Store.boot = function () {
    loadIndex();
    var idx = Store.index;
    if (!idx.spaces.length || !idx.current) return 'new';

    var id = idx.current;
    var meta = idx.spaces.filter(function (s) { return s.id === id; })[0];
    if (!meta) return 'new';

    Store.spaceId = id;

    if (meta.locked) {
      Store.locked = true;
      return 'locked';
    }
    var d = readJSON(K_DATA + id, null);
    if (!d) return 'new';
    Store.data = migrate(d);
    return 'ready';
  };

  function migrate(d) {
    d.version = d.version || 1;
    d.settings = d.settings || {};
    if (typeof d.settings.quote !== 'string' || !d.settings.quote.trim()) d.settings.quote = DEFAULT_QUOTE;
    if (!d.settings.theme) d.settings.theme = 'system';
    d.entries = d.entries || {};
    Object.keys(d.entries).forEach(function (k) {
      var e = d.entries[k];
      e.gratitude = normList(e.gratitude);
      e.regret = normList(e.regret);
      if (e.mood != null) e.mood = U.clamp(parseInt(e.mood, 10) || 3, 1, 5);
    });
    return d;
  }

  function normList(arr) {
    var out = ['', '', ''];
    if (Array.isArray(arr)) for (var i = 0; i < 3; i++) out[i] = typeof arr[i] === 'string' ? arr[i] : '';
    return out;
  }

  Store.createSpace = function (name) {
    loadIndex();
    var d = emptyData(name);
    Store.data = d;
    Store.spaceId = d.space.id;
    Store.index.spaces.push({ id: d.space.id, name: d.space.name, key: d.space.key, locked: false });
    Store.index.current = d.space.id;
    saveIndex();
    writeJSON(K_DATA + d.space.id, d);
    return d;
  };

  Store.unlock = function (password) {
    var pack = readJSON(K_ENC + Store.spaceId, null);
    if (!pack) return Promise.reject(new Error('找不到加密数据'));
    return decryptData(pack, password).then(function (d) {
      Store.data = migrate(d);
      Store.password = password;
      Store.locked = false;
      return d;
    });
  };

  /* ---------------- 持久化 ---------------- */
  var pending = false;
  Store.persist = function () {
    if (!Store.data) return Promise.resolve();
    var id = Store.spaceId;
    var meta = spaceMeta();
    if (meta) { meta.name = Store.data.space.name; }
    saveIndex();

    if (Store.password) {
      pending = true;
      return encryptData(Store.data, Store.password).then(function (pack) {
        writeJSON(K_ENC + id, pack);
        localStorage.removeItem(K_DATA + id);
        pending = false;
      });
    }
    writeJSON(K_DATA + id, Store.data);
    localStorage.removeItem(K_ENC + id);
    return Promise.resolve();
  };

  function spaceMeta() {
    if (!Store.index) return null;
    return Store.index.spaces.filter(function (s) { return s.id === Store.spaceId; })[0] || null;
  }
  Store.spaceMeta = spaceMeta;

  /* ---------------- 条目 ---------------- */
  Store.getEntry = function (key) {
    return (Store.data && Store.data.entries[key]) || null;
  };

  Store.ensureEntry = function (key) {
    var e = Store.data.entries[key];
    if (!e) {
      e = { mood: null, gratitude: ['', '', ''], regret: ['', '', ''], updatedAt: null };
      Store.data.entries[key] = e;
    }
    return e;
  };

  /** 条目是否为空（空的会被清掉，避免污染统计） */
  Store.isEmptyEntry = function (e) {
    if (!e) return true;
    if (e.mood != null) return false;
    var has = false;
    ['gratitude', 'regret'].forEach(function (f) {
      (e[f] || []).forEach(function (t) { if (String(t).trim()) has = true; });
    });
    return !has;
  };

  Store.updateEntry = function (key, mutator) {
    var e = Store.ensureEntry(key);
    mutator(e);
    e.updatedAt = new Date().toISOString();
    if (Store.isEmptyEntry(e)) delete Store.data.entries[key];
    return Store.persist();
  };

  /** 有内容的日期，按时间正序 */
  Store.dateKeys = function () {
    return Object.keys(Store.data.entries).sort();
  };

  Store.entriesIn = function (prefix) {
    var out = [];
    var keys = Store.dateKeys();
    for (var i = 0; i < keys.length; i++) {
      if (!prefix || keys[i].indexOf(prefix) === 0) out.push({ date: keys[i], entry: Store.data.entries[keys[i]] });
    }
    return out;
  };

  Store.stats = function () {
    var keys = Store.dateKeys();
    return { days: keys.length, first: keys[0] || null, last: keys[keys.length - 1] || null };
  };

  /* ---------------- 设置 ---------------- */
  Store.setSetting = function (k, v) {
    Store.data.settings[k] = v;
    return Store.persist();
  };

  /* ---------------- 隐私锁 ---------------- */
  Store.enableLock = function (password) {
    if (!subtle) return Promise.reject(new Error('当前环境不支持加密'));
    Store.password = password;
    var meta = spaceMeta();
    if (meta) meta.locked = true;
    saveIndex();
    return Store.persist();
  };

  Store.disableLock = function () {
    Store.password = null;
    var meta = spaceMeta();
    if (meta) meta.locked = false;
    saveIndex();
    return Store.persist();
  };

  Store.isLocked = function () {
    var meta = spaceMeta();
    return !!(meta && meta.locked);
  };

  /* ---------------- 导入 / 导出 ---------------- */
  Store.exportPayload = function () {
    return {
      app: 'moodpath',
      version: 1,
      exportedAt: new Date().toISOString(),
      space: Store.data.space,
      settings: Store.data.settings,
      entries: Store.data.entries
    };
  };

  Store.importPayload = function (payload, opts) {
    opts = opts || {};
    if (!payload || payload.app !== 'moodpath' || !payload.entries) {
      throw new Error('这不是 MoodPath 的备份文件');
    }
    if (!Store.data) {
      Store.createSpace((payload.space && payload.space.name) || '我的日子');
      if (payload.space) {
        Store.data.space.key = payload.space.key || Store.data.space.key;
        Store.data.space.createdAt = payload.space.createdAt || Store.data.space.createdAt;
        var meta = spaceMeta();
        if (meta) { meta.key = Store.data.space.key; meta.name = Store.data.space.name; }
      }
    }
    var n = 0;
    Object.keys(payload.entries).forEach(function (k) {
      if (!U.isValidKey(k)) return;
      var src = payload.entries[k];
      Store.data.entries[k] = {
        mood: src.mood == null ? null : U.clamp(parseInt(src.mood, 10) || 3, 1, 5),
        gratitude: normList(src.gratitude),
        regret: normList(src.regret),
        updatedAt: src.updatedAt || new Date().toISOString()
      };
      if (Store.isEmptyEntry(Store.data.entries[k])) delete Store.data.entries[k];
      else n++;
    });
    if (payload.settings && opts.settings !== false) {
      if (payload.settings.quote) Store.data.settings.quote = payload.settings.quote;
    }
    return Store.persist().then(function () { return n; });
  };

  Store.wipeEntries = function () {
    Store.data.entries = {};
    return Store.persist();
  };

  global.Store = Store;
})(window);
