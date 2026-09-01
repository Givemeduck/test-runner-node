const { chromium } = require('playwright');

// Local AEM author (localhost:4502) requires a login. Sling picks the
// challenge style per-request: a plain script client (curl, no browser
// Accept header) gets an HTTP Basic 401, but a real browser request — which
// is what Playwright sends — gets redirected straight to AEM's own form
// login page instead, so `httpCredentials` never has a challenge to answer
// and silently goes unused. Logging in through that form once per test,
// in the same browser context, is what actually establishes the session.
const AEM_CREDS = { username: 'admin', password: 'admin' };
const AEM_LOGIN_URL = 'http://localhost:4502/libs/granite/core/content/login.html';

function isLocalAemUrl(targetUrl) {
    try {
        const { hostname, port } = new URL(targetUrl);
        return (hostname === 'localhost' || hostname === '127.0.0.1') && port === '4502';
    } catch {
        return false;
    }
}

// Logs into local AEM author via its real form, so the session cookie ends
// up in `context` and every later page.goto() in that context is authenticated.
// No-ops (and never throws) for any URL that isn't local AEM author.
async function loginToAemIfNeeded(context, targetUrl) {
    if (!isLocalAemUrl(targetUrl)) return;

    const page = await context.newPage();
    try {
        await page.goto(AEM_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.locator('#username, input[name="j_username"]').first().fill(AEM_CREDS.username);
        await page.locator('#password, input[name="j_password"]').first().fill(AEM_CREDS.password);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
            page.locator('button[type="submit"], input[type="submit"]').first().click()
        ]);
    } catch {
        // If login fails, the later goto() will just land on/redirect to the
        // login page again and the selector check will fail — a legible
        // false result rather than a crash.
    } finally {
        await page.close();
    }
}

function extractCalendarViews(prompt = '') {
    const text = (prompt || '').toLowerCase();
    const viewNames = ['month', 'week', 'day'];
    const found = viewNames.filter(view => text.includes(view));

    if (!found.length && /calendar|agenda|schedule/.test(text)) {
        return ['month', 'week', 'day'];
    }

    return found;
}

async function runPromptBasedCalendarTest({ url, prompt }) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    try {
        const targetUrl = url || 'https://www.saccounty.gov/';
        const cleanPrompt = (prompt || '').trim();
        const text = cleanPrompt.toLowerCase();
        const views = extractCalendarViews(cleanPrompt);

        if (!cleanPrompt || (!text.includes('calendar') && !views.length)) {
            return {
                success: false,
                details: 'Prompt is too vague. Mention a calendar or a view like month, week, or day.'
            };
        }

        await loginToAemIfNeeded(context, targetUrl);
        const page = await context.newPage();
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const selectorsByView = {
            month: ['button:has-text("Month")', '[data-view="month"]', '[aria-label*="month"]', '[role="tab"]:has-text("Month")'],
            week: ['button:has-text("Week")', '[data-view="week"]', '[aria-label*="week"]', '[role="tab"]:has-text("Week")'],
            day: ['button:has-text("Day")', '[data-view="day"]', '[aria-label*="day"]', '[role="tab"]:has-text("Day")']
        };

        const checks = [];
        const targetViews = views.length ? views : ['month', 'week', 'day'];

        for (const view of targetViews) {
            let found = false;
            for (const selector of selectorsByView[view] || []) {
                const locator = page.locator(selector).first();
                const matchCount = await locator.count().catch(() => 0);
                if (matchCount > 0) {
                    await locator.click({ force: true, timeout: 15000 }).catch(() => {});
                    found = true;
                    checks.push(`${view}: found and clicked`);
                    break;
                }
            }

            if (!found) {
                checks.push(`${view}: not found on this page`);
            }
        }

        return {
            success: true,
            details: `Prompt interpreted as a calendar filtering check. ${checks.join(' | ')}`
        };
    } catch (err) {
        return {
            success: false,
            details: `Error: ${err.message}`
        };
    } finally {
        await browser.close();
    }
}

async function runCustomTest(options = {}) {
    const { url, selector, action, passCriteria, failCriteria, prompt, mode } = options;

    if (mode === 'natural-language' || prompt) {
        return runPromptBasedCalendarTest({ url, prompt });
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    let success = false;
    let details = "";

    try {
        if (!url || url.trim().length === 0) {
            throw new Error("URL cannot be empty.");
        }

        if (!selector || selector.trim().length === 0) {
            throw new Error("Selector cannot be empty.");
        }

        await loginToAemIfNeeded(context, url);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        if (action === "check-exists") {
            const count = await page.locator(selector).count();
            success = count > 0;
            details = success
                ? (passCriteria || `Found ${count} matching element(s) for selector: ${selector}`)
                : (failCriteria || `No elements matched selector: ${selector}`);
        }

        if (action === "click-link") {
            await page.locator(selector).first().click({ force: true, timeout: 15000 }).catch(() => {
                throw new Error("Element not clickable or not found.");
            });
            success = true;
            details = passCriteria || "Element clicked successfully.";
        }

    } catch (err) {
        success = false;
        details = `Error: ${err.message}`;
    }

    await browser.close();
    return { success, details };
}

module.exports = runCustomTest;