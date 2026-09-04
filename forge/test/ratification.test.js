// forge/test/ratification.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CouncilRegistry } from "../src/council.js";
import { ProposalEngine } from "../src/proposal.js";
import { RatificationEngine, RatificationError } from "../src/ratification.js";
import { AuditLog } from "../src/audit.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

function setup(councilId = "test-governance") {
  const councilRegistry = CouncilRegistry.fromYamlDirectory(FIXTURES);
  const auditLog = new AuditLog();
  const proposalEngine = new ProposalEngine();
  const ratificationEngine = new RatificationEngine({ councilRegistry, auditLog });
  const p = proposalEngine.create({
    type: "governance",
    title: "Ratify the fixture policy",
    summary: "Fixture policy body",
    author: "steward",
    councilId,
  });
  proposalEngine.submit(p.id);
  proposalEngine.validate(p.id);
  proposalEngine.review(p.id);
  return { councilRegistry, auditLog, proposalEngine, ratificationEngine, p };
}

test("records votes only for verified council members", () => {
  const { ratificationEngine, p } = setup();
  const vote = ratificationEngine.recordVote({
    proposalId: p.id,
    memberId: "member-1",
    decision: "APPROVE",
    councilId: "test-governance",
  });
  assert.ok(vote.voteId);
  assert.equal(ratificationEngine.tally(p.id).approve, 1);
});

test("rejects votes from non-members", () => {
  const { ratificationEngine, p } = setup();
  assert.throws(
    () =>
      ratificationEngine.recordVote({
        proposalId: p.id,
        memberId: "intruder",
        decision: "APPROVE",
        councilId: "test-governance",
      }),
    RatificationError
  );
});

test("rejects invalid decision values", () => {
  const { ratificationEngine, p } = setup();
  assert.throws(
    () =>
      ratificationEngine.recordVote({
        proposalId: p.id,
        memberId: "member-1",
        decision: "MAYBE",
        councilId: "test-governance",
      }),
    /Invalid decision/
  );
});

test("duplicate votes are blocked (one member, one vote)", () => {
  const { ratificationEngine, p } = setup();
  ratificationEngine.recordVote({
    proposalId: p.id,
    memberId: "member-1",
    decision: "APPROVE",
    councilId: "test-governance",
  });
  assert.throws(
    () =>
      ratificationEngine.recordVote({
        proposalId: p.id,
        memberId: "member-1",
        decision: "APPROVE",
        councilId: "test-governance",
      }),
    /already voted/
  );
});

test("four approvals out of four votes reaches quorum and ratifies", () => {
  const { proposalEngine, ratificationEngine, p } = setup();
  for (const memberId of ["member-1", "member-2", "member-3", "member-4"]) {
    ratificationEngine.recordVote({ proposalId: p.id, memberId, decision: "APPROVE", councilId: "test-governance" });
  }
  const result = ratificationEngine.decide({ proposalId: p.id, councilId: "test-governance", proposalEngine, proposal: p });
  assert.equal(result.state, "RATIFIED");
  assert.equal(proposalEngine.get(p.id).state, "RATIFIED");
  assert.ok(result.history.some((h) => h.to === "ratified"));
});

test("quorum not met blocks decision", () => {
  const { proposalEngine, ratificationEngine, p } = setup();
  ratificationEngine.recordVote({ proposalId: p.id, memberId: "member-1", decision: "APPROVE", councilId: "test-governance" });
  assert.throws(
    () => ratificationEngine.decide({ proposalId: p.id, councilId: "test-governance", proposalEngine }),
    /quorum not met/
  );
});

test("simple majority: approvals must exceed rejections", () => {
  const { proposalEngine, ratificationEngine, p } = setup();
  ratificationEngine.recordVote({ proposalId: p.id, memberId: "member-1", decision: "APPROVE", councilId: "test-governance" });
  ratificationEngine.recordVote({ proposalId: p.id, memberId: "member-2", decision: "REJECT", councilId: "test-governance" });
  ratificationEngine.recordVote({ proposalId: p.id, memberId: "member-3", decision: "REJECT", councilId: "test-governance" });
  const result = ratificationEngine.decide({ proposalId: p.id, councilId: "test-governance", proposalEngine, proposal: p });
  assert.equal(result.state, "REJECTED");
});

test("every vote and decision is written to the audit chain", () => {
  const { proposalEngine, auditLog, ratificationEngine, p } = setup();
  ratificationEngine.recordVote({ proposalId: p.id, memberId: "member-1", decision: "APPROVE", councilId: "test-governance" });
  ratificationEngine.recordVote({ proposalId: p.id, memberId: "member-2", decision: "APPROVE", councilId: "test-governance" });
  ratificationEngine.decide({ proposalId: p.id, councilId: "test-governance", proposalEngine, proposal: p });

  const events = auditLog.entries.map((e) => e.event);
  assert.ok(events.includes("vote_recorded"));
  assert.ok(events.includes("vote_tally_published"));
  assert.ok(events.includes("ratified"));
  assert.equal(auditLog.verify().valid, true);
});