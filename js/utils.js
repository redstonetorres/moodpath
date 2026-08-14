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
   * 若目标月没有这一天（4月31日）-> 返回 null，这就是"没有那月今日"。
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
     策略：
     1. 用"常用词词典"做正向最大匹配(FMM)，只产出真实词；
     2. 把常见停用词也加入词典，让 FMM 能正确切分"奖励自己"、
        "今天"等组合，避免停用字被卷入非词典片段产生碎片；
     3. 完全丢弃 n-gram 硬凑兜底——这是之前"盛香/励自/己盛"等
        随机相邻字碎片的根源；
     4. 对词典未覆盖的连续片段（run），只保留"完整 run"本身，
        且要求跨 >=2 条记录出现。这样既允许用户自定义词/昵称
        进云，又不会再把长 run 截断成毫无意义的 2~3 字碎片。
     ============================================================ */

  // 单字停用：这些字极少单独成词，出现在候选里基本说明不是词
  var STOP_CHARS = '的了是我你他她它们在有和就不也都很与及这那之于上下中个一二三到会着过没要能对说把被让给还太更最再又才只将从向为以所而且但却跟并等则如若因其此该乃者矣呢吗吧啊呀哦嗯么什怎样种些今'.split('');
  var STOP_SET = {};
  STOP_CHARS.forEach(function (c) { STOP_SET[c] = 1; });

  // 词级停用：常见但统计价值低的词。它们会被加入 DICT 以便正确切分，
  // 但在统计时过滤，不会出现在词云中。
  var STOP_WORDS = ('今天 今日 昨天 明天 后天 前天 早上 中午 晚上 上午 下午 时候 一个 一天 一些 一点 有点 有些 什么 这个 那个 我们 你们 他们 她们 自己 因为 所以 但是 可是 还是 可以 没有 就是 觉得 感觉 应该 已经 一直 真的 好像 如果 只是 那么 这么 然后 而且 虽然 不过 其实 事情 时间 今年 去年 明年 这样 那样 起来 出来 下去 一下 很多 非常 特别 终于 竟然 居然 突然 依然 仍然 尽管 无论 不是 不要 不能 不会 知道 看到 想到 听到 得到 今天的 一件 三件 的事儿 的事 的话 的人 的时候 的地方 的样子 的感觉 的想法 的问题 的答案 的原因 的结果 ' +
    // 把单字停用字也作为停用词加入词典，让 FMM 把它们当"切分边界"，
    // 避免"看了/就干"这种被停用字串起来的碎片
    STOP_CHARS.join(' '))
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

  /* ---------------- 常用词词典（1~5 字，含停用词以保证切分正确） ---------------- */
  var DICT_WORDS = (
    // === 情绪心理（96）===
    '开心 快乐 高兴 难过 伤心 焦虑 平静 放松 郁闷 烦躁 愤怒 生气 害怕 担心 紧张 失望 孤独 寂寞 满足 幸福 疲惫 舒服 难受 委屈 尴尬 害羞 兴奋 激动 感动 怀念 思念 期待 希望 绝望 热爱 喜爱 喜欢 讨厌 厌烦 嫉妒 羡慕 自豪 惭愧 内疚 释然 坦然 悠闲 惬意 愉悦 哀伤 忧伤 惊恐 惶恐 茫然 彷徨 心烦 心安 心累 心痛 心疼 心动 心寒 心虚 心宽 心静 宁静 安详 祥和 嘈杂 混乱 崩溃 绝望 无力 无助 迷茫 清醒 顿悟 豁达 开朗 乐观 悲观 积极 消极 情绪 心情 心态 心理 压力 治愈 疗愈 ' +
    // === 家庭人际（96）===
    '妈妈 爸爸 父亲 母亲 儿子 女儿 哥哥 姐姐 弟弟 妹妹 爷爷 奶奶 外公 外婆 亲戚 家人 孩子 宝宝 老公 老婆 妻子 丈夫 朋友 闺蜜 兄弟 邻居 同事 同学 老师 学生 老板 领导 客户 伙伴 队友 网友 室友 陌生人 长辈 晚辈 祖先 后代 宠物 猫咪 狗狗 小猫 小狗 乌龟 金鱼 植物 多肉 家人 家庭 亲情 友情 爱情 关系 相处 沟通 陪伴 关心 照顾 支持 理解 包容 信任 尊重 礼貌 道歉 原谅 和解 吵架 争执 矛盾 冲突 分手 失恋 暗恋 表白 恋爱 结婚 离婚 婚礼 蜜月 怀孕 生产 装修 入住 搬家 团聚 离别 重逢 思念 牵挂 ' +
    // === 工作学习（112）===
    '工作 上班 下班 开会 会议 项目 任务 加班 工资 薪水 公司 单位 办公室 学习 考试 作业 学校 大学 读书 论文 研究 报告 计划 目标 努力 奋斗 成功 失败 压力 忙碌 充实 职业 事业 简历 面试 实习 升职 离职 退休 效率 成果 业绩 方案 策略 团队 部门 主管 经理 员工 奖金 福利 培训 考核 辞职 招聘 应聘 录取 录取 进修 深造 毕业 入学 选课 学分 专业 课程 教材 笔记 复习 预习 考试 成绩 排名 奖学金 论文 答辩 导师 课题 实验 数据 分析 总结 汇报 演示 谈判 合作 签约 订单 销售 市场 运营 产品 设计 开发 测试 上线 维护 客户 用户 需求 功能 版本 迭代 优化 改进 创新 突破 业绩 利润 成本 预算 报销 ' +
    // === 日常生活（128）===
    '吃饭 睡觉 洗澡 散步 跑步 运动 健身 旅行 旅游 出门 回家 逛街 购物 买菜 做饭 打扫 洗衣 拍照 唱歌 跳舞 游戏 看书 阅读 写作 画画 聊天 发呆 休息 醒来 起床 刷牙 化妆 理发 排队 等待 享受 珍惜 浪费 后悔 遗憾 帮忙 帮助 加油 鼓励 陪伴 照顾 关心 吵架 和解 分手 失恋 暗恋 表白 结婚 离婚 怀孕 生产 装修 入住 开车 骑车 坐车 步行 地铁 公交 打车 买票 订票 酒店 旅馆 民宿 露营 野餐 聚会 约会 聚餐 宴会 酒席 下午茶 夜宵 早餐 午餐 晚餐 早饭 中饭 晚饭 零食 饮料 茶水 洗漱 护肤 穿衣 搭配 发型 指甲 按摩 泡澡 晒太阳 吹风 淋雨 躲雨 撑伞 遛狗 喂猫 种花 浇花 整理 收纳 布置 装饰 修理 维修 组装 ' +
    // === 食物（80）===
    '早餐 午餐 晚餐 晚饭 夜宵 米饭 面条 饺子 包子 火锅 烧烤 奶茶 咖啡 水果 蔬菜 肉类 鸡蛋 牛奶 面包 蛋糕 零食 饭菜 汤圆 红豆 红豆汤 礼物 豆浆 油条 煎饼 汉堡 披萨 寿司 拉面 炒饭 炒面 炸鸡 烤鸭 烤鱼 牛排 羊排 猪排 排骨 鸡汤 鱼汤 肉汤 青菜 白菜 菠菜 芹菜 韭菜 黄瓜 番茄 西红柿 土豆 萝卜 茄子 豆角 蘑菇 木耳 海带 豆腐 豆皮 粉丝 粉条 米粉 河粉 年糕 粽子 月饼 汤圆 元宵 饼干 巧克力 冰淇淋 雪糕 糖果 瓜子 花生 坚果 酸奶 果汁 汽水 可乐 啤酒 红酒 白酒 茶叶 ' +
    // === 健康（64）===
    '身体 健康 生病 感冒 发烧 头痛 肚子 医院 医生 吃药 睡眠 失眠 减肥 体重 眼睛 牙齿 喉咙 心脏 血压 体检 请假 休息 康复 痊愈 复查 手术 住院 挂号 排队 缴费 取药 打针 输液 疫苗 核酸 过敏 咳嗽 流鼻涕 鼻塞 嗓子疼 发烧 头晕 恶心 呕吐 腹泻 便秘 胃痛 牙痛 腰痛 背痛 腿痛 头痛 疲惫 劳累 虚弱 精神 气色 食欲 胃口 消化 吸收 营养 维生素 蛋白质 脂肪 碳水 热量 锻炼 健身 瑜伽 冥想 拉伸 热身 ' +
    // === 时间（64）===
    '凌晨 周末 假期 春节 生日 日子 时光 岁月 将来 未来 过去 现在 从前 早晨 傍晚 黄昏 深夜 年底 年初 月底 月初 星期 月份 年份 周一 周二 周三 周四 周五 周六 周日 星期一 星期二 星期三 星期四 星期五 星期六 星期日 一月 二月 三月 四月 五月 六月 七月 八月 九月 十月 十一月 十二月 春天 夏天 秋天 冬天 季节 时令 节气 节日 假日 纪念日 昨天 今天 明天 后天 前天 刚才 稍后 最近 很久 很久 长期 短期 暂时 永久 ' +
    // === 自然天气（64）===
    '天气 下雨 晴天 阴天 刮风 下雪 阳光 月亮 星星 天空 大海 公园 风景 花朵 大树 春天 夏天 秋天 冬天 季节 微风 暴雨 雷电 彩虹 雾霾 空气 清新 炎热 寒冷 温暖 凉爽 晴朗 多云 阵雨 雷阵雨 小雨 中雨 大雨 暴雨 台风 龙卷风 沙尘暴 冰雹 霜冻 结冰 融化 阳光 日光 月光 星光 光线 阴影 云层 乌云 白云 蓝天 白云 云彩 雾气 露水 彩虹 晚霞 朝霞 日落 日出 潮汐 海浪 沙滩 贝壳 石头 山峰 河流 湖泊 森林 草原 沙漠 ' +
    // === 地点（80）===
    '超市 商场 餐厅 咖啡店 书店 电影院 地铁 车站 机场 酒店 旅馆 城市 农村 老家 家乡 校园 街道 广场 小区 楼层 阳台 厨房 卧室 客厅 书房 院子 海边 山里 乡下 公司 单位 学校 教室 宿舍 图书馆 实验室 体育馆 游泳池 操场 食堂 厕所 洗手间 浴室 车库 停车场 公园 花园 动物园 植物园 博物馆 美术馆 展览馆 剧院 音乐厅 图书馆 医院 诊所 药店 银行 邮局 派出所 政府 机关 写字楼 工厂 车间 仓库 商店 便利店 水果店 花店 理发店 美容院 健身房 体育馆 球场 跑道 泳池 山 河 湖 海 江 森林 沙漠 草原 岛屿 沙滩 礁石 洞穴 瀑布 温泉 ' +
    // === 动作状态（144）===
    '喜欢 讨厌 学会 忘记 记得 想起 发现 认为 决定 选择 改变 成长 进步 坚持 放弃 接受 理解 原谅 感谢 相信 怀疑 想念 离开 回来 遇见 重逢 分别 告别 拥抱 牵手 微笑 流泪 哭泣 沉默 呐喊 怒吼 奔跑 跳跃 飞翔 游泳 爬山 骑车 开车 坐车 尝试 实现 完成 开始 结束 继续 停止 追求 渴望 努力 奋斗 拼搏 加油 坚持 忍耐 忍受 承受 承担 负责 管理 安排 组织 协调 沟通 交流 讨论 商量 协商 谈判 合作 配合 协助 帮助 支持 鼓励 赞扬 批评 指责 抱怨 吐槽 解释 说明 表达 表现 展示 表演 模仿 学习 练习 训练 复习 预习 思考 考虑 犹豫 纠结 权衡 判断 评价 评估 分析 总结 归纳 整理 收拾 打扫 清洗 擦拭 修理 修补 更换 安装 拆卸 组装 搬运 携带 存放 保管 保护 维护 保养 照顾 照料 喂养 种植 培育 浇水 施肥 修剪 采摘 收获 购买 选购 挑选 比较 下单 付款 退款 退货 交换 赠送 接收 发送 寄出 签收 预约 预定 取消 改签 ' +
    // === 抽象概念（128）===
    '生活 人生 梦想 现实 世界 社会 自由 痛苦 意义 价值 美好 温暖 冷漠 真诚 善良 勇敢 坚强 脆弱 平凡 简单 复杂 重要 必要 可能 必须 或许 习惯 兴趣 爱好 性格 脾气 态度 观点 想法 念头 记忆 回忆 遗忘 憧憬 向往 执念 初心 底线 原则 边界 距离 联系 关系 缘分 命运 机会 挑战 困难 问题 答案 真相 谎言 秘密 承诺 信任 责任 负担 动力 勇气 信心 决心 信念 信仰 智慧 知识 经验 经历 阅历 见识 格局 眼界 心胸 胸怀 境界 层次 水平 能力 实力 潜力 优势 劣势 缺点 优点 特色 特点 个性 风格 品味 气质 魅力 颜值 形象 外表 内心 灵魂 精神 意志 毅力 耐心 细心 专心 用心 认真 负责 靠谱 踏实 勤奋 懒惰 拖延 效率 效果 结果 成果 成绩 成就 贡献 影响 作用 价值 价格 成本 费用 开支 收入 支出 利润 亏损 投资 理财 储蓄 消费 债务 贷款 ' +
    // === 三/四/五字词（48）===
    '为什么 怎么办 怎么样 男朋友 女朋友 便利店 没关系 事实上 实际上 基本上 没想到 来得及 差不多 有时候 大部分 一点点 身份证 朋友圈 短视频 双眼皮 小确幸 一方面 另一方面 总而言之 由此可见 毫无疑问 莫名其妙 不可思议 一见钟情 日久生情 相亲相爱 相敬如宾 白头偕老 永结同心 恭喜发财 万事如意 心想事成 身体健康 工作顺利 学习进步 天天开心 幸福快乐 平平安安 团团圆圆 阖家欢乐 新年快乐 生日快乐 圣诞快乐 周末愉快 一路顺风 ' +
    // === 数码娱乐（48）===
    '电影 电视 手机 电脑 网络 微信 消息 评论 分享 直播 红包 视频 音乐 照片 截图 表情 通知 软件 硬件 应用 程序 游戏 账号 密码 登录 注册 退出 删除 保存 下载 上传 搜索 浏览 点击 点赞 收藏 转发 关注 粉丝 好友 群聊 私聊 语音 通话 视频通话 表情包 动态 朋友圈 微博 抖音 小红书 知乎 哔哩哔哩 B站 网易云 QQ音乐 腾讯视频 爱奇艺 优酷  Netflix ' +
    // === 新增：截图相关高频词（不再把碎片当词典词）===
    '奖励 鼓励 世界 完全 多想 想干 美好 感恩 感谢 感激 感动 欣慰 自豪 骄傲 满足 充实 意义 价值 成长 进步 改变 选择 决定 坚持 放弃 接受 理解 原谅 包容 支持 陪伴 关心 照顾 爱护 珍惜 在意 重视 忽略 忽视 忘记 记得 回忆 想念 思念 牵挂 惦记 期待 盼望 希望 失望 绝望 沮丧 低落 郁闷 烦躁 焦虑 不安 紧张 压力 放松 平静 安心 舒服 痛快 畅快 开心 快乐 幸福 美满 甜蜜 温馨 浪漫 感动 落泪 流泪 哭泣 抽泣 哽咽 伤心 难过 痛苦 难受 委屈 愤怒 生气 恼火 讨厌 厌烦 嫉妒 羡慕 惭愧 内疚 后悔 遗憾 抱歉 对不起 谢谢 祝福 祝愿 祈祷 保佑 幸运 好运 倒霉 不幸 糟糕 顺利 坎坷 波折 困难 挑战 磨难 考验 经历 经验 教训 收获 成果 成就 成功 胜利 失败 挫折 错误 误会 误解 矛盾 冲突 争执 争吵 冷战 和解 复合 分手 离别 重逢 相聚 团圆 孤独 寂寞 空虚 无聊 迷茫 困惑 怀疑 彷徨 无助 无力 疲惫 累 倦 困 乏 精神抖擞 精力充沛 活力 朝气 死气沉沉 生机勃勃 萎靡不振 垂头丧气 无精打采 兴高采烈 喜出望外 欣喜若狂 心花怒放 愤愤不平 怒不可遏 火冒三丈 暴跳如雷 咬牙切齿 瑟瑟发抖 心惊胆战 提心吊胆 忐忑不安 坐立不安 心烦意乱 心神不宁 心慌意乱 心乱如麻 心如止水 心平气和 平心静气 镇定自若 从容不迫 泰然自若 处之泰然 若无其事 满不在乎 不以为然 不屑一顾 嗤之以鼻 目瞪口呆 瞠目结舌 恍然大悟 豁然开朗 茅塞顿开 如梦初醒 醍醐灌顶 受益匪浅 受益良多 感触颇深 深有体会 记忆犹新 历历在目 念念不忘 耿耿于怀 牵肠挂肚 朝思暮想 魂牵梦萦 刻骨铭心 没齿难忘 永生难忘 百感交集 五味杂陈 心潮澎湃 热血沸腾 激情澎湃 豪情万丈 意气风发 斗志昂扬 灰心丧气 心灰意冷 万念俱灰 一蹶不振 自暴自弃 自怨自艾 怨天尤人 唉声叹气 长吁短叹 愁眉苦脸 愁眉不展 喜笑颜开 笑容满面 眉开眼笑 笑逐颜开 哄堂大笑 破涕为笑 哭笑不得 强颜欢笑 皮笑肉不笑 冷嘲热讽 含沙射影 指桑骂槐 恶语相向 破口大骂 脏话连篇 喋喋不休 滔滔不绝 口若悬河 哑口无言 无言以对 呆若木鸡 惊慌失措 手忙脚乱 手足无措 战战兢兢 小心翼翼 谨小慎微 粗心大意 马马虎虎 敷衍了事 得过且过 浑浑噩噩 稀里糊涂 迷迷糊糊 昏昏欲睡 睡眼惺忪 神采奕奕 容光焕发 红光满面 面黄肌瘦 面如土色 面不改色 脸色苍白 脸色铁青 怒目而视 横眉冷对 冷眼旁观 视而不见 熟视无睹 置若罔闻 充耳不闻 不闻不问 漠不关心 袖手旁观 隔岸观火 落井下石 雪中送炭 锦上添花 助人为乐 乐善好施 慷慨解囊 扶危济困 见义勇为 舍己为人 大公无私 无私奉献 任劳任怨 勤勤恳恳 兢兢业业 恪尽职守 尽职尽责 尽心尽力 全力以赴 全心全意 专心致志 全神贯注 聚精会神 一心一意 三心二意 心猿意马 心不在焉 魂不守舍 失魂落魄 魂飞魄散 胆颤心惊 心惊肉跳 毛骨悚然 不寒而栗 提心吊胆 惴惴不安 七上八下 如坐针毡 度日如年 光阴似箭 日月如梭 白驹过隙 弹指一挥 一朝一夕 日复一日 年复一年 长久 短暂 永恒 瞬间 刹那 片刻 须臾 良久 许久 好久 永远 永久 暂时 临时 偶尔 偶然 经常 常常 时常 往往 从来 始终 最终 最初 起初 原先 原来 ' +
    // === 停用词也加入 DICT，确保 FMM 正确切分（后续统计过滤）===
    STOP_WORDS.join(' ')
  ).split(/\s+/).filter(Boolean);

  // 去重
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

  /** 正向最大匹配：把一段连续中文切成词典词（含停用词） */
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
   * 统计高频词（精准版：不再用 n-gram 硬凑相邻字）
   * @param {string[]} texts
   * @param {number} limit
   * @returns {{text:string,count:number}[]}
   */
  U.topWords = function (texts, limit) {
    limit = limit || 48;
    var freq = {};   // word -> 出现次数
    var docs = {};   // word -> 出现在多少条记录
    var src = {};    // word -> 'dict' | 'run'

    (texts || []).forEach(function (t) {
      var seen = {};
      var parts = slice(t);

      parts.cjk.forEach(function (seg) {
        fmm(seg).forEach(function (tok) {
          if (tok.dict) {
            // 停用词只切分、不入云
            if (!STOP_WORD_SET[tok.w]) {
              addWord(tok.w, 'dict', freq, docs, src, seen);
            }
          } else {
            // 非词典 run：只保留完整 run 本身，长度 2~4，跨记录出现
            if (tok.w.length >= 2 && tok.w.length <= 4) {
              addWord(tok.w, 'run', freq, docs, src, seen);
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
         - 词典词优先于 run 词（词典词是真实词，run 词可能仍是碎片）
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

    // run 词只在"跨 >=2 条记录出现"时保留——这是滤掉随机碎片的关键
    var clean = kept.filter(function (x) { return x.dict || (x.count >= 2); });

    // 数据太少时兜底，避免空云
    var out = clean.length >= 4 ? clean : kept;

    return out.slice(0, limit);
  };

  global.U = U;
})(window);
