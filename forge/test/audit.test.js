// forge/test/audit.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditLog, sha256, canonicalize, GENESIS_PREV_HASH } from "../src/audit.js";

test("AuditLog starts empty with genesis previous hash", () => {
  const log = new AuditLog();
  assert.equal(log.length, 0);
  assert.equal(log.tail(), null);
});

test("append creates chained, hash-carrying entries", () => {
  const log = new AuditLog();
  const e1 = log.append({ event: "proposal_created", ref: "P1", actor: "alice" });
  const e2 = log.append({ event: "vote_recorded", ref: "P1", actor: "bob" });

  assert.equal(e1.seq, 1);
  assert.equal(e2.seq, 2);
  assert.equal(e1.prevHash, GENESIS_PREV_HASH);
  assert.equal(e2.prevHash, e1.hash);
  assert.equal(e2.hash, sha256(canonicalize(e2)));
  assert.equal(log.verify().valid, true);
});

test("verify detects tampering of an in-the-middle entry", () => {
  const log = AuditLog.fromSeed((i) => ({ event: "seed", ref: `E${i}` }), 5);
  const [tamperedEntry] = log.entries;
  tamperedEntry.data = { forged: true };

  const result = log.verify();
  assert.equal(result.valid, false);
  assert.ok(result.tampered.length >= 1);
  assert.equal(result.tampered[0].seq, 1);
});

test("verify detects a broken link (prevHash mismatch)", () => {
  const log = AuditLog.fromSeed((i) => ({ event: "seed", ref: `E${i}` }), 3);
  log.entries[1].prevHash = "f".repeat(64);

  const result = log.verify();
  assert.equal(result.valid, false);
  assert.ok(result.tampered.some((t) => t.seq === 2));
});

test("AuditLog rejects loading a tampered chain", () => {
  const log = AuditLog.fromSeed((i) => ({ event: "seed", ref: `E${i}` }), 3);
  log.entries[2].event = "mutated";

  assert.throws(() => new AuditLog({ entries: log.snapshot() }), /tampered chain/);
});

test("snapshot is deep-copied and reloadable", () => {
  const log = AuditLog.fromSeed((i) => ({ event: "seed", ref: `E${i}` }), 2);
  const restored = new AuditLog({ entries: log.snapshot() });
  assert.equal(restored.length, 2);
  assert.equal(restored.verify().valid, true);
  assert.equal(restored.entries[0].hash, log.entries[0].hash);
});