# nathanslist

A personal blog in the style of early-2000s classifieds. Free to host, no ads, no tracking.

- **Reading:** friends just open the link.
- **Writing:** go to `/write/` on the site from any phone or computer, type, add photos, click **publish**. The post is live about a minute later.

## How it works

```
write page (in your browser)
   │  saves the post + photos straight into your GitHub repository
   ▼
GitHub repository  ──►  GitHub Actions runs build.py  ──►  GitHub Pages serves the site
```

| What | Where |
|---|---|
| Posts | `posts/2026-11-10-my-post.md` (plain text, a few settings at the top) |
| Photos | `images/2026/…jpg` (shrunk to 1600px, location data removed) |
| Name, tagline, categories, about text, friends links | `site.json` |
| Look | `static/style.css` |
| Page builder | `build.py` (plain Python, nothing to install) |

## One-time setup

1. **Your GitHub username is in `site.json`** (`nathan-internet`). Change it there if it ever changes.
2. **Create the repository.** On github.com, click **New repository**, name it `nathanslist`, make it **Public** (free GitHub Pages needs that), and don't add a README.
3. **Upload this folder** to it (from this folder in Terminal):
   ```bash
   git init -b main
   git add -A
   git commit -m "first version of nathanslist"
   git remote add origin https://github.com/nathan-internet/nathanslist.git
   git push -u origin main
   ```
4. **Turn on Pages.** In the repository: **Settings › Pages › Source: GitHub Actions**. Then **Actions › publish site › Run workflow** (only needed the first time).
5. Your blog is at `https://nathan-internet.github.io/nathanslist/`.
6. **Connect each device you'll write from.** Open `/write/` on the site and follow the steps on screen (makes a GitHub key that can only change this one repository).

## Everyday use

- **New post:** `/write/` › pick a category › title › text › photos › **publish**.
- **Fix or delete a post:** `/write/` › **edit or delete a post**.
- **Formatting:** blank line = new paragraph, `**bold**`, `*italic*`, links are made clickable, start a line with `>` for a quote.
- **Change the name, categories or about text:** edit `site.json` (you can do it on github.com with the pencil icon).
- **Add friends' sites to the sidebar:** in `site.json`, `"friends": [{"name": "sam's site", "url": "https://…"}]`.

## Preview on your computer

```bash
python3 build.py --local
```

```bash
python3 -m http.server 8000 -d _site
```

Then open http://localhost:8000.

## Using your own domain later

Buy a domain, add it under **Settings › Pages › Custom domain**, then in `site.json` set `url` to `https://yourdomain.com` and `base_path` to `""`.
