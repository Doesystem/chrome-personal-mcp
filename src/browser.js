import puppeteer from 'puppeteer';

const isDebug = process.env.MODE === 'debug';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--start-maximized',
  '--disable-background-networking',
];

async function launchBrowser() {
  return puppeteer.launch({
    headless: !isDebug,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    userDataDir: '/data/chrome-profile',
    args: LAUNCH_ARGS,
    defaultViewport: null,
    timeout: 60_000,
  });
}

// Reuse the first tab Puppeteer opens — avoids the "2 tabs on startup" issue
async function getPage(b) {
  const pages = await b.pages();
  return pages[0] ?? await b.newPage();
}

export async function createBrowser() {
  let browser = await launchBrowser();
  let activePage = await getPage(browser);

  activePage.on('console', msg => console.error('[page]', msg.text()));

  // Auto-relaunch if Chrome is closed or crashes
  browser.on('disconnected', async () => {
    console.error('[browser] Disconnected — relaunching in 3s...');
    await new Promise(r => setTimeout(r, 3_000));
    try {
      browser = await launchBrowser();
      activePage = await getPage(browser);
      activePage.on('console', msg => console.error('[page]', msg.text()));
      console.error('[browser] Relaunched');
    } catch (e) {
      console.error('[browser] Failed to relaunch:', e.message);
    }
  });

  // ctx is shared across all tools
  // - ctx.page   → currently active page
  // - ctx.browser → browser instance (for multi-tab tools)
  const ctx = {
    get page()    { return activePage; },
    get browser() { return browser; },
    setPage(p)    { activePage = p; },
  };

  return ctx;
}
