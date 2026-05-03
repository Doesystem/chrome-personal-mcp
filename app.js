import puppeteer from 'puppeteer';

const isDebug = process.env.MODE === 'debug';

(async () => {
  const browser = await puppeteer.launch({
    headless: isDebug ? false : true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    userDataDir: '/data/chrome-profile',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800'
    ],
    defaultViewport: null
  });

  const page = await browser.newPage();

  await page.goto('https://www.lifetimesoft.com/', { waitUntil: 'networkidle2' });

  // log console (สำคัญเวลาเป็น agent)
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  if (isDebug) {
    console.log('👉 Debug mode: login/manual actions (60s)');
    await page.waitForTimeout(60000);
  }

  await page.screenshot({ path: '/data/last.png' });

  await browser.close();
})();