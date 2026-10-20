// Usage: node capture.js <url> <captureId> [<url> <captureId> ...]
const { chromium } = require('playwright-core');

(async () => {
  const pairs = [];
  for (let i = 2; i < process.argv.length; i += 2) pairs.push([process.argv[i], process.argv[i + 1]]);
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-gpu','--disable-extensions','--disable-dev-shm-usage','--renderer-process-limit=1','--js-flags=--max-old-space-size=2048'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const capJs = require('fs').readFileSync(__dirname + '/capture-lib.js', 'utf8');
  ctx.setDefaultTimeout(240000);

  for (const [url, id] of pairs) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 90000 });
      // Trigger lazy images and scroll-reveal animations
      await page.evaluate(async () => {
        document.querySelectorAll('img[loading=lazy]').forEach(i => (i.loading = 'eager'));
        for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 100));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(2000);
      await page.waitForTimeout(1500);
      await page.evaluate(s => { const el = document.createElement('script'); el.textContent = s; document.head.appendChild(el); }, capJs);
      await page.waitForTimeout(500);
      const r = await page.evaluate(id => window.figma.captureForDesign({
        captureId: id,
        endpoint: `https://mcp.figma.com/mcp/capture/${id}/submit?bindVariables=true`,
        selector: 'body',
      }), id);
      console.log('OK', url, JSON.stringify(r).slice(0, 400));
    } catch (e) {
      console.log('FAIL', url, e.message);
    }
    await page.close();
  }
  await browser.close();
})();
