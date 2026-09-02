const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

async function captureFailure(page, testName) {
  try {
    const folder = path.join(__dirname, "screenshots");
    await fs.mkdir(folder, { recursive: true });

    const safeName = testName.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);

    const filename = `${safeName}-${randomUUID()}.png`;

    await page.screenshot({
      path: path.join(folder, filename),
      fullPage: true,
      timeout: 5000,
    });

    return {
      label: testName,
      url: `/screenshots/${filename}`,
    };
  } catch (err) {
    console.warn(`Screenshot failed for ${testName}: ${err.message}`);

    return {
      label: testName,
      error: "Screenshot unavailable.",
    };
  }
}

async function runPlaywrightTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  async function recordResult(result) {
    result.success = Boolean(result.success);

    if (!result.success && !result.screenshots) {
      result.screenshots = [await captureFailure(page, result.testName)];
    }

    results.push(result);
  }

  // Disable animations for faster interaction
  try {
    await page.addStyleTag({
      content: "* { transition: none !important; animation: none !important; }",
    });
  } catch (_) {}

  // -------------------------------------------
  // Test Case 1: Homepage load
  // -------------------------------------------
  try {
    const url = "https://www.saccounty.gov/";
    const start = Date.now();

    await page.goto(url, { waitUntil: "domcontentloaded" });
    const loadTime = Date.now() - start;

    await recordResult({
      testName: "Homepage Load",
      success: true,
      details: `Homepage loaded successfully in ${loadTime} ms`,
    });
  } catch (err) {
    await recordResult({
      testName: "Homepage Load",
      success: false,
      details: `Error: ${err.message}`,
    });
  }

  // ----------------------------------------------------
  // Test Case 2: Search modal loads and returns text
  // ----------------------------------------------------
  try {
    await page.waitForSelector("#gsc-i-id3", {
      state: "visible",
      timeout: 10000,
    });

    await page.fill("#gsc-i-id3", "test");
    await page.keyboard.press("Enter");

    // Wait for visible search modal
    await page.waitForFunction(
      () => {
        const overlays = Array.from(
          document.querySelectorAll(".gsc-results-wrapper-overlay"),
        );
        return overlays.some((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      },
      null,
      { timeout: 10000 },
    );

    const modalText = await page.evaluate(() => {
      const overlays = Array.from(
        document.querySelectorAll(".gsc-results-wrapper-overlay"),
      );
      const visible = overlays.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return visible ? visible.textContent : "";
    });

    const success =
      modalText &&
      modalText.trim().length > 0 &&
      (modalText.includes("No results") || modalText.length > 20);

    await recordResult({
      testName: "Search Modal Loads",
      success,
      details: success
        ? "Search modal displayed results or 'No results'"
        : "Modal loaded but no usable search results text found",
    });
  } catch (err) {
    await recordResult({
      testName: "Search Modal Loads",
      success: false,
      details: `Error: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------
  // Test Case 3: Mega menu → Departments & Offices page loads
  // ---------------------------------------------------------------------
  try {
    await page.goto("https://www.saccounty.gov/", {
      waitUntil: "networkidle",
    });

    const governmentLink = page.locator('a:has-text("Government")').first();
    await governmentLink.waitFor({ state: "visible", timeout: 15000 });
    await governmentLink.hover();

    const deptLink = page
      .locator('a:has-text("List of Departments and Offices")')
      .first();
    await deptLink.waitFor({ state: "visible", timeout: 15000 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      deptLink.click(),
    ]);

    const finalUrl = page.url();
    const expectedSuffix = "/Departments-and-Offices.html";
    const success = finalUrl.includes(expectedSuffix);

    await recordResult({
      testName: "Departments & Offices Page",
      success,
      details: success ? `Loaded: ${finalUrl}` : `Unexpected URL: ${finalUrl}`,
    });
  } catch (err) {
    await recordResult({
      testName: "Departments & Offices Page",
      success: false,
      details: `Error: ${err.message}`,
    });
  }

  // =====================================================================
  // RESPONSIVE TEST — one consolidated result across all 3 breakpoints.
  // Real check per breakpoint still runs and must genuinely pass; this
  // just reports them as a single row instead of three.
  // =====================================================================
  try {
    const breakpoints = [
      {
        name: "375x812 (mobile)",
        width: 375,
        height: 812,
        check: async (page) =>
          page
            .locator('button.navbar-toggler[aria-label="Toggle navigation"]')
            .first()
            .isVisible()
            .catch(() => false),
      },
      {
        name: "1024x768 (tablet)",
        width: 1024,
        height: 768,
        check: async (page) => {
          const mobileMenuVisible = await page
            .locator('button.navbar-toggler[aria-label="Toggle navigation"]')
            .first()
            .isVisible()
            .catch(() => false);
          return !mobileMenuVisible;
        },
      },
      {
        name: "1366x768 (desktop)",
        width: 1366,
        height: 768,
        check: async (page) =>
          page
            .locator('a:has-text("Government")')
            .first()
            .isVisible()
            .catch(() => false),
      },
    ];

    const failures = [];
    const screenshots = [];

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto("https://www.saccounty.gov/", {
        waitUntil: "domcontentloaded",
      });

      const passed = await bp.check(page);
      if (!passed) {
        failures.push(bp.name);
        screenshots.push(await captureFailure(page, `Responsive ${bp.name}`));
      }
    }

    const success = failures.length === 0;

    await recordResult({
      testName: "Responsive Rendering (375/1024/1366)",
      success,
      details: success
        ? "Site renders correctly for all 3 views at these breakpoints"
        : `Failed at: ${failures.join(", ")}`,
      screenshots,
    });
  } catch (err) {
    await recordResult({
      testName: "Responsive Rendering (375/1024/1366)",
      success: false,
      details: `Error: ${err.message}`,
    });
  }

  // =====================================================================
  // Test 5: Homepage main heading is visible
  // =====================================================================

  try {
    await page.setViewportSize({ width: 1366, height: 768 });

    await page.goto("https://www.saccounty.gov/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const heading = page.locator("h1").first();
    await heading.waitFor({
      state: "visible",
      timeout: 10000,
    });

    const headingText = (await heading.innerText()).trim();
    const success = headingText.length > 0;

    await recordResult({
      testName: "Homepage Main Heading",
      success,
      details: success
        ? `Visible heading: ${headingText}`
        : "The main heading is visible but empty.",
    });
  } catch (err) {
    await recordResult({
      testName: "Homepage Main Heading",
      success: false,
      details: `Error: ${err.message}`,
    });
  }

  // Temporary check of screenshot capture and dashboard display.
  await page.setContent(`
    <h1>Screenshot feature test</h1>
    <p>This page should appear in the failure screenshot.</p>
`);

  await recordResult({
    testName: "Screenshot Demo",
    success: false,
    details: "Intentional failure to verify screenshot capture.",
  });

  await browser.close();
  return results;
}

module.exports = runPlaywrightTest;
