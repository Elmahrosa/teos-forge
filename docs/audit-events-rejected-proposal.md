# Audit Trail for Rejected Proposals

This document describes, using the **live TEOS Forge engines on `origin/main`
(Blocker 2, commit `c92ad2b`)**, exactly what audit evidence a rejected
proposal leaves behind. It corrects an earlier draft that described a
divergent engine (events `VOTE_REJECTED` / `PROPOSAL_REJECTED`, councils
`validator|oracle|incident-response|treasury|compliance`). That engine is **not**
part of this repository and the event names do not exist here.

Source files: `forge/src/audit.js`, `forge/src/proposal.js`,
`forge/src/ratification.js`, `forge/src/council.js`.

---

## 1. Two distinct records must not be confused

| Record | What it holds | Where |
| --- | --- | --- |
| `AuditLog` | Immutable, SHA-256 chained entries (`forge/src/audit.js`) | `AuditLog` instance |
| `proposal.history` | Transition events of one proposal (`pushEvent`) | `Proposal#history` |

A rejected proposal writes evidence to **both**.

---

## 2. Rejection paths

A proposal reaches the terminal state `REJECTED` through one of two paths:

### 2.1 Validation rejection (`VALIDATION → REJECTED`)

`ProposalEngine.invalidate(proposalId, reason)`:

- Throws if no `reason` is provided (`PROPOSAL_SCHEMA`).
- Records in `proposal.history`: `validation_rejected` with `{ reason }`.
- No `AuditLog` entry is written by this call; the auditable trail is the
  proposal history plus any entries the integrator appends.

### 2.2 Council rejection (`COUNCIL_REVIEW → REJECTED`)

1. Votes are recorded per member.
2. `RatificationEngine.decide()` tallies and checks quorum + majority.
3. On failure the engine emits a `rejected` **AuditLog** event and calls
   `ProposalEngine.reject(proposalId, decision)`, which records `rejected`
   in `proposal.history` with the full decision record.

`REJECTED` is structurally terminal: `TRANSITIONS.REJECTED === []` and
`TERMINAL_STATES = ["REJECTED", "EXECUTED"]`, so
`canTransition("REJECTED", "EXECUTED") === false`.

---

## 3. AuditLog events actually emitted

Only the `RatificationEngine` writes to the `AuditLog` (`actor:
"ratification-engine"`). The complete set of events it can emit:

| Event | Emitted when | `data` payload |
| --- | --- | --- |
| `vote_recorded` | Each valid, non-duplicate vote is stored | `{ councilId, memberId, decision }` |
| `vote_tally_published` | `decide()` runs, before the quorum check | `{ councilId, tally, quorum, quorumMet }` |
| `ratified` | Tally meets quorum and the majority rule | `{ tally, quorum, quorumMet, majority }` |
| `rejected` | Tally fails the majority rule (quorum was met) | same decision record |

### Important: what is NOT audited

Failed vote attempts write **nothing** to the `AuditLog`. They throw
`RatificationError` immediately:

- `RATIFICATION_INVALID_DECISION` — decision not in `APPROVE|REJECT|ABSTAIN`
- `RATIFICATION_NOT_A_MEMBER` — member not verified in the council
- `RATIFICATION_DUPLICATE_VOTE` — member already cast a vote

A quorum miss also throws (`RATIFICATION_QUORUM`); the last chain entry left
behind in that case is the `vote_tally_published` event with
`quorumMet: false`. There is **no** `VOTE_REJECTED` event anywhere in this
codebase.

---

## 4. Entry shape and hashing

Each `AuditLog` entry (`forge/src/audit.js`):

```jsonc
{
  "seq": 1,                      // 1-based, sequential
  "id": "<uuid>",                // randomUUID(), NOT part of the hash input
  "ts": "<ISO-8601>",
  "event": "vote_recorded",
  "ref": "<proposalId>",         // proposal reference
  "actor": "ratification-engine",
  "data": { "councilId": "...", "memberId": "...", "decision": "APPROVE" },
  "prevHash": "<sha256 hex of previous entry, or 64 zeros for genesis>",
  "hash": "<sha256 hex of this entry>"
}
```

The hash covers exactly:

```text
sha256( JSON.stringify({ seq, ts, event, ref, actor, data, prevHash }) )
```

`id` and `hash` are excluded from the canonical payload. The genesis entry
uses `prevHash = "0".repeat(64)`.

---

## 5. Worked example — council rejection of a proposal

Proposal `P`, state `COUNCIL_REVIEW`, council `technical`, simple majority.
Members `m1` approves, `m2` rejects, `m3` abstains.

Chain entries (in order):

| # | Event | `data` highlights |
| --- | --- | --- |
| 1 | `created` *(proposal.history only)* | `{ author, type }` |
| 2 | `submitted`, `validation_started`, `council_review_started` *(history only)* | transition events |
| 3 | `vote_recorded` | `{ councilId, memberId: "m1", decision: "APPROVE" }` |
| 4 | `vote_recorded` | `{ councilId, memberId: "m2", decision: "REJECT" }` |
| 5 | `vote_recorded` | `{ councilId, memberId: "m3", decision: "ABSTAIN" }` |
| 6 | `vote_tally_published` | `{ tally: { cast: 3, approve: 1, reject: 1, abstain: 1 }, quorum, quorumMet: true }` |
| 7 | `rejected` | `{ tally, quorum, quorumMet, majority: { outcome: false, detail: "1A / 1R" } }` |

Proposal history also records `rejected` with the same decision record.

**Why it failed:** cast = 3, abstain = 1 → binding = 2; simple majority needs
`approve > reject` → `1 > 1` is false.

---

## 6. Verifying and querying the trail

The `AuditLog` API (**not** `getEntries`/`verifyIntegrity`):

```js
import { AuditLog } from "../src/audit.js";

const log = new AuditLog({ entries }); // throws if truncated/tampered on load

// Full integrity check across the chain
const { valid, tampered } = log.verify();

// Tail entry (last event on the chain)
const last = log.tail();

// Query: filter entries directly (no query API exists)
const forProposal = log.entries.filter((e) => e.ref === proposalId);
const rejections = forProposal.filter((e) => e.event === "rejected");
const votes = forProposal.filter((e) => e.event === "vote_recorded");
```

`AuditLog.verify(entries)` checks, for every entry: `seq` is continuous,
`prevHash` links to the preceding entry's `hash`, and `hash` recomputes to the
canonical payload. Any modification breaks the chain and is reported in
`tampered` with `{ seq, id }`.

---

## 7. Minimum evidence set for any rejected proposal

To claim a rejection is genuine, require **all** of the following:

1. Proposal `history` contains `created … council_review_started` then
   `rejected` (validation path: `validation_rejected` with a non-empty reason).
2. `AuditLog` contains a contiguous `vote_recorded` set whose members all
   validate against `CouncilRegistry.isMember(councilId, memberId)`.
3. `vote_tally_published` shows `quorumMet` and the tally.
4. `rejected` event carries the decision record that failed the majority rule.
5. `log.verify()` returns `valid: true` (no tampered entries).
6. `canTransition("REJECTED", "EXECUTED") === false` — the state is terminal.

---

*Source: live `forge/` engines on `origin/main` (`c92ad2b`). Verification:
`npm test` (26 tests) passes and includes the `REJECTED` terminal-state and
tamper-detection cases.*