// Runs the `*.dump.ts` files of tools/verify with vitest, so they can import the game's own code (they are not tests: they write a file for a sheet).
// Run: npx vitest run --config tools/verify/vitest.dump.config.mjs
export default {
  root: new URL("../..", import.meta.url).pathname,
  test: { include: ["tools/verify/*.dump.ts"], environment: "node" },
};
