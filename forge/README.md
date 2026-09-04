# TEOS Forge — Governance Engines (Blocker 2)

Governance infrastructure for the TEOS Forge stewardship layer.

**Principle:** Law authorizes → Governance ratifies → Policy enforces → Code executes. Nothing more.

## Engines

| Engine | File | Responsibility |
| --- | --- | --- |
| Audit | `forge/src/audit.js` | Immutable audit log with SHA-256 hashing and chaining; tamper-evidence verification |
| Council | `forge/src/council.js` | Load councils from YAML; membership, quorum, and proposal-scope checks |
| Proposal | `forge/src/proposal.js` | Lifecycle: DRAFT → SUBMITTED → VALIDATION → COUNCIL_REVIEW → RATIFIED/REJECTED → DEPLOYMENT_READY → EXECUTED |
| Ratification | `forge/src/ratification.js` | Vote recording, quorum enforcement, majority, duplicate-vote protection, audit integration |

## Lifecycle

```
DRAFT → SUBMITTED → VALIDATION → COUNCIL_REVIEW → RATIFIED → DEPLOYMENT_READY → EXECUTED
                              ↘ REJECTED (terminal)
```

`REJECTED` is structurally terminal: no transition from `REJECTED` can reach
`DEPLOYMENT_READY` or `EXECUTED`.

## Councils

Five councils are defined in `forge/councils/*.yaml`:

- `governance` — governance, membership, lifecycle
- `compliance` — compliance, regulatory, institutional
- `audit` — audit, security, release, forensic
- `treasury` — treasury, emission, token, mining, value-flow
- `technical` — code, tooling, protocol, deployment

**All councils have zero members.** Per the governance-first and audit-first
approach, no identities are invented or assumed. Membership becomes effective
only through ratified onboarding proposals following the legitimate governance
process. Quorum is therefore `0`, no votes are possible, and the production
gate returns `BLOCKED` until councils are legitimately populated.

## Usage

```bash
cd forge
npm install
npm test              # node --test (26 tests)

node cli/bin/teos.js status      # governance status + production gate
node cli/bin/teos.js councils    # list councils
node cli/bin/teos.js council governance
node cli/bin/teos.js verify      # verify audit chain integrity
```

## Status

```
Production gate: BLOCKED (fail-closed)
Councils populated: 0/5
Proposals: 0 | Ratified: 0
Mining deployment: NONE
ERT emissions: NOT ACTIVE
```