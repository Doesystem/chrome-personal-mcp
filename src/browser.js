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

async function getPage(b) {
  const pages = await b.pages();
  return pages[0] ?? await b.newPage();
}

export async function createBrowser() {
  // Hooks registered by tools that need to attach to every new page
  // e.g. network capture, console capture
  const newPageHooks = [];

  async function setupPage(page) {
    page.on('console', msg => console.error('[page]', msg.text()));
    for (const hook of newPageHooks) {
      await hook(page).catch(e => console.error('[browser] page hook error:', e.message));
    }
  }

  let browser = await launchBrowser();
  let activePage = await getPage(browser);
  await setupPage(activePage);

  // Auto-relaunch if Chrome is closed or crashes — re-attaches all hooks
  browser.on('disconnected', async () => {
    console.error('[browser] Disconnected — relaunching in 3s...');
    await new Promise(r => setTimeout(r, 3_000));
    try {
      browser = await launchBrowser();
      activePage = await getPage(browser);
      await setupPage(activePage);
      console.error('[browser] Relaunched');
    } catch (e) {
      console.error('[browser] Failed to relaunch:', e.message);
    }
  });

  const ctx = {
    get page()    { return activePage; },
    get browser() { return browser; },

    // Switch active page
    setPage(p) { activePage = p; },

    // Open a new page and run all hooks on it
    async newPage() {
      const p = await browser.newPage();
      await setupPage(p);
      return p;
    },

    // Register a hook to run on every new page (including after relaunch)
    onNewPage(fn) { newPageHooks.push(fn); },
  };

  return ctx;
}
