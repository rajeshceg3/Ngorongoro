const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const base = process.env.BASE_URL || "http://127.0.0.1:8785",
    out = process.env.OUT || "docs/navigation/local";
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  try {
    for (const [w, h] of JSON.parse(
      process.env.VIEWPORTS || "[[320,568],[390,844]]",
    )) {
      for (const motion of ["reduce", "no-preference"]) {
        const p = await b.newPage({
          viewport: { width: w, height: h },
          reducedMotion: motion,
        });
        let errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        await p.addInitScript(() => { try { localStorage.setItem("ngorongoro-chrome-pin", "1"); } catch (e) {} });
        await p.goto(base);
        await p.waitForSelector("#veil.gone");
        for (let i = 0; i < 4; i++) {
          await p.mouse.click(10, 100);
          await p.locator(`[data-scene="${i}"]`).click();
          await p.waitForTimeout(3500);
          const state = await p.evaluate(() => {
            const dock = document
                .querySelector("#dock")
                .getBoundingClientRect(),
              text = document
                .querySelector("#journey-text")
                .getBoundingClientRect();
            return {
              overlap: text.bottom > dock.top,
              labels: [...document.querySelectorAll(".dot span")].map((e) => ({
                opacity: +getComputedStyle(e).opacity,
                h: e.getBoundingClientRect().height,
              })),
              buttons: [...document.querySelectorAll(".dot")].map((e) => ({
                w: e.getBoundingClientRect().width,
                h: e.getBoundingClientRect().height,
              })),
              active: document.querySelector('.dot[aria-current="true"]')
                .dataset.scene,
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          });
          assert.equal(state.overlap, false);
          assert.equal(state.overflow, false);
          assert.equal(state.active, String(i));
          assert.ok(state.labels.every((l) => l.opacity >= 0.7 && l.h > 10));
          assert.ok(state.buttons.every((r) => r.w >= 44 && r.h >= 44));
          if (motion === "reduce")
            await p.screenshot({ path: `${out}/scene-${i}-${w}.png` });
        }
        await p.waitForTimeout(5000);
        await p.locator('[data-scene="0"]').click();
        assert.equal(
          await p.locator('[data-scene="0"]').getAttribute("aria-current"),
          "true",
        );
        await p.locator('[data-scene="0"]').focus();
        await p.keyboard.press("ArrowRight");
        assert.equal(
          await p.locator('[data-scene="1"]').getAttribute("aria-current"),
          "true",
        );
        assert.equal(
          await p
            .locator('[data-scene="1"]')
            .evaluate((e) => e === document.activeElement),
          true,
        );
        assert.deepEqual(errors, []);
        results.push({
          width: w,
          height: h,
          motion,
          fourScenes: true,
          noTextOverlap: true,
          allLabelsVisible: true,
          tapTargets44: true,
          idleNavigation: true,
          keyboard: true,
        });
        await p.close();
      }
    }
    fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
    console.log(results);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
