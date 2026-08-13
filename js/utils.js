/* ============================================================
   utils.js — 日期 / 情绪 / 中文分词 等通用工具
   ============================================================ */
(function (global) {
  'use strict';

  var U = {};

  /* ---------------- 情绪 ---------------- */
  U.MOODS = [
    { v: 1, name: '难过', varName: '--m1' },
    { v: 2, name: '焦虑', varName: '--m2' },
    { v: 3, name: '平静', varName: '--m3' },
    { v: 4, name: '开心', varName: '--m4' },
    { v: 5, name: '幸福', varName: '--m5' }
  ];

  U.moodName = function (v) {
    var m = U.MOODS[v - 1];
    return m ? m.name : '未记录';
  };

  /** 从 CSS 变量读实际色值，保证深浅主题一致 */
  U.moodColor = function (v) {
    var name = (v >= 1 && v <= 5) ? U.MOODS[v - 1].varName : '--m0';
    var c = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (c || '#CCC').trim();
  };

  /* ---------------- 日期 ---------------- */
  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  U.WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

  U.pad2 = function (n) { return n < 10 ? '0' + n : '' + n; };

  /** Date -> 'YYYY-MM-DD'（本地时区，不用 toISOString 以免时差错位） */
  U.toKey = function (d) {
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };

  U.today = function () { return U.toKey(new Date()); };

  /** 'YYYY-MM-DD' -> Date（本地 00:00） */
  U.fromKey = function (key) {
    var p = String(key).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  };

  U.parts = function (key) {
    var p = String(key).split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  };

  U.isValidKey = function (key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return false;
    var p = U.parts(key);
    return p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= U.daysInMonth(p.y, p.m);
  };

  U.daysInMonth = function (y, m) { return new Date(y, m, 0).getDate(); };

  U.weekday = function (key) { return WEEK[U.fromKey(key).getDay()]; };

  /** 2026-04-28 -> '2026年4月28日' / short: '4月28日' */
  U.formatCN = function (key, opt) {
    var p = U.parts(key);
    if (opt === 'short') return p.m + '月' + p.d + '日';
    if (opt === 'md') return p.m + '/' + p.d;
    return p.y + '年' + p.m + '月' + p.d + '日';
  };

  /**
   * 严格位移：保持"日"不变，只挪月份。
   * 若目标月没有这一天（4月31日）→ 返回 null，这就是"没有那月今日"。
   */
  U.shiftMonthsStrict = function (key, delta) {
    var p = U.parts(key);
    var total = p.y * 12 + (p.m - 1) + delta;
    var y = Math.floor(total / 12);
    var m = (total % 12 + 12) % 12 + 1;
    if (p.d > U.daysInMonth(y, m)) return null;
    return y + '-' + U.pad2(m) + '-' + U.pad2(p.d);
  };

  U.shiftYearsStrict = function (key, delta) {
    return U.shiftMonthsStrict(key, delta * 12);
  };

  U.addDays = function (key, n) {
    var d = U.fromKey(key);
    d.setDate(d.getDate() + n);
    return U.toKey(d);
  };

  U.monthKey = function (key) { return String(key).slice(0, 7); };
  U.yearKey = function (key) { return String(key).slice(0, 4); };

  /* ---------------- 杂项 ---------------- */
  U.debounce = function (fn, wait) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  };

  U.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.escapeReg = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };

  U.clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

  U.randomKey = function () {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = [];
    for (var g = 0; g < 4; g++) {
      var s = '';
      for (var i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
      out.push(s);
    }
    return out.join('-');
  };

  /* ============================================================
     轻量中文分词（零依赖）
     思路：按标点切片 → 生成 2/3-gram → 停用字/停用词过滤
           → 用包含关系合并（长词吸收被它包住的短词）
     对日记这种短文本，效果足够撑起一张词云。
     ============================================================ */

  // 单字停用（这些字出现在词里，基本说明这不是个"词"）
  var STOP_CHARS = '的了是我你他她它们在有和就不也都很与及这那之于上下中个一二三到会着过没要能对说把被让给还太更最再又才只将从向为以所而且但却跟并等则如若因其此该乃者矣呢吗吧啊呀哦嗯么什怎样种些今'.split('');
  var STOP_SET = {};
  STOP_CHARS.forEach(function (c) { STOP_SET[c] = 1; });

  // 词级停用
  var STOP_WORDS = ('今天 今日 昨天 明天 后天 前天 早上 中午 晚上 上午 下午 时候 一个 一天 一些 一点 有点 有些 什么 这个 那个 我们 你们 他们 她们 自己 因为 所以 但是 可是 还是 可以 没有 就是 觉得 感觉 应该 已经 一直 真的 好像 如果 只是 那么 这么 然后 而且 虽然 不过 其实 事情 时间 今年 去年 明年 这样 那样 起来 出来 下去 一下 很多 非常 特别 终于 竟然 居然 突然 依然 仍然 尽管 无论 不是 不要 不能 不会 知道 看到 想到 听到 得到 今天的 一件 三件 事儿')
    .split(/\s+/).filter(Boolean);
  var STOP_WORD_SET = {};
  STOP_WORDS.forEach(function (w) { STOP_WORD_SET[w] = 1; });

  function isCJK(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
  }

  /** 把文本切成纯中文片段 + 英文单词 */
  function slice(text) {
    var cjk = [], latin = [];
    var buf = '';
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (isCJK(ch)) { buf += ch; }
      else {
        if (buf.length) { cjk.push(buf); buf = ''; }
      }
    }
    if (buf.length) cjk.push(buf);

    var m = s.match(/[A-Za-z][A-Za-z'-]{1,}/g);
    if (m) m.forEach(function (w) { if (w.length >= 2) latin.push(w.toLowerCase()); });

    return { cjk: cjk, latin: latin };
  }

  /**
   * 统计高频词
   * @param {string[]} texts
   * @param {number} limit
   * @returns {{text:string,count:number}[]}
   */
  U.topWords = function (texts, limit) {
    limit = limit || 48;
    var freq = {};   // n-gram -> 次数
    var docs = {};   // n-gram -> 出现在多少条记录里

    (texts || []).forEach(function (t, idx) {
      var seen = {};
      var parts = slice(t);

      parts.cjk.forEach(function (seg) {
        for (var n = 2; n <= 4; n++) {
          for (var i = 0; i + n <= seg.length; i++) {
            var g = seg.substr(i, n);
            // 含停用字的组合，直接丢
            var bad = false;
            for (var k = 0; k < g.length; k++) { if (STOP_SET[g[k]]) { bad = true; break; } }
            if (bad || STOP_WORD_SET[g]) continue;
            freq[g] = (freq[g] || 0) + 1;
            if (!seen[g]) { seen[g] = 1; docs[g] = (docs[g] || 0) + 1; }
          }
        }
      });

      parts.latin.forEach(function (w) {
        if (STOP_WORD_SET[w]) return;
        freq[w] = (freq[w] || 0) + 1;
        if (!seen[w]) { seen[w] = 1; docs[w] = (docs[w] || 0) + 1; }
      });
    });

    var keys = Object.keys(freq);
    if (!keys.length) return [];

    // 用"文档频次"作为权重（同一条里重复出现不算多次），更贴近"我常提到什么"
    var list = keys.map(function (k) { return { text: k, count: docs[k] }; });

    // 高频优先；同频时长词优先
    list.sort(function (a, b) {
      return b.count - a.count || b.text.length - a.text.length || a.text.localeCompare(b.text);
    });

    /* 去重叠（核心：保留"更像词"的那个）
       两条词若包含/重叠，按以下规则二选一，并允许"后来居上"替换已保留的词：
         - 频次高者胜出；
         - 频次相同时，取更短的那个（更干净、更少是动词接龙碎片，如 妈妈煮→妈妈）。
       覆盖三种情况：
         1. 候选词被已选词整段包含（红豆汤真 vs 红豆汤）
         2. 候选词是已选词的延伸（妈妈煮 vs 妈妈、同事帮 vs 同事）
         3. 两词有 >=3 个连续字重合（房间收拾 与 间收拾干） */
    function overlapLen(a, b) {
      var max = 0;
      for (var i = 0; i < a.length; i++) {
        for (var j = 0; j < b.length && i + j < a.length; j++) {
          if (a[i + j] !== b[j]) break;
          max = Math.max(max, j + 1);
        }
      }
      for (var i = 0; i < b.length; i++) {
        for (var j = 0; j < a.length && i + j < b.length; j++) {
          if (b[i + j] !== a[j]) break;
          max = Math.max(max, j + 1);
        }
      }
      return max;
    }
    function decide(keptItem, cand) {
      // 返回 'keep-old'（丢弃 cand）/ 'keep-new'（用 cand 替换 kept）/ 'both'（都留）
      var s = keptItem.text, t = cand.text;
      var contained = (s.indexOf(t) >= 0) || (t.indexOf(s) >= 0);
      var overlap = overlapLen(s, t) >= 3;
      if (!contained && !overlap) return 'both';
      if (cand.count > keptItem.count) return 'keep-new';          // 新词更常被提到 → 替换
      if (cand.count < keptItem.count) return 'keep-old';          // 旧词更常被提到 → 丢弃新词
      // 频次相同：取更短的（更干净；动词接龙碎片如 妈妈煮→妈妈 优先丢长留短；
      // 复合名词如 红豆汤 因频次本就 ≥ 其片段，多数已在前两步胜出，不会走到这里）
      return (t.length <= s.length) ? 'keep-new' : 'keep-old';
    }
    var kept = [];
    list.forEach(function (item) {
      var drop = false;
      for (var i = 0; i < kept.length; i++) {
        var d = decide(kept[i], item);
        if (d === 'keep-old') { drop = true; break; }
        if (d === 'keep-new') { kept.splice(i, 1); i--; }   // 移除旧词，稍后把新词补回
      }
      if (!drop) kept.push(item);
    });

    // 数据攒起来之后，把只出现过一次的噪音收掉
    var multi = kept.filter(function (x) { return x.count >= 2; });
    var out = multi.length >= 5 ? multi : kept;

    return out.slice(0, limit);
  };

  global.U = U;
})(window);
