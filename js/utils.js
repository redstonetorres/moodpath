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
     策略：先用"常用词词典"做正向最大匹配(FMM)，把能识别的真实词
     直接切出来；词典切不到的零散片段，再用 n-gram 兜底，但只保留
     "跨多条记录重复出现"的片段——随机两个相邻字的组合几乎不可能在
     不同日记里重复，因此会被自动滤掉。这样既精准，又不漏掉用户常提
     的个性化词（昵称、专属说法等）。
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

  // 动态助词：动词被它们截断出的碎片（看了/去看了）不是完整词
  var ASPECT = { '了': 1, '着': 1, '过': 1 };

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

  /* ---------------- 常用词词典（2~4 字，不含停用词/单字） ---------------- */
  var DICT_WORDS = (
    // 情绪心理
    '开心 快乐 高兴 难过 伤心 焦虑 平静 放松 郁闷 烦躁 愤怒 生气 害怕 担心 紧张 失望 孤独 寂寞 满足 幸福 疲惫 舒服 难受 委屈 尴尬 害羞 兴奋 激动 感动 怀念 思念 期待 希望 绝望 热爱 喜爱 讨厌 厌烦 嫉妒 羡慕 自豪 惭愧 内疚 释然 坦然 悠闲 惬意 愉悦 哀伤 忧伤 惊恐 惶恐 茫然 彷徨 心烦 心安 心累 心痛 心疼 心动 心寒 心虚 心宽 心静 宁静 安详 祥和 嘈杂 混乱 ' +
    // 家庭人际
    '妈妈 爸爸 父亲 母亲 儿子 女儿 哥哥 姐姐 弟弟 妹妹 爷爷 奶奶 外公 外婆 亲戚 家人 孩子 宝宝 老公 老婆 妻子 丈夫 朋友 闺蜜 兄弟 邻居 同事 同学 老师 学生 老板 领导 客户 伙伴 队友 网友 室友 陌生人 长辈 晚辈 祖先 后代 宠物 猫咪 狗狗 小猫 小狗 乌龟 金鱼 植物 多肉 ' +
    // 工作学习
    '工作 上班 下班 开会 会议 项目 任务 加班 工资 薪水 公司 单位 办公室 学习 考试 作业 学校 大学 读书 论文 研究 报告 计划 目标 努力 奋斗 成功 失败 压力 忙碌 充实 职业 事业 简历 面试 实习 升职 离职 退休 效率 成果 业绩 方案 策略 团队 部门 主管 经理 员工 奖金 福利 培训 考核 辞职 ' +
    // 日常生活
    '吃饭 睡觉 洗澡 散步 跑步 运动 健身 旅行 旅游 出门 回家 逛街 购物 买菜 做饭 打扫 洗衣 拍照 唱歌 跳舞 游戏 看书 阅读 写作 画画 聊天 发呆 休息 醒来 起床 刷牙 化妆 理发 排队 等待 享受 珍惜 浪费 后悔 遗憾 搬家 帮忙 帮助 加油 鼓励 陪伴 照顾 关心 吵架 和解 分手 失恋 暗恋 表白 结婚 离婚 怀孕 生产 装修 入住 ' +
    // 食物
    '早餐 午餐 晚餐 晚饭 夜宵 米饭 面条 饺子 包子 火锅 烧烤 奶茶 咖啡 水果 蔬菜 肉类 鸡蛋 牛奶 面包 蛋糕 零食 饭菜 汤圆 红豆 红豆汤 礼物 ' +
    // 健康
    '身体 健康 生病 感冒 发烧 头痛 肚子 医院 医生 吃药 睡眠 失眠 减肥 体重 眼睛 牙齿 喉咙 心脏 血压 体检 请假 ' +
    // 时间
    '凌晨 周末 假期 春节 生日 日子 时光 岁月 将来 未来 过去 现在 从前 早晨 傍晚 黄昏 深夜 年底 年初 月底 月初 星期 月份 年份 ' +
    // 自然天气
    '天气 下雨 晴天 阴天 刮风 下雪 阳光 月亮 星星 天空 大海 公园 风景 花朵 大树 春天 夏天 秋天 冬天 季节 微风 暴雨 雷电 彩虹 雾霾 空气 清新 炎热 寒冷 温暖 凉爽 晴朗 ' +
    // 地点
    '超市 商场 餐厅 咖啡店 书店 电影院 地铁 车站 机场 酒店 旅馆 城市 农村 老家 家乡 校园 街道 广场 小区 楼层 阳台 厨房 卧室 客厅 书房 院子 海边 山里 乡下 ' +
    // 动作状态
    '喜欢 讨厌 学会 忘记 记得 想起 发现 认为 决定 选择 改变 成长 进步 坚持 放弃 接受 理解 原谅 感谢 相信 怀疑 想念 离开 回来 遇见 重逢 分别 告别 拥抱 牵手 微笑 流泪 哭泣 沉默 呐喊 怒吼 奔跑 跳跃 飞翔 游泳 爬山 骑车 开车 坐车 尝试 实现 完成 开始 结束 继续 停止 追求 渴望 ' +
    // 抽象
    '生活 人生 梦想 现实 世界 社会 自由 痛苦 意义 价值 美好 温暖 冷漠 真诚 善良 勇敢 坚强 脆弱 平凡 简单 复杂 重要 必要 可能 必须 或许 习惯 兴趣 爱好 性格 脾气 态度 观点 想法 念头 记忆 回忆 遗忘 憧憬 向往 执念 初心 底线 原则 边界 距离 联系 关系 缘分 命运 机会 挑战 困难 问题 答案 真相 谎言 秘密 承诺 信任 责任 负担 动力 勇气 信心 ' +
    // 三/四字
    '为什么 怎么办 怎么样 男朋友 女朋友 便利店 没关系 事实上 实际上 基本上 没想到 来得及 差不多 有时候 大部分 一点点 身份证 朋友圈 短视频 双眼皮 小确幸 ' +
    // 数码娱乐
    '电影 电视 手机 电脑 网络 微信 消息 评论 分享 直播 红包 视频 音乐 照片 截图 表情 通知 '
  ).split(/\s+/).filter(Boolean);

  var DICT = {};
  var MAXDICT = 1;
  DICT_WORDS.forEach(function (w) {
    if (w.length > MAXDICT) MAXDICT = w.length;
    DICT[w] = 1;
  });

  function hasStop(g) {
    for (var k = 0; k < g.length; k++) if (STOP_SET[g[k]]) return true;
    return false;
  }

  /** 正向最大匹配：把一段连续中文切成 词典词(dict:true) + 切不到的碎片(dict:false) */
  function fmm(seg) {
    var tokens = [];
    var i = 0;
    while (i < seg.length) {
      var hit = '';
      for (var len = Math.min(MAXDICT, seg.length - i); len >= 1; len--) {
        var w = seg.substr(i, len);
        if (DICT[w]) { hit = w; break; }
      }
      if (hit) { tokens.push({ w: hit, dict: true }); i += hit.length; }
      else {
        var j = i;
        while (j < seg.length) {
          var f = false;
          for (var len2 = Math.min(MAXDICT, seg.length - j); len2 >= 1; len2--) {
            if (DICT[seg.substr(j, len2)]) { f = true; break; }
          }
          if (f) break;
          j++;
        }
        var run = seg.substr(i, j - i);
        if (run.length >= 2) tokens.push({ w: run, dict: false });
        i = j;
      }
    }
    return tokens;
  }

  function addWord(w, kind, freq, docs, src, seen) {
    freq[w] = (freq[w] || 0) + 1;
    if (!seen[w]) { seen[w] = 1; docs[w] = (docs[w] || 0) + 1; src[w] = kind; }
  }

  /**
   * 统计高频词（返回"更像词"的结果，而非随机相邻字）
   * @param {string[]} texts
   * @param {number} limit
   * @returns {{text:string,count:number}[]}
   */
  U.topWords = function (texts, limit) {
    limit = limit || 48;
    var freq = {};   // word -> 出现次数
    var docs = {};   // word -> 出现在多少条记录
    var src = {};    // word -> 'dict' | 'emg'

    (texts || []).forEach(function (t) {
      var seen = {};
      var parts = slice(t);

      parts.cjk.forEach(function (seg) {
        fmm(seg).forEach(function (tok) {
          if (tok.dict) {
            addWord(tok.w, 'dict', freq, docs, src, seen);
          } else {
            // 兜底 n-gram（2~3 字），之后按"跨记录重复"过滤
            var run = tok.w;
            for (var n = 2; n <= 3; n++) {
              for (var i = 0; i + n <= run.length; i++) {
                var g = run.substr(i, n);
                if (hasStop(g) || STOP_WORD_SET[g]) continue;
                // 被动态助词 了/着/过 截断的动词碎片（右邻是它们）多半不是完整词，丢弃
                if (i + n < run.length && ASPECT[run[i + n]]) continue;
                addWord(g, 'emg', freq, docs, src, seen);
              }
            }
          }
        });
      });

      parts.latin.forEach(function (w) {
        if (STOP_WORD_SET[w]) return;
        addWord(w, 'dict', freq, docs, src, seen);
      });
    });

    var keys = Object.keys(freq);
    if (!keys.length) return [];

    // 用"文档频次"作为权重（同一条里重复出现不算多次），更贴近"我常提到什么"
    var list = keys.map(function (k) {
      return { text: k, count: docs[k] || 0, dict: src[k] === 'dict' };
    });

    // 高频优先；同频时长词优先
    list.sort(function (a, b) {
      return b.count - a.count || b.text.length - a.text.length || a.text.localeCompare(b.text);
    });

    /* 去重叠（核心：保留"更像词"的那个）
       两条词若包含/重叠，按以下规则二选一：
         - 词典词优先于兜底词（词典词是真实词，兜底词可能仍是碎片）
         - 同源时频次高者胜出；频次相同取更短（更干净） */
    function overlapLen(a, b) {
      var max = 0;
      for (var i = 0; i < a.length; i++) {
        for (var j = 0; j < b.length && i + j < a.length; j++) {
          if (a[i + j] !== b[j]) break;
          max = Math.max(max, j + 1);
        }
      }
      for (var i2 = 0; i2 < b.length; i2++) {
        for (var j2 = 0; j2 < a.length && i2 + j2 < b.length; j2++) {
          if (b[i2 + j2] !== a[j2]) break;
          max = Math.max(max, j2 + 1);
        }
      }
      return max;
    }
    function decide(keptItem, cand) {
      var s = keptItem.text, t = cand.text;
      var has = (s.indexOf(t) >= 0) || (t.indexOf(s) >= 0);
      var overlap = overlapLen(s, t) >= 3;
      if (!has && !overlap) return 'both';
      if (keptItem.dict && !cand.dict) return 'keep-old';
      if (!keptItem.dict && cand.dict) return 'keep-new';
      if (cand.count > keptItem.count) return 'keep-new';
      if (cand.count < keptItem.count) return 'keep-old';
      return (t.length <= s.length) ? 'keep-new' : 'keep-old';
    }
    var kept = [];
    list.forEach(function (item) {
      var drop = false;
      for (var i = 0; i < kept.length; i++) {
        var d = decide(kept[i], item);
        if (d === 'keep-old') { drop = true; break; }
        if (d === 'keep-new') { kept.splice(i, 1); i--; }
      }
      if (!drop) kept.push(item);
    });

    // 兜底词只在"跨 >=2 条记录出现"时保留——这是滤掉随机相邻字的关键
    var clean = kept.filter(function (x) { return x.dict || (x.count >= 2); });

    // 数据太少时兜底，避免空云
    var out = clean.length >= 4 ? clean : kept;

    return out.slice(0, limit);
  };

  global.U = U;
})(window);
