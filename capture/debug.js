const { chromium } = require('playwright-core');
(async () => {
  const t0=Date.now(); const log=(...a)=>console.log(((Date.now()-t0)/1000).toFixed(1)+'s',...a);
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m=>log('console', m.type(), m.text().slice(0,200)));
  page.on('requestfailed', r=>log('reqfail', r.url().slice(0,120), r.failure()?.errorText));
  page.on('request', r=>{ if(r.url().includes('figma')) log('req', r.method(), r.url().slice(0,120)); });
  page.on('response', r=>{ if(r.url().includes('figma')) log('resp', r.status(), r.url().slice(0,120)); });
  await page.goto('http://127.0.0.1:5500/index.html', { waitUntil: 'load' }); log('loaded');
  const s = await (await ctx.request.get('https://mcp.figma.com/mcp/html-to-design/capture.js')).text(); log('capjs', s.length);
  await page.evaluate(s => { const el = document.createElement('script'); el.textContent = s; document.head.appendChild(el); }, s);
  await page.waitForTimeout(500); log('figma?', await page.evaluate(()=>typeof window.figma));
  const p = page.evaluate(() => window.figma.captureForDesign({ captureId: 'test', selector: 'body' }).then(r=>typeof r==='string'? 'str:'+r.length : JSON.stringify(Object.keys(r||{}))));
  const r = await Promise.race([p, new Promise(r=>setTimeout(()=>r('TIMEOUT'),90000))]); log('result', String(r).slice(0,300));
  await browser.close();
})();
