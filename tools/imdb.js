// Reads the public IMDb watchlist in a real browser (IMDb blocks plain requests from TVs)
// and saves the titles to imdb.json for play.tv.
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const url = fs.readFileSync('imdb-url.txt', 'utf8').trim();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'en-GB', viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('a[href*="/title/tt"]', { timeout: 60000 });
    // Scroll until no more titles load.
    let last = -1;
    for (let i = 0; i < 60; i++) {
      const n = await page.locator('a[href*="/title/tt"]').count();
      if (n === last && i > 3) break;
      last = n;
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1200);
    }
    const items = await page.evaluate(() => {
      const out = [], seen = {};
      const kindOf = t => /series/i.test(String(t || '')) ? 'series' : 'movie';
      const add = o => { if (o.id && !seen[o.id]) { seen[o.id] = 1; out.push(o); } };
      // 1. Page data (first page of the list).
      function walk(o, d) {
        if (!o || typeof o !== 'object' || d > 40) return;
        if (Array.isArray(o)) { o.forEach(x => walk(x, d + 1)); return; }
        if (typeof o.id === 'string' && /^tt\d+$/.test(o.id) && o.titleText) add({ id: o.id, title: o.titleText.text || '',
          orig: (o.originalTitleText && o.originalTitleText.text) || '', year: (o.releaseYear && o.releaseYear.year) || 0,
          kind: kindOf(o.titleType && (o.titleType.id || o.titleType.text)), img: (o.primaryImage && o.primaryImage.url) || '' });
        for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], d + 1);
      }
      const nd = document.getElementById('__NEXT_DATA__');
      if (nd) try { walk(JSON.parse(nd.textContent), 0); } catch (e) {}
      // 2. Everything shown on the page after scrolling.
      document.querySelectorAll('li').forEach(li => {
        const a = li.querySelector('a[href*="/title/tt"]'); if (!a) return;
        const id = (a.getAttribute('href').match(/tt\d+/) || [])[0]; if (!id || seen[id]) return;
        const h = li.querySelector('h3') || a;
        const text = li.innerText || '';
        const y = (text.match(/\b(19|20)\d{2}\b/) || [])[0];
        add({ id, title: (h.textContent || '').replace(/^\s*\d+\.\s*/, '').trim(), orig: '', year: +y || 0,
          kind: /TV (Mini[- ])?Series|episodes/i.test(text) ? 'series' : 'movie', img: '' });
      });
      return out;
    });
    console.log('Found', items.length, 'titles');
    if (!items.length) throw new Error('No titles found');
    fs.writeFileSync('imdb.json', JSON.stringify({ url, at: Date.now(), items }, null, 1));
  } catch (e) {
    console.error(e.message);
    await page.screenshot({ path: 'debug.png', fullPage: false }).catch(() => {});
    fs.writeFileSync('debug.html', await page.content().catch(() => ''));
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
