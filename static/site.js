// nathanslist: small bits of behaviour for the public pages
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- copy / share link on a post ----
  var copy = $('copy'), urlBox = $('p-url');
  if (copy && urlBox) {
    copy.addEventListener('click', function () {
      var ok = $('copied');
      function done() { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2500); }
      function fallback() { urlBox.focus(); urlBox.select(); try { document.execCommand('copy'); } catch (e) {} done(); }
      if (navigator.clipboard) navigator.clipboard.writeText(urlBox.value).then(done, fallback); else fallback();
    });
    var share = $('share');
    if (share && navigator.share) {
      share.hidden = false;
      share.addEventListener('click', function () {
        navigator.share({ title: document.querySelector('.post h1').textContent, url: urlBox.value }).catch(function () {});
      });
    }
  }

  // ---- photo gallery thumbnails ----
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.gallery .strip button');
    if (!b) return;
    var g = b.closest('.gallery'), btns = g.querySelectorAll('.strip button');
    btns.forEach(function (x) { x.classList.toggle('on', x === b); });
    var main = g.querySelector('.main');
    main.querySelector('img').src = b.dataset.src;
    var a = main.querySelector('a'); if (a) a.href = b.dataset.src;
    var i = Array.prototype.indexOf.call(btns, b);
    g.querySelector('.cap').textContent = 'image ' + (i + 1) + ' of ' + btns.length;
  });

  // ---- calendar on the homepage ----
  var cal = $('cal');
  if (cal) {
    var dates = JSON.parse(cal.dataset.dates || '[]'), base = cal.dataset.base || '';
    var MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    var now = new Date(), view = new Date(now.getFullYear(), now.getMonth(), 1);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var draw = function () {
      var y = view.getFullYear(), m = view.getMonth(), key = y + '-' + pad(m + 1), days = {};
      dates.forEach(function (d) { if (d.slice(0, 7) === key) days[+d.slice(8, 10)] = 1; });
      var first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate();
      var h = '<caption><button type="button" class="calnav" data-d="-1" aria-label="previous month">&lsaquo;</button> ' +
        MON[m] + ' ' + y + ' <button type="button" class="calnav" data-d="1" aria-label="next month">&rsaquo;</button></caption><tr>' +
        'smtwtfs'.split('').map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr><tr>';
      for (var i = 0; i < first; i++) h += '<td></td>';
      for (var d = 1; d <= n; d++) {
        var today = y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
        h += '<td' + (today ? ' class="today"' : '') + '>' +
          (days[d] ? '<a href="' + base + '/archive/' + key + '/#d-' + d + '">' + d + '</a>' : d) + '</td>';
        if ((first + d) % 7 === 0 && d < n) h += '</tr><tr>';
      }
      cal.innerHTML = h + '</tr>';
    };
    cal.addEventListener('click', function (e) {
      var b = e.target.closest('.calnav');
      if (b) { view.setMonth(view.getMonth() + Number(b.dataset.d)); draw(); }
    });
    draw();
  }

  // ---- search page ----
  var res = $('results');
  if (res) {
    var input = $('q'), count = $('count');
    input.value = new URLSearchParams(location.search).get('q') || '';
    fetch(res.dataset.src).then(function (r) { return r.json(); }).then(function (all) {
      var run = function () {
        var terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        var hits = terms.length ? all.filter(function (p) {
          var hay = (p.t + ' ' + p.x + ' ' + p.c).toLowerCase();
          return terms.every(function (t) { return hay.indexOf(t) !== -1; });
        }) : [];
        count.textContent = terms.length ? hits.length + ' result' + (hits.length === 1 ? '' : 's') : 'type something to search';
        res.innerHTML = hits.map(function (p) {
          return '<li><span class="d">' + esc(p.d) + '</span><a class="t" href="' + esc(p.u) + '">' + esc(p.t) +
            '</a> <span class="c">(' + esc(p.c) + ')</span></li>';
        }).join('');
      };
      input.addEventListener('input', run);
      run();
    }).catch(function () { count.textContent = "search isn't working right now. try again in a minute."; });
  }
})();
