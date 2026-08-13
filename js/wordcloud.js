/* ============================================================
   wordcloud.js — 零依赖词云（阿基米德螺旋 + AABB 碰撞）
   ============================================================ */
(function (global) {
  'use strict';

  var measureCtx = null;
  function ctx() {
    if (!measureCtx) {
      var c = document.createElement('canvas');
      measureCtx = c.getContext('2d');
    }
    return measureCtx;
  }

  var FONT = '"PingFang SC", -apple-system, "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  /**
   * @param {HTMLElement} host
   * @param {{text:string,count:number}[]} words
   * @param {{palette?:string[], min?:number, max?:number, empty?:string}} opts
   */
  function render(host, words, opts) {
    opts = opts || {};
    host.innerHTML = '';

    if (!words || !words.length) {
      host.innerHTML = '<div class="empty">' + (opts.empty || '还没有足够的文字') + '</div>';
      return;
    }

    var W = host.clientWidth || host.parentElement.clientWidth || 400;
    var H = host.clientHeight || 260;
    var cx = W / 2, cy = H / 2;

    var counts = words.map(function (w) { return w.count; });
    var cmax = Math.max.apply(null, counts);
    var cmin = Math.min.apply(null, counts);

    var minS = opts.min || 13;
    var maxS = opts.max || Math.min(44, Math.max(28, Math.round(W / 9)));

    var palette = opts.palette || ['#9DB5A4', '#E3BE7C', '#E39A8F'];

    var placed = [];
    var c = ctx();

    // 词多时压缩一下总量，避免拥挤
    var list = words.slice(0, 46);

    list.forEach(function (w, i) {
      var ratio = cmax === cmin ? 0.62 : (w.count - cmin) / (cmax - cmin);
      var size = Math.round(minS + (maxS - minS) * Math.pow(ratio, 0.62));
      var weight = size >= maxS * 0.72 ? 500 : (size >= maxS * 0.5 ? 450 : 400);

      c.font = weight + ' ' + size + 'px ' + FONT;
      var tw = c.measureText(w.text).width;
      var th = size * 1.16;
      var padX = 7, padY = 5;

      var pos = findSpot(tw + padX * 2, th + padY * 2, W, H, cx, cy, placed);
      if (!pos) return;

      placed.push({ x: pos.x - (tw / 2 + padX), y: pos.y - (th / 2 + padY), w: tw + padX * 2, h: th + padY * 2 });

      var span = document.createElement('span');
      span.className = 'cloud-word';
      span.textContent = w.text;
      span.style.left = pos.x + 'px';
      span.style.top = pos.y + 'px';
      span.style.fontSize = size + 'px';
      span.style.fontWeight = weight;
      span.style.color = pickColor(palette, ratio, i);
      span.style.animationDelay = Math.min(i * 28, 700) + 'ms';
      span.title = w.text + ' · 出现在 ' + w.count + ' 天里';
      host.appendChild(span);
    });

    if (!host.children.length) {
      host.innerHTML = '<div class="empty">' + (opts.empty || '还没有足够的文字') + '</div>';
    }
  }

  function pickColor(palette, ratio, i) {
    // 频次越高越靠近主色，低频用浅的
    var idx = Math.min(palette.length - 1, Math.round(ratio * (palette.length - 1)));
    if (ratio < 0.18) idx = 0;
    var col = palette[idx];
    var alpha = 0.45 + 0.55 * Math.pow(ratio, 0.5);
    return hexToRgba(col, Math.min(1, alpha));
  }

  function hexToRgba(hex, a) {
    hex = String(hex).trim();
    if (hex.charAt(0) !== '#') return hex;
    if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(2) + ')';
  }

  function hit(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  function findSpot(w, h, W, H, cx, cy, placed) {
    var step = 0.28;
    var a = 3.0;              // 螺旋松紧
    var squash = 0.52;        // 压扁成横向椭圆，更符合阅读习惯
    for (var t = 0; t < 900; t++) {
      var ang = t * step;
      var r = a * ang;
      var x = cx + r * Math.cos(ang);
      var y = cy + r * Math.sin(ang) * squash;

      var box = { x: x - w / 2, y: y - h / 2, w: w, h: h };
      if (box.x < 2 || box.y < 2 || box.x + box.w > W - 2 || box.y + box.h > H - 2) {
        if (r > Math.max(W, H)) break;
        continue;
      }
      var ok = true;
      for (var i = 0; i < placed.length; i++) {
        if (hit(box, placed[i])) { ok = false; break; }
      }
      if (ok) return { x: x, y: y };
    }
    return null;
  }

  global.WordCloud = { render: render };
})(window);
