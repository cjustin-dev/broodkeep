// Measures the words in Adult Mode's nav row (adult track A2.3, docs/adult-a2-plan.md section 11): how much room each word has in a four-button row
// (Room, Habitat, Arena, Shop, as built) and in a five-button row with "Board" or "Requests" as the fifth, at 320, 360 and 390 wide. It lays the
// real src/ui/app.css out on a mock page (the nav markup of ui/Nav.tsx, an icon-sized empty box, no game) and measures each word's text with a Range
// against the room inside its button. The row is the window width less the 16 px gutters on each side that .app has (set as a width here: the bare page
// does not stretch the dock). The four-button row gets its columns from the real `.nav[data-adult]` rule; the five-button rows have no rule in app.css, so
// they get the same kind of columns inline (repeat(5, minmax(0, 1fr))).
// Run: node nav-mock.mjs        Prints "<row> <width>@<ratio>: <word> <text px>/<room px>" for each button, at pixel ratios 1 and 2. No assertions; nothing is written.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(homedir(), "homelab-dashboard", "package.json"));
const { chromium } = require("playwright");

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/app.css"), "utf8");
const four = ["Room", "Habitat", "Arena", "Shop"];
const rows = [
  ["four", four],
  ["five (Board)", [...four, "Board"]],
  ["five (Requests)", [...four, "Requests"]],
];

const browser = await chromium.launch();
for (const [label, words] of rows) {
  for (const [width, ratio] of [320, 360, 390].flatMap((w) => [[w, 1], [w, 2]])) {
    const page = await browser.newPage({ viewport: { width, height: 640 }, deviceScaleFactor: ratio });
    const buttons = words
      .map((text) => `<button class="btn nav-btn labelled"><span style="width:32px;height:32px;display:block"></span><span class="word">${text}</span></button>`)
      .join("");
    const grid = `width:${width - 32}px;${words.length === 4 ? "" : `grid-template-columns:repeat(${words.length},minmax(0,1fr))`}`;
    await page.setContent(`<style>${css}</style><main class="app"><div class="dock"><div class="nav" data-adult="true" style="${grid}">${buttons}</div></div></main>`);
    await page.waitForTimeout(150);
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll(".nav-btn")].map((button) => {
        const word = button.querySelector(".word");
        const range = document.createRange();
        range.selectNodeContents(word);
        const style = getComputedStyle(button);
        const room = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return `${word.textContent} ${range.getBoundingClientRect().width.toFixed(1)}/${room.toFixed(1)}`;
      }),
    );
    console.log(`${label} ${width}@${ratio}: ${cells.join(", ")}`);
    await page.close();
  }
}
await browser.close();
