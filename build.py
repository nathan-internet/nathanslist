#!/usr/bin/env python3
"""Builds the nathanslist website into the _site/ folder.

    python3 build.py           build for the live site (GitHub runs this for you)
    python3 build.py --local   build for previewing on this computer

No extra installs needed: plain Python 3.
"""
import html
import json
import re
import shutil
import sys
from datetime import datetime
from email.utils import format_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_site"
CFG = json.loads((ROOT / "site.json").read_text(encoding="utf-8"))
LOCAL = "--local" in sys.argv
BASE = "" if LOCAL else CFG.get("base_path", "").rstrip("/")
# SITE_URL is just the address of the server (no base path); u() adds the base path
SITE_URL = "http://localhost:8000" if LOCAL else CFG["url"].rstrip("/")
if not LOCAL and BASE and SITE_URL.endswith(BASE):
    SITE_URL = SITE_URL[:-len(BASE)]
CATS = CFG["categories"]
MON = "jan feb mar apr may jun jul aug sep oct nov dec".split()
MONTH = ("january february march april may june july august "
         "september october november december").split()
VER = datetime.now().strftime("%Y%m%d%H%M")
FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E"
           "%3Crect width='16' height='16' fill='%236b2a9e'/%3E%3Ctext x='8' y='12.5' font-size='12' "
           "text-anchor='middle' fill='white' font-family='Georgia'%3En%3C/text%3E%3C/svg%3E")


def esc(s):
    return html.escape(str(s), quote=True)


def u(path):
    """Site-relative link, with the base path GitHub Pages needs."""
    return BASE + path


# ---------- reading posts ----------

def parse_front_matter(text):
    text = text.replace("\r\n", "\n")
    meta, body = {}, text
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            for line in text[4:end].split("\n"):
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = text[end + 4:].lstrip("\n")
    return meta, body.strip()


def parse_post(path):
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})-(.+)\.md$", path.name)
    if not m:
        print("  skipping (name should look like 2026-11-10-my-post.md):", path.name)
        return None
    y, mo, d, slug = m.groups()
    meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
    try:
        date = datetime.strptime(meta.get("date", ""), "%Y-%m-%d %H:%M")
    except ValueError:
        date = datetime(int(y), int(mo), int(d), 12, 0)
    cat = meta.get("category", "")
    if cat not in CATS:
        cat = next(iter(CATS))
    images = [i.strip() for i in meta.get("images", "").split(",") if i.strip()]
    return {
        "title": meta.get("title") or slug.replace("-", " "),
        "cat": cat, "date": date, "slug": slug, "images": images, "body": body,
        "url": "/%s/%s/%s/" % (y, mo, slug), "file": path.name,
    }


# ---------- text formatting ----------

LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)|(https?://[^\s<]+[^\s<.,;:!?)])")


def inline(t):
    t = esc(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])", r"<i>\1</i>", t)

    def link(m):
        if m.group(1):
            return '<a href="%s">%s</a>' % (m.group(2), m.group(1))
        return '<a href="%s">%s</a>' % (m.group(3), m.group(3))
    return LINK.sub(link, t)


def render_body(body):
    out = []
    for p in [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]:
        lines = p.split("\n")
        if all(l.startswith(">") for l in lines):
            out.append("<blockquote><p>" + "<br>".join(inline(l[1:].strip()) for l in lines) + "</p></blockquote>")
        else:
            out.append("<p>" + "<br>".join(inline(l) for l in lines) + "</p>")
    return "\n".join(out)


def plain(body, n=None):
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", body)
    t = " ".join(re.sub(r"[*>]", "", t).split())
    if n and len(t) > n:
        t = t[:n].rsplit(" ", 1)[0] + "…"
    return t


def short_date(d):
    return "%s %d" % (MON[d.month - 1], d.day)


def long_date(d):
    return d.strftime("%Y-%m-%d ") + d.strftime("%I:%M%p").lstrip("0").lower()


# ---------- page pieces ----------

def page(title, body, path, desc="", image="", kind="website", noindex=False, scripts=""):
    full = CFG["title"] if title == CFG["title"] else "%s - %s" % (title, CFG["title"])
    desc = desc or CFG["tagline"]
    og_img = ('<meta property="og:image" content="%s">' % esc(SITE_URL + u("/" + image))) if image else ""
    robots = '<meta name="robots" content="noindex">' if noindex else ""
    return """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{full}</title>
<meta name="description" content="{desc}">
<meta property="og:site_name" content="{site}"><meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}"><meta property="og:type" content="{kind}">
<meta property="og:url" content="{url}">{og_img}
<meta name="twitter:card" content="{card}">{robots}
<link rel="alternate" type="application/rss+xml" title="{site}" href="{feed}">
<link rel="icon" href="{favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<link rel="stylesheet" href="{css}">
</head><body>
<main class="page">
{body}
</main>
{footer}
<script src="{js}"></script>{scripts}
</body></html>
""".format(full=esc(full), desc=esc(desc), site=esc(CFG["title"]), title=esc(title), kind=kind,
           url=esc(SITE_URL + u(path)), og_img=og_img, card="summary_large_image" if image else "summary",
           robots=robots, feed=u("/feed.xml"), favicon=FAVICON, css=u("/static/style.css?v=" + VER),
           body=body, footer=footer(), js=u("/static/site.js?v=" + VER), scripts=scripts)


def footer():
    return ('<footer class="foot"><span>&copy; %d %s &middot; no ads, no tracking</span>'
            '<nav><a href="%s">about</a><a href="%s">rss</a><a href="%s">write</a></nav>'
            '<span>best viewed in any browser</span></footer>'
            % (datetime.now().year, esc(CFG["title"]), u("/about/"), u("/feed.xml"), u("/write/")))


def crumbs(*parts, write=True):
    segs = ['<span class="logo"><a href="%s">%s</a></span>' % (u("/"), esc(CFG["title"]))]
    segs += ['<span class="gt">&rsaquo;</span> ' + p for p in parts]
    w = ('<span class="sp"></span><a class="w" href="%s">write a post</a>' % u("/write/")) if write else ""
    return '<div class="crumbs">%s%s</div>' % (" ".join(segs), w)


def post_list(posts, show_cat=False, day_anchors=False):
    if not posts:
        return '<p class="empty">nothing here yet.</p>'
    rows, seen = [], set()
    for p in posts:
        anchor = ""
        if day_anchors and p["date"].day not in seen:
            seen.add(p["date"].day)
            anchor = ' id="d-%d"' % p["date"].day
        cat = ' <span class="c">(%s)</span>' % esc(CATS[p["cat"]]) if show_cat else ""
        pic = ' <span class="pic">pic</span>' if p["images"] else ""
        rows.append('<li%s><span class="d">%s</span><a class="t" href="%s">%s</a>%s%s</li>'
                    % (anchor, short_date(p["date"]), u(p["url"]), esc(p["title"]), cat, pic))
    return '<ul class="list">%s</ul>' % "".join(rows)


def months_of(posts):
    months = {}
    for p in posts:
        key = p["date"].strftime("%Y-%m")
        months.setdefault(key, []).append(p)
    return months  # newest first, because posts are sorted newest first


def month_name(key):
    y, m = key.split("-")
    return "%s %s" % (MONTH[int(m) - 1], y)


# ---------- pages ----------

def home(posts, months):
    cols = []
    for k, name in CATS.items():
        ps = [p for p in posts if p["cat"] == k]
        items = "".join('<li><a href="%s">%s</a></li>' % (u(p["url"]), esc(p["title"])) for p in ps[:4])
        more = ('<li><a href="%s">all %d &raquo;</a></li>' % (u("/cat/%s/" % k), len(ps))) if ps \
            else '<li class="n">nothing yet</li>'
        cols.append('<div class="cat"><h2><a href="%s">%s</a></h2><ul>%s%s</ul></div>'
                    % (u("/cat/%s/" % k), esc(name), items, more))

    arch = "".join('<li><a href="%s">%s %s</a> <span class="n">(%d)</span></li>'
                   % (u("/archive/%s/" % k), MON[int(k[5:]) - 1], k[:4], len(v))
                   for k, v in list(months.items())[:6])
    arch += '<li><a href="%s">all posts &raquo;</a></li>' % u("/all/")
    friends = ""
    if CFG.get("friends"):
        friends = ('<div><h2 class="sideh">friends</h2><ul>%s</ul></div>'
                   % "".join('<li><a href="%s">%s</a></li>' % (esc(f["url"]), esc(f["name"])) for f in CFG["friends"]))
    dates = json.dumps(sorted({p["date"].strftime("%Y-%m-%d") for p in posts}))

    body = """<div class="index">
  <div class="side">
    <div><h1 class="logo"><a href="{home}">{title}</a></h1><span class="tag">{tagline}</span></div>
    <a class="writebtn" href="{write}">write a post</a>
    <ul><li><a href="{all}">all posts</a></li><li><a href="{about}">about me</a></li></ul>
    <form action="{search}" role="search"><input type="text" name="q" id="search" placeholder="search {title}" aria-label="search posts"></form>
    <table class="cal" id="cal" data-dates="{dates}" data-base="{base}"></table>
  </div>
  <div>
    <p class="welcome">{welcome}</p>
    <div class="cols">{cols}</div>
  </div>
  <div class="right">
    <div><h2 class="sideh">archive</h2><ul>{arch}</ul></div>
    {friends}
    <div><h2 class="sideh">subscribe</h2><ul><li><a href="{feed}">rss feed</a></li></ul></div>
  </div>
</div>""".format(home=u("/"), title=esc(CFG["title"]), tagline=esc(CFG["tagline"]), write=u("/write/"),
                 all=u("/all/"), about=u("/about/"), search=u("/search/"), dates=esc(dates), base=esc(BASE),
                 welcome=esc(CFG["welcome"]), cols="".join(cols), arch=arch, friends=friends, feed=u("/feed.xml"))
    return page(CFG["title"], body, "/")


def list_page(title, crumb_html, posts, path, show_cat=False, day_anchors=False):
    n = len(posts)
    body = (crumbs(crumb_html) + '<p class="listhead">%d post%s, newest first</p>' % (n, "" if n == 1 else "s")
            + post_list(posts, show_cat, day_anchors))
    return page(title, body, path)


def post_page(p, older, newer):
    imgs = p["images"]
    gallery = ""
    if imgs:
        main = '<div class="main"><a href="%s" target="_blank" rel="noopener"><img src="%s" alt=""></a></div>' % (
            u("/" + imgs[0]), u("/" + imgs[0]))
        strip = cap = ""
        if len(imgs) > 1:
            strip = '<div class="strip">%s</div>' % "".join(
                '<button type="button" data-src="%s"%s aria-label="show image %d"><img src="%s" alt="" loading="lazy"></button>'
                % (u("/" + i), ' class="on"' if n == 0 else "", n + 1, u("/" + i)) for n, i in enumerate(imgs))
            cap = '<div class="cap">image 1 of %d</div>' % len(imgs)
        gallery = '<div class="gallery">%s%s%s</div>' % (main, strip, cap)
    words = len(p["body"].split())
    link = SITE_URL + u(p["url"])
    nav = ('<a href="%s">&laquo; older: %s</a>' % (u(older["url"]), esc(older["title"]))) if older else "<span></span>"
    if newer:
        nav += '<a href="%s">newer: %s &raquo;</a>' % (u(newer["url"]), esc(newer["title"]))
    short_title = p["title"] if len(p["title"]) <= 30 else p["title"][:30] + "…"
    body = """{crumbs}
<article class="post">
  <h1>{title}</h1>
  <div class="meta">posted: {date} &middot; {cat} &middot; {words} words</div>
  <div class="body">{gallery}{text}</div>
  <div class="sharebox">
    <span>share this post:</span>
    <input type="text" id="p-url" readonly value="{link}" aria-label="link to this post">
    <button type="button" id="copy">copy link</button>
    <button type="button" id="share" hidden>share&hellip;</button>
    <span class="ok" id="copied" hidden>copied!</span>
  </div>
  <div class="prevnext">{nav}</div>
</article>""".format(crumbs=crumbs('<a href="%s">%s</a>' % (u("/cat/%s/" % p["cat"]), esc(CATS[p["cat"]])),
                                   esc(short_title)),
                     title=esc(p["title"]), date=long_date(p["date"]), cat=esc(CATS[p["cat"]]), words=words,
                     gallery=gallery, text=render_body(p["body"]), link=esc(link), nav=nav)
    return page(p["title"], body, p["url"], desc=plain(p["body"], 160), image=imgs[0] if imgs else "",
                kind="article")


def search_page():
    body = (crumbs("search")
            + '<form class="searchform" role="search" onsubmit="return false"><input type="search" id="q" '
              'placeholder="search %s" aria-label="search posts" autofocus></form>' % esc(CFG["title"])
            + '<p class="listhead" id="count"></p><ul class="list" id="results" data-src="%s"></ul>' % u("/search.json"))
    return page("search", body, "/search/", noindex=True)


def about_page():
    body = crumbs("about") + '<article class="post"><h1>about</h1><div class="body">%s</div></article>' % render_body(
        CFG.get("about", ""))
    return page("about", body, "/about/")


def write_page():
    cfg = {"owner": CFG["github"]["owner"], "repo": CFG["github"]["repo"], "branch": CFG["github"].get("branch", "main"),
           "base": BASE, "site_url": SITE_URL + BASE, "title": CFG["title"],
           "cats": CATS}
    blob = json.dumps(cfg).replace("</", "<\\/")
    body = (crumbs("write a post", write=False)
            + '<div id="app"><noscript>the write page needs javascript turned on.</noscript></div>'
            + '<script id="cfg" type="application/json">%s</script>' % blob)
    return page("write a post", body, "/write/", noindex=True,
                scripts='<script src="%s"></script>' % u("/static/write.js?v=" + VER))


def not_found_page():
    body = crumbs("not found") + ('<article class="post"><h1>page not found</h1><div class="body"><p>that page '
                                  'isn\'t here. it may have moved or been deleted.</p><p><a href="%s">go to the '
                                  'homepage</a> or <a href="%s">see all posts</a>.</p></div></article>'
                                  % (u("/"), u("/all/")))
    return page("not found", body, "/404.html", noindex=True)


def feed(posts):
    items = []
    for p in posts[:20]:
        link = SITE_URL + u(p["url"])
        content = ('<p><img src="%s" alt=""></p>' % (SITE_URL + u("/" + p["images"][0])) if p["images"] else "") \
            + render_body(p["body"])
        items.append("<item><title>%s</title><link>%s</link><guid>%s</guid><pubDate>%s</pubDate>"
                     "<category>%s</category><description>%s</description></item>"
                     % (esc(p["title"]), link, link, format_datetime(p["date"].astimezone()),
                        esc(CATS[p["cat"]]), esc(content)))
    return ('<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"><channel><title>%s</title><link>%s</link>'
            '<description>%s</description>%s</channel></rss>\n'
            % (esc(CFG["title"]), SITE_URL + u("/"), esc(CFG["tagline"]), "".join(items)))


def search_index(posts):
    return json.dumps([{"t": p["title"], "u": u(p["url"]), "d": short_date(p["date"]), "y": p["date"].year,
                        "c": CATS[p["cat"]], "f": p["file"], "x": plain(p["body"])} for p in posts])


# ---------- build ----------

def write(path, content):
    f = OUT / path.lstrip("/")
    if path.endswith("/"):
        f = f / "index.html"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    posts = [p for p in (parse_post(f) for f in sorted((ROOT / "posts").glob("*.md"))) if p]
    posts.sort(key=lambda p: p["date"], reverse=True)
    months = months_of(posts)

    write("/", home(posts, months))
    write("/all/", list_page("all posts", "all posts", posts, "/all/", show_cat=True))
    for k, name in CATS.items():
        write("/cat/%s/" % k, list_page(name, esc(name), [p for p in posts if p["cat"] == k], "/cat/%s/" % k))
    for key, ps in months.items():
        write("/archive/%s/" % key, list_page(month_name(key), '<a href="%s">archive</a> <span class="gt">&rsaquo;</span> %s'
                                              % (u("/all/"), month_name(key)), ps, "/archive/%s/" % key,
                                              show_cat=True, day_anchors=True))
    for i, p in enumerate(posts):
        newer = posts[i - 1] if i > 0 else None
        older = posts[i + 1] if i + 1 < len(posts) else None
        write(p["url"], post_page(p, older, newer))
    write("/search/", search_page())
    write("/about/", about_page())
    write("/write/", write_page())
    write("/404.html", not_found_page())
    write("/feed.xml", feed(posts))
    write("/search.json", search_index(posts))

    shutil.copytree(ROOT / "static", OUT / "static")
    if (ROOT / "images").exists():
        shutil.copytree(ROOT / "images", OUT / "images")
    (OUT / ".nojekyll").write_text("")
    print("built %d post%s into _site/%s" % (len(posts), "" if len(posts) == 1 else "s",
                                             "  (local preview mode)" if LOCAL else ""))


if __name__ == "__main__":
    main()
