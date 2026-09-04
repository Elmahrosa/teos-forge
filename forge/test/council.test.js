// forge/test/council.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { CouncilRegistry, CouncilError } from "../src/council.js";
import { DEFAULT_COUNCIL_DIR } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

test("registry loads the five real councils from YAML", () => {
  const reg = CouncilRegistry.fromYamlDirectory(DEFAULT_COUNCIL_DIR);
  assert.equal(reg.list().length, 5);
  for (const c of reg.list()) {
    assert.ok(c.quorumRatio > 0);
    assert.ok(Array.isArray(c.scope));
  }
});

test("real councils have ZERO members (governance-first, nothing invented)", () => {
  const reg = CouncilRegistry.fromYamlDirectory(DEFAULT_COUNCIL_DIR);
  assert.ok(reg.list().every((c) => c.memberCount === 0), "no identities may be invented");
  for (const c of reg.list()) {
    assert.equal(reg.quorum(c.id), 0, `${c.id} quorum must be 0 while empty`);
  }
});

test("membership check accepts verified members and rejects outsiders", () => {
  const reg = CouncilRegistry.fromYamlDirectory(FIXTURES);
  assert.equal(reg.isMember("test-governance", "member-1"), true);
  assert.equal(reg.isMember("test-governance", "intruder"), false);
  assert.equal(reg.memberProfile("test-governance", "member-2").verified, true);
});

test("quorum uses ratio of members (ceil)", () => {
  const reg = CouncilRegistry.fromYamlDirectory(FIXTURES);
  assert.equal(reg.quorum("test-governance"), 2); // ceil(4 * 0.5)
  assert.equal(reg.quorumMet("test-governance", 1), false);
  assert.equal(reg.quorumMet("test-governance", 2), true);
});

test("scope routing: councils review only their declared proposal types", () => {
  const reg = CouncilRegistry.fromYamlDirectory(FIXTURES);
  assert.equal(reg.inScope("test-governance", "governance"), true);
  assert.equal(reg.inScope("test-governance", "mining"), false);
});

test("unverified members in a council config raise a schema error", () => {
  const reg = CouncilRegistry.fromYamlDirectory(FIXTURES); // valid baseline
  assert.ok(reg.list().length >= 1);
  assert.throws(() => {
    const dir = join(FIXTURES, "bad");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "bad.yaml"),
      ["id: bad", "name: Bad", "members:", "  - { id: x, verified: false }"].join("\n")
    );
    try {
      CouncilRegistry.fromYamlDirectory(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, CouncilError);
});