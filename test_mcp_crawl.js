import { chromium } from 'playwright';

async function testCrawling() {
  console.log('Testing Playwright crawling...');

  try {
    // Launch browser in headless mode
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate to a test website
    console.log('Navigating to https://example.com...');
    await page.goto('https://example.com');

    // Get the page title
    const title = await page.title();
    console.log('Page title:', title);

    // Extract all links from the page
    const links = await page.$$eval('a', anchors => anchors.map(anchor => anchor.href));
    console.log('Links found:', links.length);
    console.log('First few links:', links.slice(0, 5));

    // Extract page text content
    const textContent = await page.$$eval('p', paragraphs => paragraphs.map(p => p.textContent).join(' '));
    console.log('Page content preview:', textContent.substring(0, 200) + '...');

    await browser.close();
    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Error during crawling:', error.message);
  }
}

testCrawling();
