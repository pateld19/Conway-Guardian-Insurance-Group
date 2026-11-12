// CheckEverythingWorks agent
// Opens the Conway Guardian site in a real browser, clicks every button and link
// on every page, fills in and sends every version of the quote form and the
// contact form, and fails if anything breaks.
//
// Every test also fails on: JavaScript errors, console errors, and missing
// files (images, scripts, styles) from the site itself.

const { test, expect } = require("@playwright/test");

const VIEWS = [
  { name: "Home", hash: "" },
  { name: "Auto insurance", hash: "auto" },
  { name: "Homeowners insurance", hash: "homeowners" },
  { name: "Renters insurance", hash: "renters" },
  { name: "Landlord insurance", hash: "landlord" },
  { name: "Business insurance", hash: "business" },
  { name: "About", hash: "about" },
  { name: "Contact", hash: "contact" },
  { name: "Get a quote", hash: "quote" },
  { name: "Privacy policy", hash: "privacy" },
];
const VIEW_NAME_BY_HASH = { "": "", about: "about", contact: "contact", quote: "quote", privacy: "privacy",
  auto: "coverage", homeowners: "coverage", renters: "coverage", landlord: "coverage", business: "coverage" };
const COVERAGE_KEYS = ["auto", "homeowners", "renters", "landlord", "business"];

const CLICKABLE = "a[href], button, summary, label.chip, label.qopt, label.cov-opt, label.consent";

/* ------------------------------------------------------------------ */
/* Error tracking: every test fails if the page logs problems          */
/* ------------------------------------------------------------------ */
test.beforeEach(async ({ page, baseURL }) => {
  const problems = [];
  const origin = new URL(baseURL).origin;
  page.on("pageerror", (err) => problems.push(`JavaScript error: ${err.message}`));
  page.on("console", (msg) => {
    // "Failed to load resource" is reported below with the file name, and only for the site's own files
    // (so an outside service like Google Fonts being slow doesn't fail the check).
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) problems.push(`Console error: ${msg.text()}`);
  });
  page.on("response", (res) => {
    if (res.url().startsWith(origin) && res.status() >= 400) problems.push(`Missing file (${res.status()}): ${res.url()}`);
  });
  page.on("requestfailed", (req) => {
    // ERR_ABORTED = the test moved on before a download finished (not a site problem).
    // Truly missing files are caught above as 404s.
    const why = req.failure()?.errorText || "";
    if (req.url().startsWith(origin) && !why.includes("ERR_ABORTED")) problems.push(`Failed to load (${why}): ${req.url()}`);
  });
  page.__problems = problems;
});

test.afterEach(async ({ page }) => {
  expect(page.__problems, "The page reported errors").toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
async function open(page, hash) {
  // about:blank first forces a full, fresh page load (changing only the #part would keep old state)
  await page.goto("about:blank");
  await page.goto("/index.html" + (hash ? "#" + hash : ""));
  await expect(page.locator(".view.on")).toHaveCount(1);
}

const isMobile = (testInfo) => testInfo.project.name === "mobile";

// Gives every visible clickable element a stable number so the same element
// can be found again after the page is reloaded.
async function markClickables(page) {
  return page.evaluate((sel) => {
    const out = [];
    document.querySelectorAll(sel).forEach((el) => {
      el.removeAttribute("data-cew");
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = r.width > 0 && r.height > 0 && style.visibility !== "hidden" && el.closest("[hidden]") === null
        && el.closest('[aria-hidden="true"]') === null && el.offsetParent !== null;
      if (!visible) return;
      el.setAttribute("data-cew", String(out.length));
      out.push({
        label: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("href") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60),
        href: el.getAttribute("href"),
      });
    });
    return out;
  }, CLICKABLE);
}

async function expectHealthyPage(page, what) {
  await expect(page.locator(".view.on"), `After clicking "${what}", the page should still show exactly one section`).toHaveCount(1);
  expect(page.__problems, `Clicking "${what}" caused errors`).toEqual([]);
}

async function clickChip(scope, value) {
  await scope.locator(`label:has(input[value="${value}"])`).first().click();
}

// Answers every question on the visible quote step. Required questions get a
// valid answer; optional text fields are filled too so they get exercised.
async function fillVisibleStep(page) {
  const step = page.locator("#quoteForm .wstep.on");
  for (let pass = 0; pass < 4; pass++) { // more questions can appear (e.g. one block per vehicle)
    // Radio / checkbox questions
    const groups = await step.evaluate((s) => {
      const names = new Set();
      s.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((i) => {
        if (i.offsetParent !== null || i.closest("label")?.offsetParent !== null) names.add(i.name);
      });
      return [...names].filter((n) => n && n !== "cov" && !s.querySelector(`input[name="${n}"]:checked`));
    });
    for (const name of groups) {
      const options = step.locator(`input[name="${name}"]`);
      const count = await options.count();
      let pick = 0;
      if (name === "auto_vehicles" && count > 1) pick = 1;        // 2 vehicles: tests the per-vehicle blocks
      if (/^auto_v\d+_own$/.test(name)) pick = 1;                  // "Financed": tests the lender section
      await options.nth(pick).locator("xpath=ancestor::label[1]").click();
    }
    // Text, date and dropdown questions
    const fields = step.locator("input[type=text], input[type=tel], input[type=email], input[type=date], input:not([type]), select, textarea");
    const n = await fields.count();
    for (let i = 0; i < n; i++) {
      const f = fields.nth(i);
      if (!(await f.isVisible())) continue;
      const tag = await f.evaluate((el) => el.tagName);
      if (tag === "SELECT") {
        if (!(await f.inputValue())) await f.selectOption({ index: 1 });
        continue;
      }
      if (await f.inputValue()) continue;
      const id = (await f.getAttribute("id")) || "";
      const type = (await f.getAttribute("type")) || "text";
      const max = Number(await f.getAttribute("maxlength")) || 0;
      let v = "Test answer";
      if (type === "date") { const d = new Date(Date.now() + 30 * 864e5); v = d.toISOString().slice(0, 10); }
      else if (/zip/.test(id) || max === 5) v = "29201";
      else if (/year/.test(id) || max === 4) v = "2019";
      else if (/vin/.test(id) || max === 17) v = "1HGCM82633A004352";
      else if (/phone/.test(id)) v = "8035550123";
      else if (/email/.test(id)) v = "test.customer@example.com";
      else if (id === "first") v = "Testy";
      else if (id === "last") v = "McTester";
      await f.fill(v);
      if (type === "date") await f.dispatchEvent("change");
    }
    // Consent checkbox on the contact step
    const consent = step.locator("#consent");
    if ((await consent.count()) && !(await consent.isChecked())) await step.locator("#consent-f").click();
  }
}

async function runQuote(page, keys) {
  await open(page, "quote");
  for (const k of keys) await page.locator(`label.cov-opt:has(input[value="${k}"])`).click();
  const next = page.locator("#wizNext");
  for (let guard = 0; guard < 15; guard++) {
    if (await page.locator("#sendBtn").isVisible()) break;
    await fillVisibleStep(page);
    const before = await page.locator("#wizName").innerText();
    await next.click();
    await expect(page.locator("#quoteForm .wstep.on .step-err.show"), `Step "${before}" still shows an error after filling every question`).toHaveCount(0);
  }
  await expect(page.locator("#sendBtn"), "Never reached the review step").toBeVisible();
  await expect(page.locator("#reviewBox")).toContainText("Testy McTester");
  await page.locator("#sendBtn").click();
  await expect(page.locator("#quoteDone")).toBeVisible();
  await expect(page.locator("#quoteDone")).toContainText("Thanks, Testy");
}

/* ------------------------------------------------------------------ */
/* 1. Every page loads cleanly                                         */
/* ------------------------------------------------------------------ */
for (const v of VIEWS) {
  test(`${v.name} page loads with all images and no errors`, async ({ page }, testInfo) => {
    await open(page, v.hash);
    await expect(page.locator(`.view.on[data-view="${VIEW_NAME_BY_HASH[v.hash]}"]`)).toBeVisible();
    await expect(page).toHaveTitle(/Conway Guardian Insurance Group/);
    await expect(page.locator("header.site img.mark")).toBeVisible();

    // Every image that should be on screen actually loaded
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.src));
    expect(broken, "Images that failed to load").toEqual([]);

    // Nothing spills off the side of the screen
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${v.name} page scrolls sideways on ${testInfo.project.name}`).toBeLessThanOrEqual(1);
  });
}

/* ------------------------------------------------------------------ */
/* 2. Click every button and link on every page                        */
/* ------------------------------------------------------------------ */
for (const v of VIEWS) {
  test(`every button and link on the ${v.name} page works`, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, v.hash);
    const items = await markClickables(page);
    expect(items.length, "Found no buttons to click").toBeGreaterThan(0);

    for (let i = 0; i < items.length; i++) {
      const { label, href } = items[i];
      await open(page, v.hash);
      await markClickables(page);
      const el = page.locator(`[data-cew="${i}"]`);
      if (!(await el.count())) continue; // layout changed (e.g. menu closed); covered by other tests

      const realHref = await el.getAttribute("href");
      if (realHref && realHref.startsWith("tel:")) {
        expect(realHref.replace(/\D/g, "").length, `"${label}" phone link has a bad number: ${realHref}`).toBeGreaterThanOrEqual(10);
        continue;
      }
      if (realHref && /^(mailto:|https?:)/.test(realHref)) {
        expect(() => new URL(realHref), `"${label}" has a broken link`).not.toThrow();
        continue;
      }

      await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
      await el.click({ timeout: 5_000 });
      await page.waitForTimeout(150);
      await expectHealthyPage(page, label);

      // In-page links must land on the right section
      if (href && /^#[a-z]*$/.test(href)) {
        const target = href.slice(1);
        if (target in VIEW_NAME_BY_HASH) {
          await expect(page.locator(`.view.on[data-view="${VIEW_NAME_BY_HASH[target]}"]`),
            `"${label}" should open the ${target || "home"} page`).toBeVisible();
        }
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* 3. Navigation menus                                                 */
/* ------------------------------------------------------------------ */
test("Coverage dropdown: every item starts a quote with that coverage pre-selected (desktop)", async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), "Desktop menu only");
  for (const k of COVERAGE_KEYS) {
    await open(page, "");
    await page.locator("#covDD > button").click();
    await expect(page.locator("#covMenu")).toBeVisible();
    await page.locator(`#covMenu a[data-pre="${k}"]`).click();
    await expect(page.locator('.view.on[data-view="quote"]')).toBeVisible();
    await expect(page.locator(`#covGrid input[value="${k}"]`), `Menu item for ${k} should pre-select ${k}`).toBeChecked();
    await expect(page.locator("#covGrid input:checked")).toHaveCount(1);
  }
});

test("Mobile menu opens, every link works, and it closes (mobile)", async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), "Mobile menu only");
  await open(page, "");
  const links = await page.evaluate(() => {
    document.querySelector("#burger").click();
    return [...document.querySelectorAll("#mobileLinks a[href^='#']")].map((a) => a.getAttribute("href"));
  });
  expect(links.length).toBeGreaterThan(3);
  for (const href of links) {
    await open(page, "");
    await page.locator("#burger").click();
    await expect(page.locator("#mobileNav")).toBeVisible();
    await page.locator(`#mobileLinks a[href="${href}"]`).first().click();
    await expect(page.locator("#mobileNav"), `Menu should close after tapping ${href}`).toBeHidden();
    const target = href.slice(1);
    if (target in VIEW_NAME_BY_HASH) await expect(page.locator(`.view.on[data-view="${VIEW_NAME_BY_HASH[target]}"]`)).toBeVisible();
  }
  await page.locator("#burger").click();
  await page.locator("#closeNav").click();
  await expect(page.locator("#mobileNav")).toBeHidden();
});

/* ------------------------------------------------------------------ */
/* 4. Home page quick picker and "quote this" buttons                  */
/* ------------------------------------------------------------------ */
test("Home quick picker: goes to the quote form, carrying over whatever was picked", async ({ page }) => {
  // Nothing picked: goes straight to the quote form with nothing pre-selected
  await open(page, "");
  await page.locator("#quickGo").click();
  await expect(page.locator('.view.on[data-view="quote"]')).toBeVisible();
  await expect(page.locator("#covGrid input:checked")).toHaveCount(0);
  // Two picked: both carried over
  await open(page, "");
  await clickChip(page.locator("#quickOpts"), "auto");
  await clickChip(page.locator("#quickOpts"), "renters");
  await page.locator("#quickGo").click();
  await expect(page.locator('.view.on[data-view="quote"]')).toBeVisible();
  await expect(page.locator('#covGrid input[value="auto"]')).toBeChecked();
  await expect(page.locator('#covGrid input[value="renters"]')).toBeChecked();
  await expect(page.locator('#covGrid input[value="homeowners"]')).not.toBeChecked();
});

for (const k of COVERAGE_KEYS) {
  test(`"Get a ${k} quote" button pre-selects ${k} in the quote form`, async ({ page }) => {
    await open(page, k);
    await page.locator(`.view.on a[data-pre="${k}"]`).first().click();
    await expect(page.locator('.view.on[data-view="quote"]')).toBeVisible();
    await expect(page.locator(`#covGrid input[value="${k}"]`)).toBeChecked();
  });
}

test("FAQ questions open and close", async ({ page }) => {
  await open(page, "");
  const items = page.locator(".view.on .faq details");
  const n = await items.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const d = items.nth(i);
    await d.locator("summary").click();
    await expect(d).toHaveAttribute("open", "");
    await d.locator("summary").click();
    await expect(d).not.toHaveAttribute("open", "");
  }
});

/* ------------------------------------------------------------------ */
/* 5. Quote form: every coverage type, start to finish                 */
/* ------------------------------------------------------------------ */
for (const k of COVERAGE_KEYS) {
  test(`Quote form works end to end for ${k}`, async ({ page }) => {
    await runQuote(page, [k]);
  });
}

test("Quote form works end to end with all five coverage types at once", async ({ page }) => {
  test.setTimeout(120_000);
  await runQuote(page, COVERAGE_KEYS);
});

test("Quote form blocks Continue until required questions are answered", async ({ page }) => {
  await open(page, "quote");
  await page.locator("#wizNext").click();
  await expect(page.locator('.wstep[data-key="coverage"] .step-err')).toBeVisible();
  await page.locator('label.cov-opt:has(input[value="renters"])').click();
  await page.locator("#wizNext").click();
  await expect(page.locator("#wizName")).toHaveText(/Renters/);
  await page.locator("#wizNext").click(); // nothing answered yet
  await expect(page.locator("#quoteForm .wstep.on .step-err")).toBeVisible();
  await expect(page.locator("#wizName")).toHaveText(/Renters/);
});

test("Quote form Back button and review-page Edit buttons work", async ({ page }) => {
  await open(page, "quote");
  await page.locator('label.cov-opt:has(input[value="renters"])').click();
  for (let i = 0; i < 6 && !(await page.locator("#sendBtn").isVisible()); i++) {
    await fillVisibleStep(page);
    await page.locator("#wizNext").click();
  }
  await expect(page.locator("#sendBtn")).toBeVisible();
  const edits = page.locator("#reviewBox [data-edit]");
  const n = await edits.count();
  expect(n).toBeGreaterThan(2);
  for (let i = 0; i < n; i++) {
    const key = await edits.nth(i).getAttribute("data-edit");
    await edits.nth(i).click();
    await expect(page.locator(`.wstep.on[data-key="${key}"]`), `Edit should jump to the ${key} step`).toBeVisible();
    for (let j = 0; j < 6 && !(await page.locator("#sendBtn").isVisible()); j++) await page.locator("#wizNext").click();
  }
  await page.locator("#wizBack").click();
  await expect(page.locator('.wstep.on[data-key="contact"]')).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* 6. Contact form                                                     */
/* ------------------------------------------------------------------ */
test("Contact form shows errors when empty and sends when filled in", async ({ page }) => {
  await open(page, "contact");
  await page.locator("#cfSend").click();
  await expect(page.locator("#cf-name-f")).toHaveClass(/bad/);
  await expect(page.locator("#cf-email-f")).toHaveClass(/bad/);
  await expect(page.locator("#cf-msg-f")).toHaveClass(/bad/);
  await page.locator("#cf-name").fill("Testy McTester");
  await page.locator("#cf-phone").fill("8035550123");
  await page.locator("#cf-email").fill("test.customer@example.com");
  await page.locator("#cf-topic").selectOption({ index: 1 });
  await page.locator("#cf-msg").fill("This is an automated check from the CheckEverythingWorks agent.");
  await page.locator("#cfSend").click();
  await expect(page.locator("#contactPanel")).toContainText("Message sent");
});

/* ------------------------------------------------------------------ */
/* 7. Carrier logo strip and phone links                               */
/* ------------------------------------------------------------------ */
test("Carrier logo strip shows all logos and keeps scrolling", async ({ page }) => {
  await open(page, "");
  const logos = page.locator(".marquee ul:not([aria-hidden]) img");
  await expect(logos).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    expect(await logos.nth(i).evaluate((img) => img.naturalWidth), `Carrier logo ${i + 1} did not load`).toBeGreaterThan(0);
  }
  const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  test.skip(reduced, "Animation is intentionally off for reduced-motion users");
  const x = () => page.locator(".marquee-track").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  const a = await x();
  await page.waitForTimeout(700);
  expect(await x(), "Logo strip is not moving").not.toBe(a);
});

test("Every Call Now / phone link dials the agency number", async ({ page }) => {
  await open(page, "");
  const hrefs = await page.locator('a[href^="tel:"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(2);
  const numbers = new Set(hrefs.map((h) => h.replace(/\D/g, "")));
  expect(numbers.size, `Phone links point to different numbers: ${[...numbers].join(", ")}`).toBe(1);
  expect([...numbers][0].length).toBeGreaterThanOrEqual(10);
});
