/* ============================================================
   app.js — 视图与交互
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var THEME_CACHE = 'moodpath:v1:theme';

  var state = {
    view: 'home',
    entryDate: U.today(),
    echoMode: 'auto',     // auto | pick
    echoPick: U.today(),
    statScope: 'month',
    keyVisible: false
  };

  /* ============================================================
     主题
     ============================================================ */
  function systemDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function applyTheme(mode) {
    var real = mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', real);
    try { localStorage.setItem(THEME_CACHE, mode); } catch (e) {}
    $$('#themeSeg .seg-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.theme === mode);
    });
  }
  function currentThemeMode() {
    if (Store.data) return Store.data.settings.theme || 'system';
    try { return localStorage.getItem(THEME_CACHE) || 'system'; } catch (e) { return 'system'; }
  }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSys = function () {
      if (currentThemeMode() === 'system') { applyTheme('system'); onThemeChanged(); }
    };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }
  function onThemeChanged() {
    if (state.view === 'stats') renderStats();
  }

  /* ============================================================
     Toast
     ============================================================ */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  var saveTimer;
  function flashSaved() {
    var h = $('#saveHint');
    h.textContent = '已保存';
    h.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { h.classList.remove('show'); }, 1400);
  }

  /* ============================================================
     启动
     ============================================================ */
  applyTheme(currentThemeMode());

  function boot() {
    var status = Store.boot();

    if (status === 'ready') { startApp(); return; }

    $('#gate').classList.remove('hidden');
    if (status === 'locked') {
      $('#gateWelcome').classList.add('hidden');
      $('#gateUnlock').classList.remove('hidden');
      $('#gateSub').textContent = '这本日记上了锁。';
      setTimeout(function () { $('#gatePassword').focus(); }, 120);
    } else {
      $('#gateWelcome').classList.remove('hidden');
      setTimeout(function () { $('#gateSpaceName').focus(); }, 120);
    }
  }

  function startApp() {
    $('#gate').classList.add('hidden');
    $('#app').classList.remove('hidden');

    // URL 参数 ?theme=light/dark/system 可临时指定，便于分享
    var urlTheme = (location.search.match(/[?&]theme=(light|dark|system)/) || [])[1];
    var mode = urlTheme || Store.data.settings.theme || 'system';
    if (urlTheme) Store.data.settings.theme = mode;
    applyTheme(mode);

    buildStaticBits();
    setEntryDate(U.today(), true);
    var v = (location.hash || '').replace('#', '');
    switchView(['home', 'search', 'stats', 'settings'].indexOf(v) >= 0 ? v : 'home');
  }

  /* ---- gate 事件 ---- */
  $('#gateCreate').addEventListener('click', function () {
    var name = $('#gateSpaceName').value.trim() || '我的日子';
    Store.createSpace(name);
    startApp();
    toast('开始吧，先写下今天');
  });
  $('#gateSpaceName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#gateCreate').click();
  });

  $('#gateRestore').addEventListener('click', function () {
    $('#gateWelcome').classList.add('hidden');
    $('#gateRestorePanel').classList.remove('hidden');
  });
  $('#gateBackToWelcome').addEventListener('click', function () {
    $('#gateRestorePanel').classList.add('hidden');
    $('#gateWelcome').classList.remove('hidden');
  });
  $('#gateFile').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    readJSONFile(f).then(function (payload) {
      Store.importPayload(payload).then(function (n) {
        startApp();
        toast('恢复了 ' + n + ' 天的记录');
      });
    }).catch(function (err) {
      $('#gateRestoreError').textContent = err.message || '文件读不出来';
    });
  });

  $('#gateUnlockBtn').addEventListener('click', doUnlock);
  $('#gatePassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') doUnlock(); });
  function doUnlock() {
    var pwd = $('#gatePassword').value;
    if (!pwd) return;
    $('#gateError').textContent = '';
    Store.unlock(pwd).then(function () {
      startApp();
    }).catch(function () {
      $('#gateError').textContent = '密码不对，再试一次';
      $('#gatePassword').select();
    });
  }
  $('#gateForgot').addEventListener('click', function () {
    $('#gateError').textContent = '密码只在你的浏览器里做解密，没有找回通道。可以用之前导出的备份文件重建。';
  });

  function readJSONFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        try { resolve(JSON.parse(fr.result)); }
        catch (e) { reject(new Error('这个文件不是合法的 JSON')); }
      };
      fr.onerror = function () { reject(new Error('读取失败')); };
      fr.readAsText(file);
    });
  }

  /* ============================================================
     静态结构（滑块刻度、输入框、筛选 chip、设置回填）
     ============================================================ */
  function buildStaticBits() {
    // 滑块刻度
    var ticks = $('#sliderTicks');
    ticks.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var t = document.createElement('i');
      t.style.left = 'calc(11px + (100% - 22px) * ' + (i / 4) + ')';
      ticks.appendChild(t);
    }

    // 感恩 / 遗憾 输入
    buildList('#gratitudeList', 'gratitude');
    buildList('#regretList', 'regret');

    // 搜索的心情筛选
    var mf = $('#moodFilters');
    mf.innerHTML = '<button class="chip is-active" data-mood="all">全部</button>';
    U.MOODS.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.dataset.mood = m.v;
      b.innerHTML = '<i style="background:' + U.moodColor(m.v) + '"></i>' + m.name;
      mf.appendChild(b);
    });

    // 日历图例
    var lg = $('#calLegend');
    lg.innerHTML = '';
    U.MOODS.forEach(function (m) {
      var s = document.createElement('span');
      s.innerHTML = '<i style="background:' + U.moodColor(m.v) + '"></i>' + m.name;
      lg.appendChild(s);
    });
    var none = document.createElement('span');
    none.innerHTML = '<i style="background:var(--m0)"></i>没有记录';
    lg.appendChild(none);

    // 设置回填
    $('#quoteInput').value = Store.data.settings.quote;
    $('#spaceNameInput').value = Store.data.space.name;
    refreshSpaceMeta();
    refreshLockUI();

    // 统计默认时间
    $('#statMonth').value = U.monthKey(U.today());
    rebuildYearOptions();
  }

  function buildList(sel, field) {
    var host = $(sel);
    host.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var row = document.createElement('div');
      row.className = 'li-row';
      var num = document.createElement('div');
      num.className = 'li-num';
      num.textContent = (i + 1);
      var ta = document.createElement('textarea');
      ta.rows = 1;
      ta.dataset.field = field;
      ta.dataset.index = i;
      ta.placeholder = field === 'gratitude'
        ? ['今天有什么值得谢谢的？', '一件小事也算', '也可以是谢谢自己'][i]
        : ['有什么想重来一次的？', '哪句话没说出口？', '写下来，就先放下了'][i];
      ta.addEventListener('input', onListInput);
      ta.addEventListener('blur', function () { saveNow(); });
      row.appendChild(num);
      row.appendChild(ta);
      host.appendChild(row);
    }
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(44, ta.scrollHeight) + 'px';
  }

  var debouncedSave = U.debounce(function () { saveNow(); }, 600);

  function onListInput(e) {
    autoGrow(e.target);
    debouncedSave();
  }

  function saveNow() {
    if (!Store.data) return;
    var date = state.entryDate;
    var slider = $('#moodSlider');
    var moodSet = !$('.mood-card').classList.contains('is-empty');
    var g = ['', '', ''], r = ['', '', ''];
    $$('#gratitudeList textarea').forEach(function (ta) { g[+ta.dataset.index] = ta.value.trim(); });
    $$('#regretList textarea').forEach(function (ta) { r[+ta.dataset.index] = ta.value.trim(); });

    Store.updateEntry(date, function (e) {
      e.mood = moodSet ? +slider.value : null;
      e.gratitude = g;
      e.regret = r;
    }).then(function () {
      flashSaved();
      renderEcho();   // 回顾区可能引用同一天
    });
  }

  /* ============================================================
     视图切换
     ============================================================ */
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (b) switchView(b.dataset.view);
  });

  function switchView(v) {
    state.view = v;
    $$('.tab').forEach(function (t) { t.classList.toggle('is-active', t.dataset.view === v); });
    $$('.view').forEach(function (s) { s.classList.toggle('is-active', s.id === 'view-' + v); });
    if (v === 'stats') renderStats();
    if (v === 'search') doSearch();
    if (v === 'settings') { refreshSpaceMeta(); refreshLockUI(); }
    try { history.replaceState(null, '', '#' + v); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('#themeBtn').addEventListener('click', function () {
    var real = document.documentElement.getAttribute('data-theme');
    var next = real === 'dark' ? 'light' : 'dark';
    Store.setSetting('theme', next);
    applyTheme(next);
    onThemeChanged();
    if (state.view === 'home') renderEcho();
    buildMoodChipColors();
  });
  $('#themeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-btn');
    if (!b) return;
    Store.setSetting('theme', b.dataset.theme);
    applyTheme(b.dataset.theme);
    onThemeChanged();
    buildMoodChipColors();
  });

  function buildMoodChipColors() {
    $$('#moodFilters .chip i').forEach(function (i, idx) {
      i.style.background = U.moodColor(idx + 1);
    });
    $$('#calLegend i').forEach(function (i, idx) {
      if (idx < 5) i.style.background = U.moodColor(idx + 1);
    });
    updateMoodUI(+$('#moodSlider').value, !$('.mood-card').classList.contains('is-empty'));
  }

  /* ============================================================
     主界面：日期
     ============================================================ */
  function setEntryDate(key, silent) {
    if (!U.isValidKey(key)) return;
    state.entryDate = key;
    $('#entryDate').value = key;
    renderToday();
    if (state.echoMode === 'auto') renderEcho();
    if (!silent) { /* noop */ }
  }

  $('#entryDate').addEventListener('change', function (e) {
    if (U.isValidKey(e.target.value)) setEntryDate(e.target.value);
    else e.target.value = state.entryDate;
  });
  $('#dayPrev').addEventListener('click', function () { setEntryDate(U.addDays(state.entryDate, -1)); });
  $('#dayNext').addEventListener('click', function () { setEntryDate(U.addDays(state.entryDate, 1)); });
  $('#dayToday').addEventListener('click', function () { setEntryDate(U.today()); });

  function renderToday() {
    var key = state.entryDate;
    var isToday = key === U.today();
    $('#todayTitle').textContent = isToday ? '今天' : U.formatCN(key, 'short');
    $('#todayMeta').textContent = U.formatCN(key) + ' · ' + U.weekday(key);

    var e = Store.getEntry(key);
    var hasMood = !!(e && e.mood != null);
    var slider = $('#moodSlider');
    slider.value = hasMood ? e.mood : 3;
    updateMoodUI(+slider.value, hasMood);

    $$('#gratitudeList textarea').forEach(function (ta, i) {
      ta.value = (e && e.gratitude && e.gratitude[i]) || '';
      autoGrow(ta);
    });
    $$('#regretList textarea').forEach(function (ta, i) {
      ta.value = (e && e.regret && e.regret[i]) || '';
      autoGrow(ta);
    });
  }

  /* ---- 情绪滑块 ---- */
  function updateMoodUI(v, hasMood) {
    var card = $('.mood-card');
    var name = $('#moodName');
    card.classList.toggle('is-empty', !hasMood);
    $('#moodClear').classList.toggle('hidden', !hasMood);
    if (hasMood) {
      var c = U.moodColor(v);
      name.textContent = U.moodName(v);
      name.style.color = c;
      $('#moodSlider').style.setProperty('--thumb', c);
    } else {
      name.textContent = '还没记';
      name.style.color = 'var(--text-3)';
      $('#moodSlider').style.setProperty('--thumb', 'var(--m0)');
    }
  }

  $('#moodSlider').addEventListener('input', function (e) {
    updateMoodUI(+e.target.value, true);
  });
  $('#moodSlider').addEventListener('change', function () { saveNow(); });
  $('#moodSlider').addEventListener('pointerup', function () { saveNow(); });
  $('#moodClear').addEventListener('click', function () {
    updateMoodUI(3, false);
    $('#moodSlider').value = 3;
    saveNow();
  });

  /* ============================================================
     回顾区：那月今日 / 那年今日 / 自选
     ============================================================ */
  $('.echo-tools').addEventListener('click', function (e) {
    var b = e.target.closest('.chip-btn');
    if (!b) return;
    state.echoMode = b.dataset.echo;
    $$('.echo-tools .chip-btn').forEach(function (x) { x.classList.toggle('is-active', x === b); });
    var picker = $('#echoPickDate');
    if (state.echoMode === 'pick') {
      picker.classList.remove('hidden');
      if (!picker.value) picker.value = U.shiftMonthsStrict(state.entryDate, -1) || U.addDays(state.entryDate, -30);
      state.echoPick = picker.value;
    } else {
      picker.classList.add('hidden');
    }
    renderEcho();
  });

  $('#echoPickDate').addEventListener('change', function (e) {
    if (!U.isValidKey(e.target.value)) return;
    state.echoPick = e.target.value;
    renderEcho();
  });

  function renderEcho() {
    var host = $('#echoGrid');
    host.innerHTML = '';

    if (state.echoMode === 'pick') {
      host.classList.add('single');
      host.appendChild(echoCard(state.echoPick, '那一天', null));
      return;
    }

    host.classList.remove('single');
    var base = state.entryDate;
    var lastMonth = U.shiftMonthsStrict(base, -1);
    var lastYear = U.shiftYearsStrict(base, -1);
    var p = U.parts(base);

    host.appendChild(echoCard(
      lastMonth, '那月今日',
      lastMonth ? null : (monthLabel(base, -1) + '没有 ' + p.d + ' 号')
    ));
    host.appendChild(echoCard(
      lastYear, '那年今日',
      lastYear ? null : ((p.y - 1) + ' 年的 ' + p.m + ' 月没有 ' + p.d + ' 号')
    ));
  }

  function monthLabel(base, delta) {
    var p = U.parts(base);
    var total = p.y * 12 + (p.m - 1) + delta;
    var y = Math.floor(total / 12);
    var m = (total % 12 + 12) % 12 + 1;
    return y + ' 年 ' + m + ' 月';
  }

  /**
   * @param {string|null} key  目标日期，null = 这一天在日历上不存在
   * @param {string} tagline
   * @param {string|null} why  不存在的原因
   */
  function echoCard(key, tagline, why) {
    var card = document.createElement('div');

    var entry = key ? Store.getEntry(key) : null;
    var hasContent = entry && !Store.isEmptyEntry(entry);

    if (!hasContent) {
      card.className = 'echo-card quote';
      card.innerHTML =
        '<div class="tagline">' + U.escapeHtml(tagline) + '</div>' +
        '<div class="qmark">&ldquo;</div>' +
        '<blockquote>' + U.escapeHtml(Store.data.settings.quote) + '</blockquote>' +
        '<div class="why">' + U.escapeHtml(why || (key ? U.formatCN(key, 'short') + ' 那天没有留下记录' : '')) + '</div>';
      if (key) {
        var go = document.createElement('button');
        go.className = 'goto';
        go.textContent = '去补写这一天';
        go.addEventListener('click', function () { setEntryDate(key); scrollToToday(); });
        card.appendChild(go);
      }
      return card;
    }

    card.className = 'echo-card';
    var html = '<div class="tagline">' + U.escapeHtml(tagline) + '</div>';
    html += '<div class="edate"><b>' + U.formatCN(key, 'short') + '</b><span>' +
      U.weekday(key) + ' · ' + U.parts(key).y + '</span></div>';

    if (entry.mood != null) {
      html += '<div class="echo-mood"><i style="background:' + U.moodColor(entry.mood) + '"></i>' +
        '<em style="color:' + U.moodColor(entry.mood) + '">' + U.moodName(entry.mood) + '</em></div>';
    }

    html += secHtml('感恩', entry.gratitude, 'g');
    html += secHtml('遗憾', entry.regret, 'r');
    card.innerHTML = html;

    var btn = document.createElement('button');
    btn.className = 'goto';
    btn.textContent = '去看这一天';
    btn.addEventListener('click', function () { setEntryDate(key); scrollToToday(); });
    card.appendChild(btn);

    return card;
  }

  function secHtml(title, list, cls) {
    var items = (list || []).filter(function (t) { return String(t).trim(); });
    if (!items.length) return '';
    return '<div class="echo-sec ' + cls + '"><span>' + title + '</span><ul>' +
      items.map(function (t) { return '<li>' + U.escapeHtml(t) + '</li>'; }).join('') +
      '</ul></div>';
  }

  function scrollToToday() {
    var el = $('.today');
    if (el) window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
  }

  /* ============================================================
     搜索
     ============================================================ */
  var searchState = { q: '', mood: 'all', field: 'all', from: '', to: '' };

  $('#searchInput').addEventListener('input', U.debounce(function (e) {
    searchState.q = e.target.value.trim();
    $('#searchClear').classList.toggle('hidden', !searchState.q);
    doSearch();
  }, 220));
  $('#searchClear').addEventListener('click', function () {
    $('#searchInput').value = '';
    searchState.q = '';
    $('#searchClear').classList.add('hidden');
    doSearch();
  });
  $('#moodFilters').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    searchState.mood = c.dataset.mood;
    $$('#moodFilters .chip').forEach(function (x) { x.classList.toggle('is-active', x === c); });
    doSearch();
  });
  $('#fieldFilters').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    searchState.field = c.dataset.field;
    $$('#fieldFilters .chip').forEach(function (x) { x.classList.toggle('is-active', x === c); });
    doSearch();
  });
  $('#searchFrom').addEventListener('change', function (e) { searchState.from = e.target.value; doSearch(); });
  $('#searchTo').addEventListener('change', function (e) { searchState.to = e.target.value; doSearch(); });
  $('#searchReset').addEventListener('click', function () {
    searchState = { q: '', mood: 'all', field: 'all', from: '', to: '' };
    $('#searchInput').value = '';
    $('#searchFrom').value = '';
    $('#searchTo').value = '';
    $('#searchClear').classList.add('hidden');
    $$('#moodFilters .chip').forEach(function (x, i) { x.classList.toggle('is-active', i === 0); });
    $$('#fieldFilters .chip').forEach(function (x, i) { x.classList.toggle('is-active', i === 0); });
    doSearch();
  });

  function doSearch() {
    if (!Store.data) return;
    var s = searchState;
    var terms = s.q ? s.q.split(/\s+/).filter(Boolean) : [];
    var results = [];

    var keys = Store.dateKeys().slice().reverse();
    keys.forEach(function (date) {
      if (s.from && date < s.from) return;
      if (s.to && date > s.to) return;
      var e = Store.data.entries[date];
      if (s.mood !== 'all' && String(e.mood) !== s.mood) return;

      var lines = [];
      if (s.field === 'all' || s.field === 'gratitude') {
        (e.gratitude || []).forEach(function (t) { if (t.trim()) lines.push({ t: t, c: 'g' }); });
      }
      if (s.field === 'all' || s.field === 'regret') {
        (e.regret || []).forEach(function (t) { if (t.trim()) lines.push({ t: t, c: 'r' }); });
      }

      if (terms.length) {
        var matched = lines.filter(function (l) {
          var low = l.t.toLowerCase();
          return terms.every(function (t) { return low.indexOf(t.toLowerCase()) >= 0; });
        });
        if (!matched.length) return;
        lines = matched;
      } else if (!lines.length && e.mood == null) {
        return;
      }

      results.push({ date: date, entry: e, lines: lines });
    });

    renderResults(results, terms);
  }

  function renderResults(results, terms) {
    var host = $('#searchResults');
    var meta = $('#searchMeta');
    host.innerHTML = '';

    if (!results.length) {
      meta.textContent = '';
      host.innerHTML = '<div class="empty">' +
        (Store.dateKeys().length ? '没有找到相关的记录' : '还没有任何记录，先去写下今天吧') +
        '</div>';
      return;
    }

    meta.textContent = '找到 ' + results.length + ' 天' + (terms.length ? '，关键词：' + terms.join(' ') : '');

    var frag = document.createDocumentFragment();
    results.slice(0, 300).forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'result';
      d.dataset.date = r.date;

      var html = '<div class="result-top">' +
        '<span class="result-date">' + U.formatCN(r.date) + '</span>' +
        '<span class="result-week">' + U.weekday(r.date) + '</span>';
      if (r.entry.mood != null) {
        html += '<span class="result-mood"><i style="background:' + U.moodColor(r.entry.mood) + '"></i>' +
          U.moodName(r.entry.mood) + '</span>';
      }
      html += '</div>';

      r.lines.slice(0, 6).forEach(function (l) {
        html += '<div class="result-line ' + l.c + '">' + highlight(l.t, terms) + '</div>';
      });

      d.innerHTML = html;
      frag.appendChild(d);
    });
    host.appendChild(frag);
  }

  function highlight(text, terms) {
    var out = U.escapeHtml(text);
    terms.forEach(function (t) {
      if (!t) return;
      out = out.replace(new RegExp('(' + U.escapeReg(U.escapeHtml(t)) + ')', 'gi'), '<mark>$1</mark>');
    });
    return out;
  }

  $('#searchResults').addEventListener('click', function (e) {
    var r = e.target.closest('.result');
    if (!r) return;
    setEntryDate(r.dataset.date);
    switchView('home');
  });

  /* ============================================================
     统计
     ============================================================ */
  $('#statScope').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-btn');
    if (!b) return;
    state.statScope = b.dataset.scope;
    $$('#statScope .seg-btn').forEach(function (x) { x.classList.toggle('is-active', x === b); });
    $('#statMonth').classList.toggle('hidden', state.statScope !== 'month');
    $('#statYear').classList.toggle('hidden', state.statScope !== 'year');
    renderStats();
  });
  $('#statMonth').addEventListener('change', renderStats);
  $('#statYear').addEventListener('change', renderStats);

  function rebuildYearOptions() {
    var sel = $('#statYear');
    var years = {};
    years[new Date().getFullYear()] = 1;
    Store.dateKeys().forEach(function (k) { years[U.yearKey(k)] = 1; });
    var list = Object.keys(years).sort().reverse();
    var cur = sel.value;
    sel.innerHTML = list.map(function (y) { return '<option value="' + y + '">' + y + ' 年</option>'; }).join('');
    if (cur && list.indexOf(cur) >= 0) sel.value = cur;
    else sel.value = String(new Date().getFullYear());
  }

  function renderStats() {
    if (!Store.data) return;
    rebuildYearOptions();

    var isMonth = state.statScope === 'month';
    var prefix = isMonth ? ($('#statMonth').value || U.monthKey(U.today())) : ($('#statYear').value || String(new Date().getFullYear()));
    var rows = Store.entriesIn(prefix);

    // 概览
    var counts = [0, 0, 0, 0, 0];
    var moodSum = 0, moodDays = 0;
    var gTexts = [], rTexts = [];
    rows.forEach(function (r) {
      if (r.entry.mood != null) { counts[r.entry.mood - 1]++; moodSum += r.entry.mood; moodDays++; }
      (r.entry.gratitude || []).forEach(function (t) { if (t.trim()) gTexts.push(t); });
      (r.entry.regret || []).forEach(function (t) { if (t.trim()) rTexts.push(t); });
    });

    var avg = moodDays ? (moodSum / moodDays) : 0;
    var topMood = 0, topCount = -1;
    counts.forEach(function (c, i) { if (c > topCount) { topCount = c; topMood = i + 1; } });
    var streak = longestStreak(rows.map(function (r) { return r.date; }));

    $('#statSummary').innerHTML =
      statCard(rows.length, '天有记录') +
      statCard(moodDays ? avg.toFixed(1) : '—', '平均心情', moodDays ? U.moodColor(Math.round(avg)) : null) +
      statCard(topCount > 0 ? U.moodName(topMood) : '—', '出现最多', topCount > 0 ? U.moodColor(topMood) : null) +
      statCard(streak, '最长连续');

    // 日历
    $('#calSub').textContent = isMonth
      ? prefix.slice(0, 4) + ' 年 ' + (+prefix.slice(5, 7)) + ' 月'
      : prefix + ' 年';

    var moodOf = function (key) {
      var e = Store.data.entries[key];
      return e && e.mood != null ? e.mood : null;
    };
    var onPick = function (key) { setEntryDate(key); switchView('home'); };

    if (isMonth) Charts.monthCalendar($('#statCalendar'), prefix, moodOf, onPick);
    else Charts.yearCalendar($('#statCalendar'), +prefix, moodOf, onPick);

    // 环形
    Charts.donut($('#statDonut'), counts);

    // 词云
    WordCloud.render($('#cloudGratitude'), U.topWords(gTexts, 44), {
      palette: [U.moodColor(4), U.moodColor(4), U.moodColor(5)],
      empty: '这段时间还没写过感恩的事'
    });
    WordCloud.render($('#cloudRegret'), U.topWords(rTexts, 44), {
      palette: [U.moodColor(1), U.moodColor(2), U.moodColor(1)],
      empty: '这段时间还没写过遗憾的事'
    });
  }

  function statCard(value, label, color) {
    return '<div class="stat"><b' + (color ? ' style="color:' + color + '"' : '') + '>' +
      U.escapeHtml(String(value)) + '</b><span>' + label + '</span></div>';
  }

  function longestStreak(dates) {
    if (!dates.length) return 0;
    var sorted = dates.slice().sort();
    var best = 1, cur = 1;
    for (var i = 1; i < sorted.length; i++) {
      if (U.addDays(sorted[i - 1], 1) === sorted[i]) { cur++; if (cur > best) best = cur; }
      else cur = 1;
    }
    return best;
  }

  window.addEventListener('resize', U.debounce(function () {
    if (state.view === 'stats') renderStats();
  }, 260));

  /* ============================================================
     设置
     ============================================================ */
  $('#quoteInput').addEventListener('input', U.debounce(function (e) {
    var v = e.target.value.trim() || Store.DEFAULT_QUOTE;
    Store.setSetting('quote', v).then(function () {
      if (state.view === 'home') renderEcho();
    });
  }, 500));
  $('#quoteReset').addEventListener('click', function () {
    $('#quoteInput').value = Store.DEFAULT_QUOTE;
    Store.setSetting('quote', Store.DEFAULT_QUOTE).then(function () {
      renderEcho(); toast('已恢复默认');
    });
  });

  $('#spaceNameInput').addEventListener('input', U.debounce(function (e) {
    var v = e.target.value.trim() || '我的日子';
    Store.data.space.name = v;
    Store.persist().then(refreshSpaceMeta);
  }, 500));

  function refreshSpaceMeta() {
    if (!Store.data) return;
    var st = Store.stats();
    $('#spaceMeta').textContent = st.days
      ? '共 ' + st.days + ' 天记录 · 从 ' + U.formatCN(st.first) + ' 开始'
      : '还没有记录';
    $('#dataMeta').textContent = st.days ? '当前 ' + st.days + ' 天的内容' : '暂无内容';
    $('#spaceKey').textContent = state.keyVisible ? Store.data.space.key : '••••-••••-••••-••••';
    $('#keyToggle').textContent = state.keyVisible ? '隐藏' : '显示';
  }

  $('#keyToggle').addEventListener('click', function () {
    state.keyVisible = !state.keyVisible;
    refreshSpaceMeta();
  });
  $('#keyCopy').addEventListener('click', function () {
    var k = Store.data.space.key;
    if (navigator.clipboard) navigator.clipboard.writeText(k).then(function () { toast('恢复密钥已复制'); });
    else { window.prompt('手动复制：', k); }
  });

  /* ---- 隐私锁 ---- */
  function refreshLockUI() {
    if (!Store.data) return;
    var on = Store.isLocked();
    $('#lockState').textContent = on ? '已开启 · 打开网站需要输入密码' : '未开启';
    $('#lockToggle').textContent = on ? '关闭' : '开启';
    if (!Store.cryptoAvailable) {
      $('#lockToggle').disabled = true;
      $('#lockState').textContent = '当前浏览器环境不支持加密';
    }
  }
  $('#lockToggle').addEventListener('click', function () {
    if (Store.isLocked()) {
      if (!confirm('关闭后，记录会以明文保存在这台设备上。确定关闭吗？')) return;
      Store.disableLock().then(function () { refreshLockUI(); toast('隐私锁已关闭'); });
    } else {
      $('#lockForm').classList.toggle('hidden');
      $('#lockPwd1').focus();
    }
  });
  $('#lockCancel').addEventListener('click', function () {
    $('#lockForm').classList.add('hidden');
    $('#lockPwd1').value = ''; $('#lockPwd2').value = ''; $('#lockErr').textContent = '';
  });
  $('#lockConfirm').addEventListener('click', function () {
    var a = $('#lockPwd1').value, b = $('#lockPwd2').value;
    if (a.length < 4) { $('#lockErr').textContent = '密码至少 4 位'; return; }
    if (a !== b) { $('#lockErr').textContent = '两次输入不一致'; return; }
    Store.enableLock(a).then(function () {
      $('#lockForm').classList.add('hidden');
      $('#lockPwd1').value = ''; $('#lockPwd2').value = ''; $('#lockErr').textContent = '';
      refreshLockUI();
      toast('已加密。下次打开需要这个密码');
    }).catch(function (err) {
      $('#lockErr').textContent = err.message || '开启失败';
    });
  });

  /* ---- 导入导出 ---- */
  $('#exportBtn').addEventListener('click', function () {
    var payload = Store.exportPayload();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'MoodPath-备份-' + U.today() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('备份已导出');
  });

  $('#importFile').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    readJSONFile(f).then(function (payload) {
      return Store.importPayload(payload);
    }).then(function (n) {
      e.target.value = '';
      renderToday(); renderEcho(); refreshSpaceMeta();
      $('#quoteInput').value = Store.data.settings.quote;
      toast('导入了 ' + n + ' 天的记录');
    }).catch(function (err) {
      e.target.value = '';
      toast(err.message || '导入失败');
    });
  });

  $('#wipeBtn').addEventListener('click', function () {
    if (!confirm('会删掉这本日记里的全部记录，且无法撤销。\n建议先导出备份。确定继续吗？')) return;
    if (!confirm('再确认一次：真的清空？')) return;
    Store.wipeEntries().then(function () {
      renderToday(); renderEcho(); refreshSpaceMeta();
      toast('已清空');
    });
  });

  /* ============================================================ */
  boot();
})();
