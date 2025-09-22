import { chromium, webkit } from 'playwright';

async function testWebCrawling() {
  console.log('🧪 Testing Playwright MCP with Real Websites\n');

  const testSites = [
    {
      name: 'Hacker News',
      url: 'https://news.ycombinator.com',
      browser: 'webkit',
      selector: '.titleline > a',
      dataType: 'headlines'
    },
    {
      name: 'GitHub Trending',
      url: 'https://github.com/trending',
      browser: 'chromium',
      selector: 'article h2 a',
      dataType: 'repositories'
    }
  ];

  for (const site of testSites) {
    console.log(`🌐 Testing ${site.name} with ${site.browser.toUpperCase()}...`);

    try {
      const browser = site.browser === 'webkit' ? webkit : chromium;
      const instance = await browser.launch({ headless: true });
      const page = await instance.newPage();

      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(site.url, { waitUntil: 'networkidle' });

      const title = await page.title();
      console.log(`✅ Page loaded: ${title}`);

      // Extract data based on site
      if (site.name === 'Hacker News') {
        const headlines = await page.$$eval(site.selector, elements =>
          elements.slice(0, 5).map(el => el.textContent.trim())
        );
        console.log(`📰 Top 5 Headlines:`);
        headlines.forEach((headline, i) => console.log(`  ${i + 1}. ${headline}`));
      } else if (site.name === 'GitHub Trending') {
        const repos = await page.$$eval(site.selector, elements =>
          elements.slice(0, 5).map(el => el.textContent.trim())
        );
        console.log(`📦 Top 5 Trending Repos:`);
        repos.forEach((repo, i) => console.log(`  ${i + 1}. ${repo}`));
      }

      // Get some general page info
      const linksCount = await page.$$eval('a', anchors => anchors.length);
      const imagesCount = await page.$$eval('img', imgs => imgs.length);

      console.log(`📊 Page Stats: ${linksCount} links, ${imagesCount} images`);

      await instance.close();
      console.log(`✅ ${site.name} test completed successfully!\n`);

    } catch (error) {
      console.error(`❌ Error testing ${site.name}:`, error.message);
    }
  }

  console.log('🎉 All web crawling tests completed!');
}

// Run the test
testWebCrawling().catch(console.error);
