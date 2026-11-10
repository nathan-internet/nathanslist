// nathanslist write page: write, edit and delete posts from any browser.
// Posts are saved straight into the GitHub repository, which then rebuilds the site (about a minute).
(function () {
  'use strict';
  var CFG = JSON.parse(document.getElementById('cfg').textContent);
  var API = 'https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo;
  var RAW = 'https://raw.githubusercontent.com/' + CFG.owner + '/' + CFG.repo + '/' + CFG.branch + '/';
  var MAX_IMAGES = 8, MAX_SIDE = 1600;
  var app = document.getElementById('app');

  // ---------- small helpers ----------
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function slugify(t) {
    return t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'post';
  }
  function rand() { return Math.random().toString(36).slice(2, 8); }
  function token() { return store.get('nl_token'); }
  function postUrl(file) { // posts/2026-11-10-slug.md -> https://site/2026/11/slug/
    var m = file.replace(/^posts\//, '').match(/^(\d{4})-(\d{2})-\d{2}-(.+)\.md$/);
    return CFG.site_url + '/' + m[1] + '/' + m[2] + '/' + m[3] + '/';
  }
  function b64ToText(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }
  function parseFrontMatter(text) {
    text = text.replace(/\r\n/g, '\n');
    var meta = {}, body = text;
    if (text.indexOf('---\n') === 0) {
      var end = text.indexOf('\n---', 4);
      if (end !== -1) {
        text.slice(4, end).split('\n').forEach(function (line) {
          var i = line.indexOf(':');
          if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        });
        body = text.slice(end + 4).replace(/^\n+/, '');
      }
    }
    return { meta: meta, body: body.trim() };
  }
  function oneLine(s) { return String(s).replace(/[\r\n]+/g, ' ').trim(); }

  // same formatting rules as build.py, for the preview
  var LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
  function inline(t) {
    t = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '$1<i>$2</i>');
    return t.replace(LINK, function (m, a, b, c) { return a ? '<a href="' + b + '">' + a + '</a>' : '<a href="' + c + '">' + c + '</a>'; });
  }
  function renderBody(body) {
    return body.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) {
      var lines = p.split('\n');
      if (lines.every(function (l) { return l.charAt(0) === '>'; }))
        return '<blockquote><p>' + lines.map(function (l) { return inline(l.slice(1).trim()); }).join('<br>') + '</p></blockquote>';
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }

  // ---------- talking to GitHub ----------
  function gh(path, opts) {
    opts = opts || {};
    var headers = { 'Authorization': 'Bearer ' + token(), 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: opts.method || 'GET', headers: headers, cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        if (r.status === 404 && opts.allow404) return null;
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
          var e = new Error(j.message || ('GitHub said ' + r.status)); e.status = r.status; throw e;
        });
        return r.status === 204 ? null : r.json();
      });
  }
  function friendlyError(e) {
    if (e.status === 401) return "your key isn't working any more (it may have expired). click \"disconnect this device\" and connect again.";
    if (e.status === 403) return "your key doesn't have permission to change the blog. make a new key with contents set to read and write.";
    if (e.status === 404) return "couldn't find the " + CFG.repo + " repository with this key. check it was picked under repository access.";
    if (e.status === 409 || e.status === 422) return 'the blog changed while you were working. click the button again.';
    if (e instanceof TypeError) return "couldn't reach GitHub. check your internet connection and try again.";
    return 'something went wrong: ' + e.message;
  }
  function listPosts() {
    return gh('/contents/posts?ref=' + CFG.branch, { allow404: true }).then(function (items) {
      return (items || []).filter(function (i) { return /\.md$/.test(i.name); })
        .map(function (i) { return i.name; }).sort().reverse();
    });
  }
  // one commit containing every change, so the site rebuilds once
  function commit(message, entries) {
    var headSha;
    return gh('/git/ref/heads/' + CFG.branch)
      .then(function (ref) { headSha = ref.object.sha; return gh('/git/commits/' + headSha); })
      .then(function (head) { return gh('/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree: entries } }); })
      .then(function (tree) { return gh('/git/commits', { method: 'POST', body: { message: message, tree: tree.sha, parents: [headSha] } }); })
      .then(function (c) { return gh('/git/refs/heads/' + CFG.branch, { method: 'PATCH', body: { sha: c.sha } }); });
  }

  // ---------- photos ----------
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var s = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); // re-drawing also strips location data from phone photos
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          var fr = new FileReader();
          fr.onload = function () { resolve({ kind: 'new', b64: fr.result.split(',')[1], src: URL.createObjectURL(blob) }); };
          fr.onerror = function () { reject(new Error("couldn't read " + file.name)); };
          fr.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error("couldn't open " + file.name + '. try a jpg or png.')); };
      im.src = url;
    });
  }

  // ---------- screens ----------
  function route() {
    if (!token()) return showSetup();
    var h = location.hash.slice(1);
    if (h === 'edit') return showEditList();
    if (h.indexOf('edit-') === 0) return showEditor(decodeURIComponent(h.slice(5)));
    return showEditor(null);
  }
  window.addEventListener('hashchange', route);

  function shell(tab, inner) {
    app.innerHTML = '<div class="tabs"><a href="#new"' + (tab === 'new' ? ' class="on"' : '') + '>new post</a>' +
      '<a href="#edit"' + (tab === 'edit' ? ' class="on"' : '') + '>edit or delete a post</a>' +
      '<span class="sp"></span><button type="button" class="link" id="disc">disconnect this device</button></div>' +
      '<div id="view">' + inner + '</div>';
    $('disc').addEventListener('click', function () {
      if (this.dataset.armed) { store.del('nl_token'); location.hash = ''; route(); return; }
      this.dataset.armed = '1'; this.textContent = 'click again to disconnect';
    });
  }

  function showSetup() {
    app.innerHTML = '<div class="setup"><h2>connect this device</h2>' +
      '<p>this is where posts for ' + esc(CFG.title) + ' get written. to publish from this phone or computer, it needs a key from your GitHub account. you only do this once per device.</p>' +
      '<ol>' +
      '<li>open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub &rsaquo; new fine-grained token</a> (sign in if asked).</li>' +
      '<li>give it a name like <b>' + esc(CFG.title) + ' on my phone</b> and pick an expiry (a year is fine).</li>' +
      '<li>under <b>repository access</b>, choose <b>only select repositories</b> and pick <b>' + esc(CFG.repo) + '</b>.</li>' +
      '<li>under <b>permissions</b>, add <b>contents</b> and set it to <b>read and write</b>.</li>' +
      '<li>click <b>generate token</b>, copy it, and paste it here.</li></ol>' +
      '<label class="f" for="tok">your key</label><input type="password" id="tok" autocomplete="off" spellcheck="false" placeholder="github_pat_…">' +
      '<div class="btns" style="margin-top:12px"><button type="button" class="pub" id="tok-save">connect</button><span class="msg" id="tok-msg"></span></div>' +
      '<p class="hint">the key is saved only in this browser. anyone holding it can change your blog, so keep it to yourself. you can cancel it on GitHub at any time.</p></div>';
    $('tok-save').addEventListener('click', function () {
      var v = $('tok').value.trim(), msg = $('tok-msg'), btn = this;
      if (!v) { msg.className = 'msg err'; msg.textContent = 'paste your key first.'; return; }
      store.set('nl_token', v); btn.disabled = true; msg.className = 'msg'; msg.textContent = 'checking…';
      gh('').then(function () { location.hash = 'new'; route(); })
        .catch(function (e) { store.del('nl_token'); btn.disabled = false; msg.className = 'msg err'; msg.textContent = friendlyError(e); });
    });
  }

  function showEditList() {
    shell('edit', '<p class="listhead" id="count">loading your posts…</p><ul class="list" id="plist"></ul>');
    var titles = {};
    var getTitles = fetch(CFG.site_url + '/search.json', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (all) { all.forEach(function (p) { titles[p.f] = p.t; }); }).catch(function () {});
    Promise.all([listPosts(), getTitles]).then(function (res) {
      var files = res[0];
      $('count').textContent = files.length ? 'pick a post to edit or delete' : 'no posts yet.';
      $('plist').innerHTML = files.map(function (f) {
        var t = titles[f] || f.slice(11, -3).replace(/-/g, ' ');
        return '<li><span class="d">' + f.slice(0, 10) + '</span><a class="t" href="#edit-' + encodeURIComponent(f) + '">' + esc(t) + '</a></li>';
      }).join('');
    }).catch(function (e) { $('count').className = 'msg err'; $('count').textContent = friendlyError(e); });
  }

  function showEditor(file) {
    var isNew = !file;
    var state = { file: file, date: null, slug: null, images: [], removed: [] };
    var cats = Object.keys(CFG.cats);
    shell(isNew ? 'new' : 'edit', (isNew ? '' : '<p class="listhead" id="loading">loading post…</p>') +
      '<form class="form" id="wform"' + (isNew ? '' : ' hidden') + '>' +
      '<fieldset><legend>choose a category</legend><div class="radios">' +
      cats.map(function (k, i) { return '<label><input type="radio" name="cat" id="r-' + k + '" value="' + k + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(CFG.cats[k]) + '</label>'; }).join('') +
      '</div></fieldset>' +
      '<fieldset><legend>your post</legend>' +
      '<label class="f" for="w-title">posting title</label><input type="text" id="w-title" maxlength="140" autocomplete="off">' +
      '<label class="f" for="w-body">posting body</label><textarea id="w-body"></textarea>' +
      '<div class="hint">blank line = new paragraph. **bold**, *italic*, and links just work.' + (isNew ? ' <span id="draft-note"></span>' : '') + '</div></fieldset>' +
      '<fieldset><legend>images <span class="hint">(optional, up to ' + MAX_IMAGES + ')</span></legend>' +
      '<label class="drop" id="drop" for="w-imgs">drag photos here, or <u>choose files</u><input type="file" id="w-imgs" accept="image/*" multiple hidden></label>' +
      '<div class="thumbs" id="thumbs"></div><div class="hint">the first image is the main one. photos are shrunk automatically and location data is removed.</div></fieldset>' +
      '<div class="btns"><button type="button" id="prev-btn">preview</button>' +
      '<button type="submit" class="pub" id="pub-btn">' + (isNew ? 'publish' : 'save changes') + '</button>' +
      '<span class="msg" id="msg"></span>' +
      (isNew ? '' : '<span class="sp"></span><button type="button" class="danger" id="del-btn">delete post</button>') +
      '</div><div class="preview" id="preview" hidden></div></form>');

    var form = $('wform'), titleEl = $('w-title'), bodyEl = $('w-body'), msg = $('msg');
    function cat() { return form.querySelector('input[name=cat]:checked').value; }
    function setCat(k) { var r = $('r-' + k); if (r) r.checked = true; }
    function say(text, kind) { msg.className = 'msg' + (kind ? ' ' + kind : ''); msg.textContent = text; }
    function busy(on) { form.querySelectorAll('button').forEach(function (b) { b.disabled = on; }); }

    // drafts: new posts are kept on this device as you type
    function saveDraft() {
      if (!isNew) return;
      store.set('nl_draft', JSON.stringify({ cat: cat(), title: titleEl.value, body: bodyEl.value }));
      var n = $('draft-note'); if (n) n.textContent = 'draft saved on this device.';
    }
    if (isNew) {
      try { var d = JSON.parse(store.get('nl_draft') || 'null'); if (d) { titleEl.value = d.title || ''; bodyEl.value = d.body || ''; setCat(d.cat); } } catch (e) {}
      form.addEventListener('input', saveDraft);
      titleEl.focus();
    } else {
      gh('/contents/posts/' + encodeURIComponent(file) + '?ref=' + CFG.branch).then(function (res) {
        var p = parseFrontMatter(b64ToText(res.content));
        titleEl.value = p.meta.title || ''; bodyEl.value = p.body; setCat(p.meta.category);
        state.date = p.meta.date || (file.slice(0, 10) + ' 12:00');
        state.slug = file.slice(11, -3);
        state.images = (p.meta.images || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean)
          .map(function (path) { return { kind: 'old', path: path, src: RAW + path }; });
        drawThumbs(); $('loading').remove(); form.hidden = false;
      }).catch(function (e) { $('loading').className = 'msg err'; $('loading').textContent = friendlyError(e); });
    }

    // photos
    function drawThumbs() {
      $('thumbs').innerHTML = state.images.map(function (img, i) {
        return '<div class="thumb"><img src="' + esc(img.src) + '" alt="">' +
          (i === 0 ? '<b>main</b>' : '<button type="button" data-main="' + i + '">make main</button>') +
          '<button type="button" data-rm="' + i + '">remove</button></div>';
      }).join('');
    }
    function addFiles(files) {
      var list = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
      var room = MAX_IMAGES - state.images.length;
      if (list.length > room) say('only ' + MAX_IMAGES + ' photos per post, so some were left out.', 'err');
      list.slice(0, Math.max(0, room)).forEach(function (f) {
        shrink(f).then(function (img) { state.images.push(img); drawThumbs(); })
          .catch(function (e) { say(e.message, 'err'); });
      });
    }
    $('w-imgs').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
    $('thumbs').addEventListener('click', function (e) {
      var rm = e.target.dataset.rm, mn = e.target.dataset.main;
      if (rm !== undefined) { var gone = state.images.splice(+rm, 1)[0]; if (gone.kind === 'old') state.removed.push(gone.path); drawThumbs(); }
      if (mn !== undefined) { state.images.unshift(state.images.splice(+mn, 1)[0]); drawThumbs(); }
    });

    // preview
    function renderPreview() {
      var imgs = state.images;
      var gallery = imgs.length ? '<div class="gallery"><div class="main"><img src="' + esc(imgs[0].src) + '" alt=""></div>' +
        (imgs.length > 1 ? '<div class="strip">' + imgs.map(function (im, i) {
          return '<button type="button" data-src="' + esc(im.src) + '"' + (i ? '' : ' class="on"') + '><img src="' + esc(im.src) + '" alt=""></button>';
        }).join('') + '</div><div class="cap">image 1 of ' + imgs.length + '</div>' : '') + '</div>' : '';
      $('preview').innerHTML = '<div class="hint">preview</div><div class="post"><h1>' + esc(titleEl.value.trim() || '(no title yet)') + '</h1>' +
        '<div class="meta">posted: ' + (state.date || stamp(new Date())) + ' &middot; ' + esc(CFG.cats[cat()]) + '</div>' +
        '<div class="body">' + gallery + renderBody(bodyEl.value) + '</div></div>';
      $('preview').hidden = false;
    }
    $('prev-btn').addEventListener('click', renderPreview);

    // publish / save
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = oneLine(titleEl.value), body = bodyEl.value.trim();
      if (!title) { say('give it a title first.', 'err'); titleEl.focus(); return; }
      if (!body && !state.images.length) { say('write something or add a photo first.', 'err'); bodyEl.focus(); return; }
      busy(true); say(isNew ? 'publishing…' : 'saving…');
      var date, path;
      var ready = isNew ? listPosts().then(function (existing) {
        var now = new Date(); date = stamp(now);
        var month = date.slice(0, 7), base = slugify(title), slug = base, n = 2;
        var taken = function (s) { return existing.some(function (f) { return f.slice(0, 7) === month && f.slice(11, -3) === s; }); };
        while (taken(slug)) slug = base + '-' + (n++);
        state.slug = slug; path = 'posts/' + date.slice(0, 10) + '-' + slug + '.md';
      }) : Promise.resolve().then(function () { date = state.date; path = 'posts/' + state.file; });

      ready.then(function () {
        var year = date.slice(0, 4), paths = [], entries = [];
        return state.images.reduce(function (chain, img) {
          return chain.then(function () {
            if (img.kind === 'old') { paths.push(img.path); return; }
            var p = 'images/' + year + '/' + state.slug + '-' + rand() + '.jpg';
            return gh('/git/blobs', { method: 'POST', body: { content: img.b64, encoding: 'base64' } }).then(function (b) {
              entries.push({ path: p, mode: '100644', type: 'blob', sha: b.sha }); paths.push(p);
            });
          });
        }, Promise.resolve()).then(function () {
          state.removed.forEach(function (p) { entries.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
          var md = '---\ntitle: ' + title + '\ncategory: ' + cat() + '\ndate: ' + date + '\nimages: ' + paths.join(', ') + '\n---\n\n' + body + '\n';
          entries.push({ path: path, mode: '100644', type: 'blob', content: md });
          return commit((isNew ? 'new post: ' : 'edit post: ') + title, entries);
        });
      }).then(function () {
        if (isNew) store.del('nl_draft');
        showDone(isNew ? 'published!' : 'saved!', postUrl(path));
      }).catch(function (e) { busy(false); say(friendlyError(e), 'err'); });
    });

    // delete
    var del = $('del-btn');
    if (del) del.addEventListener('click', function () {
      if (!del.dataset.armed) {
        del.dataset.armed = '1'; del.textContent = 'click again to delete for good';
        setTimeout(function () { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'delete post'; } }, 5000);
        return;
      }
      busy(true); say('deleting…');
      var entries = [{ path: 'posts/' + state.file, mode: '100644', type: 'blob', sha: null }];
      state.images.concat(state.removed.map(function (p) { return { kind: 'old', path: p }; })).forEach(function (img) {
        if (img.kind === 'old') entries.push({ path: img.path, mode: '100644', type: 'blob', sha: null });
      });
      commit('delete post: ' + titleEl.value, entries).then(function () {
        app.innerHTML = '<div class="done"><h2>deleted.</h2><p>the post will disappear from the site in about a minute.</p><p><a href="#edit">back to your posts</a></p></div>';
      }).catch(function (e) { busy(false); say(friendlyError(e), 'err'); });
    });
  }

  function showDone(heading, url) {
    app.innerHTML = '<div class="done"><h2>' + heading + '</h2>' +
      '<p>your post will be live in about a minute at:</p>' +
      '<div class="sharebox" style="margin:0 0 14px"><input type="text" id="p-url" readonly value="' + esc(url) + '" aria-label="link to your post">' +
      '<button type="button" id="copy-new">copy link</button><span class="ok" id="copied-new" hidden>copied!</span></div>' +
      '<p><a href="' + esc(url) + '">open the post</a> &middot; <a href="#new" id="another">write another</a> &middot; <a href="' + esc(CFG.site_url) + '/">go to the homepage</a></p></div>';
    $('copy-new').addEventListener('click', function () {
      var box = $('p-url');
      function done() { $('copied-new').hidden = false; }
      if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(done, function () { box.select(); done(); });
      else { box.select(); done(); }
    });
    $('another').addEventListener('click', function (e) { e.preventDefault(); location.hash = 'new'; route(); });
  }

  route();
})();
