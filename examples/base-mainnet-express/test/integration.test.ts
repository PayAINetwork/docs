import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { facilitator } from "@payai/facilitator";
import integration from "../integration.json" with { type: "json" };

test("integration metadata package versions match direct runtime dependencies", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    dependencies: Record<string, string>;
  };
  assert.deepEqual(integration.packages, pkg.dependencies);
});

test("released PayAI helper URL matches integration metadata", () => {
  assert.equal(facilitator.url, integration.facilitator.url);
});

