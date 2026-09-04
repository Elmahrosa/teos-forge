// forge/src/proposal.js
// Proposal Engine — lifecycle management with structural transition rules.

// Lifecycle:
//   DRAFT → SUBMITTED → VALIDATION → COUNCIL_REVIEW → RATIFIED → DEPLOYMENT_READY → EXECUTED
//                               ↘ REJECTED (validation or council)
// Terminal states: REJECTED, EXECUTED.

import { randomUUID } from "node:crypto";

export const PROPOSAL_STATES = Object.freeze([
  "DRAFT",
  "SUBMITTED",
  "VALIDATION",
  "COUNCIL_REVIEW",
  "RATIFIED",
  "REJECTED",
  "DEPLOYMENT_READY",
  "EXECUTED",
]);

export const TERMINAL_STATES = Object.freeze(["REJECTED", "EXECUTED"]);

// Allowed transitions.
const TRANSITIONS = Object.freeze({
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["VALIDATION"],
  VALIDATION: ["COUNCIL_REVIEW", "REJECTED"],
  COUNCIL_REVIEW: ["RATIFIED", "REJECTED"],
  RATIFIED: ["DEPLOYMENT_READY"],
  DEPLOYMENT_READY: ["EXECUTED"],
  REJECTED: [], // structurally terminal — can never be executed
  EXECUTED: [], // terminal
});

export class ProposalError extends Error {
  constructor(message, code = "PROPOSAL_ERROR") {
    super(message);
    this.code = code;
  }
}

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class Proposal {
  constructor({
    id = randomUUID(),
    type,
    title,
    summary = "",
    author,
    councilId,
    payload = null,
    timelockMs = 0,
    state = "DRAFT",
    createdAt = new Date().toISOString(),
    history = [],
  } = {}) {
    if (!type) throw new ProposalError("Proposal requires a type", "PROPOSAL_SCHEMA");
    if (!title) throw new ProposalError("Proposal requires a title", "PROPOSAL_SCHEMA");
    if (!author) throw new ProposalError("Proposal requires an author", "PROPOSAL_SCHEMA");
    if (!councilId) throw new ProposalError("Proposal requires a councilId", "PROPOSAL_SCHEMA");

    this.id = id;
    this.type = type;
    this.title = title;
    this.summary = summary;
    this.author = author;
    this.councilId = councilId;
    this.payload = payload;
    this.timelockMs = timelockMs;
    this.state = state;
    this.createdAt = createdAt;
    this.ratifiedAt = null;
    this.history = [...history];
  }

  pushEvent(event, meta = {}) {
    this.history.push({
      ts: new Date().toISOString(),
      to: event,
      ...meta,
    });
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this));
  }

  toJSON() {
    return this.snapshot();
  }
}

export class ProposalEngine {
  constructor({ store = new Map(), now = () => Date.now() } = {}) {
    this.store = store;
    this.now = now;
  }

  create({ type, title, summary, author, councilId, payload = null, timelockMs = 0 }) {
    const proposal = new Proposal({
      type,
      title,
      summary,
      author,
      councilId,
      payload,
      timelockMs,
    });
    proposal.pushEvent("created", { author, type });
    this.store.set(proposal.id, proposal);
    return proposal;
  }

  get(id) {
    const proposal = this.store.get(id);
    if (!proposal) {
      throw new ProposalError(`Unknown proposal "${id}"`, "PROPOSAL_NOT_FOUND");
    }
    return proposal;
  }

  #transition(proposal, to, event, meta = {}) {
    if (canTransition(proposal.state, to)) {
      const from = proposal.state;
      proposal.state = to;
      proposal.pushEvent(event, { from, ...meta });
      return proposal;
    }
    throw new ProposalError(
      `Illegal transition ${proposal.state} → ${to} (proposal ${proposal.id})`,
      "PROPOSAL_ILLEGAL_TRANSITION"
    );
  }

  submit(proposalId) {
    return this.#transition(this.get(proposalId), "SUBMITTED", "submitted");
  }

  validate(proposalId) {
    const proposal = this.get(proposalId);
    if (!proposal.summary && !proposal.payload) {
      throw new ProposalError(`Proposal ${proposalId} has no content to validate`);
    }
    return this.#transition(proposal, "VALIDATION", "validation_started");
  }

  invalidate(proposalId, reason = "validation failed") {
    const proposal = this.get(proposalId);
    if (!reason) throw new ProposalError("A reason is required to invalidate", "PROPOSAL_SCHEMA");
    return this.#transition(proposal, "REJECTED", "validation_rejected", { reason });
  }

  review(proposalId) {
    return this.#transition(this.get(proposalId), "COUNCIL_REVIEW", "council_review_started");
  }

  ratify(proposalId, decision) {
    const proposal = this.get(proposalId);
    if (!decision) throw new ProposalError("Ratification requires a decision record");
    if (proposal.state !== "COUNCIL_REVIEW") {
      throw new ProposalError(
        `Cannot ratify from state ${proposal.state}; must be COUNCIL_REVIEW`,
        "PROPOSAL_ILLEGAL_TRANSITION"
      );
    }
    proposal.ratifiedAt = new Date().toISOString();
    return this.#transition(proposal, "RATIFIED", "ratified", decision);
  }

  reject(proposalId, decision) {
    return this.#transition(this.get(proposalId), "REJECTED", "rejected", decision ?? {});
  }

  readyForDeployment(proposalId) {
    const proposal = this.get(proposalId);
    const elapsed = this.now() - Date.parse(proposal.ratifiedAt ?? proposal.createdAt);
    if (elapsed < proposal.timelockMs) {
      throw new ProposalError(
        `Proposal ${proposalId} still within timelock (${proposal.timelockMs}ms)`,
        "PROPOSAL_TIMELOCK"
      );
    }
    return this.#transition(proposal, "DEPLOYMENT_READY", "deployment_ready");
  }

  execute(proposalId) {
    return this.#transition(this.get(proposalId), "EXECUTED", "executed");
  }

  list(state = null) {
    const all = [...this.store.values()];
    return state ? all.filter((p) => p.state === state) : all;
  }
}