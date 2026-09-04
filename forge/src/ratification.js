// forge/src/ratification.js
// Ratification Engine — vote recording with validation, quorum enforcement,
// majority approval, duplicate-vote protection, and audit trail integration.

import { randomUUID } from "node:crypto";

const DECISIONS = Object.freeze(["APPROVE", "REJECT", "ABSTAIN"]);
const SUPREMAJORITY_RATIO = 2 / 3;

export class RatificationError extends Error {
  constructor(message, code = "RATIFICATION_ERROR") {
    super(message);
    this.code = code;
  }
}

export class RatificationEngine {
  constructor({ councilRegistry, auditLog, now = () => new Date().toISOString() } = {}) {
    if (!councilRegistry) throw new RatificationError("councilRegistry is required");
    this.councilRegistry = councilRegistry;
    this.auditLog = auditLog ?? null;
    this.now = now;
    // proposalId -> Map(memberId -> { decision, ts, voteId })
    this.tallies = new Map();

    // External hook to apply the ratified/rejected decision back to a proposal.
    this.applyDecision = null;
  }

  #decisionsFor(proposalId) {
    if (!this.tallies.has(proposalId)) {
      this.tallies.set(proposalId, new Map());
    }
    return this.tallies.get(proposalId);
  }

  #audit(event, ref, data) {
    this.auditLog?.append({ event, ref, actor: "ratification-engine", data });
  }

  recordVote({ proposalId, memberId, decision, councilId }) {
    if (!DECISIONS.includes(decision)) {
      throw new RatificationError(
        `Invalid decision "${decision}"; expected ${DECISIONS.join("|")}`,
        "RATIFICATION_INVALID_DECISION"
      );
    }

    if (!this.councilRegistry.isMember(councilId, memberId)) {
      throw new RatificationError(
        `Member "${memberId}" is not a verified member of council "${councilId}"`,
        "RATIFICATION_NOT_A_MEMBER"
      );
    }

    const votes = this.#decisionsFor(proposalId);
    if (votes.has(memberId)) {
      throw new RatificationError(
        `Member "${memberId}" has already voted on proposal "${proposalId}"`,
        "RATIFICATION_DUPLICATE_VOTE"
      );
    }

    const vote = {
      voteId: randomUUID(),
      memberId,
      decision,
      ts: this.now(),
    };
    votes.set(memberId, vote);
    this.#audit("vote_recorded", proposalId, { councilId, memberId, decision });
    return vote;
  }

  tally(proposalId) {
    const votes = this.#decisionsFor(proposalId);
    let approve = 0;
    let reject = 0;
    let abstain = 0;
    for (const { decision } of votes.values()) {
      if (decision === "APPROVE") approve += 1;
      else if (decision === "REJECT") reject += 1;
      else abstain += 1;
    }
    return { cast: votes.size, approve, reject, abstain, voters: [...votes.keys()] };
  }

  quorumMet(proposalId, councilId) {
    return this.councilRegistry.quorumMet(councilId, this.tally(proposalId).cast);
  }

  majorityApproved(councilId, tally) {
    const council = this.councilRegistry.get(councilId);
    const cast = tally.cast - tally.abstain;
    if (cast === 0) return { outcome: false, detail: "no binding votes cast" };
    if (council.majority === "supermajority") {
      const ratio = tally.approve / cast;
      const approved = ratio >= SUPREMAJORITY_RATIO;
      return { outcome: approved, detail: `${(ratio * 100).toFixed(1)}% approvals` };
    }
    // simple (strict) majority: approvals must exceed rejections
    const approved = tally.approve > tally.reject;
    const detail = `${tally.approve}A / ${tally.reject}R`;
    return { outcome: approved, detail };
  }

  // Completes ratification: returns RATIFIED or REJECTED based on quorum + majority.
  // The caller (integrator) applies the resulting state to the proposal engine.
  decide({ proposalId, councilId, proposalEngine, proposal }) {
    const tally = this.tally(proposalId);
    const quorum = this.councilRegistry.quorum(councilId);
    const quorumMet = tally.cast >= quorum;

    this.#audit("vote_tally_published", proposalId, {
      councilId,
      tally,
      quorum,
      quorumMet,
    });

    if (!quorumMet) {
      throw new RatificationError(
        `Proposal "${proposalId}" has ${tally.cast}/${quorum} votes — quorum not met`,
        "RATIFICATION_QUORUM"
      );
    }

    const majority = this.majorityApproved(councilId, tally);
    const decision = { tally, quorum, quorumMet, majority };

    if (majority.outcome) {
      this.#audit("ratified", proposalId, decision);
      this.applyDecision?.({ proposalId, outcome: "RATIFIED", decision });
      if (proposalEngine) return proposalEngine.ratify(proposal?.id ?? proposalId, decision);
      return { outcome: "RATIFIED", ...decision };
    }

    this.#audit("rejected", proposalId, decision);
    this.applyDecision?.({ proposalId, outcome: "REJECTED", decision });
    if (proposalEngine) return proposalEngine.reject(proposal?.id ?? proposalId, decision);
    return { outcome: "REJECTED", ...decision };
  }
}

export { DECISIONS, SUPREMAJORITY_RATIO };