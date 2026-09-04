# AUDIT_INDEX.md — Audit Evidence Index

Single entry point for reviewers of the **verified, live evidence set** on
`origin/main`. Every entry below exists in the canonical repository at commit
`cb913c3`; nothing is fabricated or aspirational.

**Operating principle:** Law authorizes → Governance ratifies → Policy
enforces → Code executes. Nothing more.

**Current live status (verified via `teos.js status`):** engines implemented
(Blocker 2), `production_gate: BLOCKED`, councils populated `0/5`, proposals
`0`. This is the intended, fail-closed state.

---

## 1. Anchor documents

| Path | What it establishes |
| --- | --- |
| `REPO_LOCK.md` | Governance standards lock; execution explicitly prohibited |
| `README.md` | Repository role: sovereign DPI standards & tooling layer |
| `LICENSE` / `NOTICE.md` | TESL source-available terms |
| `PUBLIC_REVIEW.md` | Public review process for this repository |

## 2. Governance documentation

| Path | What it establishes |
| --- | --- |
| `docs/governance.md` | Authority chain (ICBC → Forge → Governance → Core) |
| `docs/governance-lifecycle.md` | Proposal lifecycle and institutional flow |
| `docs/governance-ministry.md` | Governance discipline roles |
| `docs/audit-events-rejected-proposal.md` | **Actual** audit trail for rejected proposals (this correction) |

## 3. Live engine evidence (Blocker 2, `forge/`)

| Path | Part it proves |
| --- | --- |
| `forge/src/audit.js` | SHA-256 chained append-only log; tamper detection |
| `forge/src/council.js` | Council registry; verified membership; quorum; majority scope |
| `forge/src/proposal.js` | Lifecycle + transition table; `REJECTED` terminal |
| `forge/src/ratification.js` | Vote validation, duplicate protection, quorum, decision |
| `forge/src/index.js` | Wiring + async CLI runner; `createForge` |
| `forge/councils/*.yaml` | Five real councils, all `members: []` (no invented identities) |
| `forge/test/` | 26 tests passing; includes tamper-detection and `REJECTED`-terminal cases |
| `forge/cli/bin/teos.js` | `status` / `verify` CLI reflecting live engine state |

## 4. Audit module (repository-level evidence policy)

| Path | What it establishes |
| --- | --- |
| `audit/README.md` | Audit module purpose and scope |
| `audit/compliance.md` | Audit-readiness checklist |
| `audit/logs.md` | Log format, content, and retention policy |

## 5. Release record

| Path | What it establishes |
| --- | --- |
| `docs/release-notes/v0.1.0.md` | Recorded release scope |

---

## 6. How to verify

Every command below is a **real** subcommand of the live CLI
(`forge/src/index.js` `run()`). Run from `forge/`.

```bash
# 1. Engine correctness: all tests pass
node --test "test/*.test.js"        # 26 tests, all pass

# 2. Governance status summary (gate MUST be BLOCKED)
node cli/bin/teos.js status         # production_gate: BLOCKED, councils 0/5

# 3. All five councils, members []
node cli/bin/teos.js councils

# 4. A single council (members/quorum/scope)
node cli/bin/teos.js council technical

# 5. Full audit log (empty chain — 0 entries)
node cli/bin/teos.js audit

# 6. Audit chain integrity + entry count
node cli/bin/teos.js verify         # { valid: true, entries: 0, tampered: [] }

# 7. A proposal by id (only existing ids; there is no create subcommand)
node cli/bin/teos.js proposal <id>
```

> **Do not run or document these — they are NOT part of this CLI** and only
> exist in a divergent, never-pushed checkout:
> `council:list`, `proposal:list`, `proposal:create`, `audit:verify`,
> `audit:tail`, `audit:hash`. The real subcommands are `councils`,
> `council <id>`, `audit`, `verify`, `proposal <id>`, `status`. Proposals are
> created via the engine API (`ProposalEngine.create`), not a CLI command.

---

## 7. Explicitly NOT in this index

These files exist only in a divergent local checkout and were **never pushed**;
they are not evidence and must not be referenced as canonical:

- `TEOS_PHASE1_LOCKED.md`
- `TEOS_FORGE_PHASE1_AUDIT.md`, `TEOS_FORGE_PHASE1_COMPLETION.md`
- `ERT_MINING_POLICY_PROPOSAL.md`, `ERT_ONCHAIN_FACTS.md`
- `IMPLEMENTATION_SUMMARY.md` (divergent-copy variant)
- Any event names such as `VOTE_REJECTED` / `PROPOSAL_REJECTED`
- CLI subcommands `council:list`, `proposal:list`, `proposal:create`,
  `audit:verify`, `audit:tail`, `audit:hash` (they do not exist in this CLI)

"Phase 1 locked" status is **not** asserted. The evidence index records what the
repo proves today; council population and any claim of phase completion remain
future, governance-ratified events.

---
*Index reflects `origin/main` (`cb913c3` engines, docs through `4286679`).*