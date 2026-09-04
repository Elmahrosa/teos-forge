// forge/test/proposal.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { ProposalEngine, canTransition, TERMINAL_STATES } from "../src/proposal.js";

function makeEngine() {
  return new ProposalEngine();
}

test("happy path: full lifecycle to EXECUTED", () => {
  const eng = makeEngine();
  let p = eng.create({
    type: "governance",
    title: "Ratify onboarding rule",
    summary: "Body of the proposal.",
    author: "governance-steward",
    councilId: "governance",
    timelockMs: 0,
  });

  assert.equal(p.state, "DRAFT");
  p = eng.submit(p.id);
  assert.equal(p.state, "SUBMITTED");
  p = eng.validate(p.id);
  assert.equal(p.state, "VALIDATION");
  p = eng.review(p.id);
  assert.equal(p.state, "COUNCIL_REVIEW");
  p = eng.ratify(p.id, { decision: "ratified by council" });
  assert.equal(p.state, "RATIFIED");
  p = eng.readyForDeployment(p.id);
  assert.equal(p.state, "DEPLOYMENT_READY");
  p = eng.execute(p.id);
  assert.equal(p.state, "EXECUTED");
});

test("REJECTED is a structurally terminal state — cannot be executed", () => {
  const eng = makeEngine();
  let p = eng.create({
    type: "governance",
    title: "Doomed proposal",
    summary: "x",
    author: "steward",
    councilId: "governance",
  });
  p = eng.submit(p.id);
  p = eng.validate(p.id);
  p = eng.review(p.id);
  p = eng.reject(p.id, { decision: "no approval" });

  assert.equal(p.state, "REJECTED");
  assert.equal(canTransition("REJECTED", "EXECUTED"), false);
  assert.equal(canTransition("REJECTED", "DEPLOYMENT_READY"), false);
  assert.equal(canTransition("REJECTED", "RATIFIED"), false);
  assert.ok(TERMINAL_STATES.includes("REJECTED"));
  assert.throws(() => eng.execute(p.id), /Illegal transition/);
});

test("validation failure forces REJECTED, not COUNCIL_REVIEW", () => {
  const eng = makeEngine();
  let p = eng.create({
    type: "governance",
    title: "Invalid proposal",
    summary: "Fails structural validation.",
    payload: {},
    author: "steward",
    councilId: "governance",
  });
  p = eng.submit(p.id);
  p = eng.validate(p.id);
  p = eng.invalidate(p.id, "validation failed: empty payload");
  assert.equal(p.state, "REJECTED");
  assert.throws(() => eng.execute(p.id));
});

test("DEPLOYMENT_READY and EXECUTED are only reachable from RATIFIED / DEPLOYMENT_READY", () => {
  assert.equal(canTransition("RATIFIED", "DEPLOYMENT_READY"), true);
  assert.equal(canTransition("DEPLOYMENT_READY", "EXECUTED"), true);
  assert.equal(canTransition("SUBMITTED", "DEPLOYMENT_READY"), false);
  assert.equal(canTransition("COUNCIL_REVIEW", "EXECUTED"), false);
  assert.equal(canTransition("VALIDATION", "EXECUTED"), false);
  assert.equal(canTransition("DRAFT", "EXECUTED"), false);
});

test("illegal direct transitions throw ProposalError", () => {
  const eng = makeEngine();
  const p = eng.create({ type: "code", title: "T", summary: "s", author: "a", councilId: "technical" });
  assert.throws(() => eng.execute(p.id), /Illegal transition DRAFT → EXECUTED/);
  assert.throws(() => eng.ratify(p.id, {}), /must be COUNCIL_REVIEW/);
});

test("timelock blocks early deployment and gates after expiry", () => {
  let now = Date.now();
  const eng = new ProposalEngine({ now: () => now });
  let p = eng.create({
    type: "code",
    title: "Deploy SPL token",
    summary: "Contract deploy",
    author: "steward",
    councilId: "technical",
    timelockMs: 1000,
  });
  p = eng.submit(p.id);
  p = eng.validate(p.id);
  p = eng.review(p.id);
  p = eng.ratify(p.id, { decision: "ok" });

  assert.throws(() => eng.readyForDeployment(p.id), /timelock/);

  now += 1001;
  p = eng.readyForDeployment(p.id);
  assert.equal(p.state, "DEPLOYMENT_READY");
});