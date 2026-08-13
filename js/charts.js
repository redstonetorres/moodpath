/* ============================================================
   charts.js — 零依赖图表：情绪环形图 / 月历 / 年历
   ============================================================ */
(function (global) {
  'use strict';

  var Charts = {};
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------------- 环形图 ---------------- */
  /**
   * @param {HTMLElement} host
   * @param {number[]} counts 长度 5，对应难过→幸福
   */
  Charts.donut = function (host, counts) {
    host.innerHTML = '';
    var total = counts.reduce(function (a, b) { return a + b; }, 0);

    if (!total) {
      host.innerHTML = '<div class="empty">这段时间还没有心情记录</div>';
      return;
    }

    var size = 190, r = 74, stroke = 26, cx = size / 2, cy = size / 2;
    var svg = el('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, class: 'donut-svg' });

    var circumference = 2 * Math.PI * r;
    var offset = 0;
    // 从 12 点方向顺时针
    var rot = -90;

    counts.forEach(function (c, i) {
      if (!c) return;
      var frac = c / total;
      var arc = el('circle', {
        cx: cx, cy: cy, r: r,
        fill: 'none',
        stroke: U.moodColor(i + 1),
        'stroke-width': stroke,
        'stroke-dasharray': (frac * circumference - 1.5) + ' ' + circumference,
        'stroke-dashoffset': -offset,
        transform: 'rotate(' + rot + ' ' + cx + ' ' + cy + ')',
        'stroke-linecap': 'butt',
        class: 'seg-arc'
      });
      var t = el('title');
      t.textContent = U.moodName(i + 1) + ' · ' + c + ' 天 · ' + Math.round(frac * 100) + '%';
      arc.appendChild(t);
      svg.appendChild(arc);
      offset += frac * circumference;
    });

    // 中心文字
    var big = el('text', {
      x: cx, y: cy - 2, 'text-anchor': 'middle',
      'font-size': 26, fill: 'currentColor', 'font-weight': 300
    });
    big.textContent = total;
    var small = el('text', {
      x: cx, y: cy + 18, 'text-anchor': 'middle',
      'font-size': 11, fill: 'currentColor', opacity: .5, 'letter-spacing': '.1em'
    });
    small.textContent = '天有记录';
    svg.appendChild(big); svg.appendChild(small);

    host.appendChild(svg);

    // 图例
    var legend = document.createElement('div');
    legend.className = 'donut-legend';
    for (var i = 4; i >= 0; i--) {
      var c = counts[i];
      var row = document.createElement('div');
      row.className = 'dl-row';
      row.innerHTML =
        '<i style="background:' + U.moodColor(i + 1) + '"></i>' +
        '<b>' + U.moodName(i + 1) + '</b>' +
        '<span>' + c + ' 天 · ' + (total ? Math.round(c / total * 100) : 0) + '%</span>';
      legend.appendChild(row);
    }
    host.appendChild(legend);
  };

  /* ---------------- 月历 ---------------- */
  /**
   * @param {HTMLElement} host
   * @param {string} ym 'YYYY-MM'
   * @param {(dateKey:string)=>number|null} moodOf
   * @param {(dateKey:string)=>void} onPick
   */
  Charts.monthCalendar = function (host, ym, moodOf, onPick) {
    host.innerHTML = '';
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    var days = U.daysInMonth(y, m);
    var firstDow = new Date(y, m - 1, 1).getDay();
    var today = U.today();

    var grid = document.createElement('div');
    grid.className = 'cal-month';

    U.WEEK_SHORT.forEach(function (w) {
      var h = document.createElement('div');
      h.className = 'cal-wd';
      h.textContent = w;
      grid.appendChild(h);
    });

    for (var i = 0; i < firstDow; i++) {
      var b = document.createElement('div');
      b.className = 'cal-cell blank';
      grid.appendChild(b);
    }

    for (var d = 1; d <= days; d++) {
      var key = y + '-' + U.pad2(m) + '-' + U.pad2(d);
      var mood = moodOf(key);
      var cell = document.createElement('div');
      cell.className = 'cal-cell' + (mood ? ' has' : '') + (key === today ? ' today' : '');
      cell.textContent = d;
      if (mood) {
        cell.style.background = U.moodColor(mood);
        cell.title = U.formatCN(key) + ' · ' + U.moodName(mood);
        cell.dataset.date = key;
      } else {
        cell.title = U.formatCN(key) + ' · 没有记录';
      }
      grid.appendChild(cell);
    }

    grid.addEventListener('click', function (e) {
      var c = e.target.closest('.cal-cell');
      if (c && c.dataset.date && onPick) onPick(c.dataset.date);
    });

    host.appendChild(grid);
  };

  /* ---------------- 年历 ---------------- */
  Charts.yearCalendar = function (host, year, moodOf, onPick) {
    host.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'cal-year';

    for (var m = 1; m <= 12; m++) {
      var row = document.createElement('div');
      row.className = 'cal-yrow';
      var label = document.createElement('div');
      label.className = 'cal-ylabel';
      label.textContent = m + '月';
      row.appendChild(label);

      var cells = document.createElement('div');
      cells.className = 'cal-ycells';
      var dim = U.daysInMonth(year, m);
      for (var d = 1; d <= 31; d++) {
        var c = document.createElement('div');
        if (d > dim) {
          c.className = 'cal-ycell void';
        } else {
          var key = year + '-' + U.pad2(m) + '-' + U.pad2(d);
          var mood = moodOf(key);
          c.className = 'cal-ycell' + (mood ? ' has' : '');
          if (mood) {
            c.style.background = U.moodColor(mood);
            c.title = U.formatCN(key) + ' · ' + U.moodName(mood);
            c.dataset.date = key;
          } else {
            c.title = U.formatCN(key) + ' · 没有记录';
          }
        }
        cells.appendChild(c);
      }
      row.appendChild(cells);
      wrap.appendChild(row);
    }

    wrap.addEventListener('click', function (e) {
      var c = e.target.closest('.cal-ycell');
      if (c && c.dataset.date && onPick) onPick(c.dataset.date);
    });

    host.appendChild(wrap);
  };

  global.Charts = Charts;
})(window);
