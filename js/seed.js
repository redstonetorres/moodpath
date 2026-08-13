/* ============================================================
   seed.js — 示例数据（只在点"先看看示例"时用到）
   ============================================================ */
(function (global) {
  'use strict';

  var GRATITUDE = [
    '妈妈煮了红豆汤，第一口就想哭',
    '楼下的猫今天让我摸了三下',
    '地铁上有人给我让了座',
    '和朋友散步到很晚，聊了很多',
    '窗外的晚霞好看得不像话',
    '把拖了很久的活儿做完了',
    '今天的咖啡刚好是我喜欢的温度',
    '同事帮我顶了一个会',
    '妈妈打电话来，说家里的桂花开了',
    '睡了一个完整的觉',
    '散步的时候听完了一整张专辑',
    '朋友记得我随口说过的一句话',
    '中午的阳光落在桌角上',
    '谢谢自己今天没有发脾气',
    '收到了一份意外的小礼物',
    '猫在我腿上睡着了',
    '晚饭吃到了很久没吃的那家面',
    '把房间收拾干净了，心里也松了',
    '朋友发来一句"最近还好吗"',
    '雨停了，空气很好闻',
    '谢谢自己今天早睡了',
    '看完了一本拖了很久的书',
    '和爸爸聊了十分钟，没有吵架',
    '路过花店，买了一束小雏菊'
  ];

  var REGRET = [
    '又熬夜到两点，明天肯定困',
    '没有早睡，答应过自己的',
    '对妈妈说话的语气太冲了',
    '本来想去跑步，最后躺了一晚上',
    '会上没有把话说完整',
    '刷手机刷掉了一个下午',
    '那句"谢谢"还是没说出口',
    '拖延症又犯了，方案没动',
    '和朋友争了几句，其实没必要',
    '忘了给奶奶回电话',
    '午饭随便对付了一下',
    '没忍住又点了外卖',
    '把情绪带到了工作里',
    '想联系那个人，最后没发出去',
    '今天一整天都没出门',
    '答应自己看书，结果又刷剧了',
    '在小事上纠结了太久',
    '没有认真听别人说话',
    '又熬夜了，明知道第二天难受',
    '把该说的话咽了回去'
  ];

  function pick(arr, n) {
    var copy = arr.slice(), out = [];
    for (var i = 0; i < n && copy.length; i++) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    while (out.length < 3) out.push('');
    return out.slice(0, 3);
  }

  function moodRand() {
    // 偏向中间偏正的分布
    var r = Math.random();
    if (r < 0.10) return 1;
    if (r < 0.28) return 2;
    if (r < 0.58) return 3;
    if (r < 0.85) return 4;
    return 5;
  }

  function fillRange(entries, startKey, days) {
    var k = startKey;
    for (var i = 0; i < days; i++) {
      if (Math.random() > 0.18) {
        entries[k] = {
          mood: moodRand(),
          gratitude: pick(GRATITUDE, 1 + Math.floor(Math.random() * 3)),
          regret: pick(REGRET, 1 + Math.floor(Math.random() * 3)),
          updatedAt: new Date().toISOString()
        };
      }
      k = U.addDays(k, 1);
    }
  }

  global.Seed = {
    build: function () {
      var entries = {};
      var today = U.today();
      // 最近 75 天
      fillRange(entries, U.addDays(today, -74), 75);
      // 去年同期前后，让"那年今日"也有东西看
      var lastYear = U.shiftYearsStrict(today, -1) || U.addDays(today, -365);
      fillRange(entries, U.addDays(lastYear, -25), 50);
      return entries;
    }
  };
})(window);
