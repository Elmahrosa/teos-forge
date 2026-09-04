// forge/src/index.js
// TEOS Forge engines entry point — council, proposal lifecycle, ratification,
// and audit chain. Also exposes a lightweight CLI (`teos`).

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AuditLog } from "./audit.js";
import { CouncilRegistry } from "./council.js";
import { ProposalEngine } from "./proposal.js";
import { RatificationEngine } from "./ratification.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_COUNCIL_DIR = join(HERE, "..", "councils");

export function createForge({
  councilDir = DEFAULT_COUNCIL_DIR,
  auditEntries = [],
} = {}) {
  const councilRegistry = CouncilRegistry.fromYamlDirectory(councilDir);
  const auditLog = new AuditLog({ entries: auditEntries });
  const proposalEngine = new ProposalEngine();
  const ratificationEngine = new RatificationEngine({ councilRegistry, auditLog });
  return { councilRegistry, auditLog, proposalEngine, ratificationEngine };
}

function councilsToList(reg) {
  return reg.list();
}

function auditToLog(auditLog) {
  return auditLog.entries.map((e) => ({
    seq: e.seq,
    event: e.event,
    ref: e.ref,
    actor: e.actor,
    hash: e.hash,
  }));
}

function usage() {
  return [
    "TEOS Forge governance CLI",
    "",
    "Usage:",
    "  teos councils                          list councils",
    "  teos council <id>                      show a council (members/quorum/scope)",
    "  teos audit                             show audit log",
    "  teos verify                            verify audit chain integrity",
    "  teos proposal <id>                     show a proposal state",
    "  teos status                            summary of governance status",
  ].join("\n");
}

function status({ councilRegistry, proposalEngine }) {
  const councils = councilRegistry.list();
  const proposals = proposalEngine.list();
  const populated = councils.filter((c) => c.memberCount > 0).length;
  const ratified = proposals.filter((p) => p.state === "RATIFIED").length;
  const active = proposals.filter((p) =>
    ["DEPLOYMENT_READY", "EXECUTED"].includes(p.state)
  ).length;

  const gateBlocked =
    populated < councils.length ||
    ratified === 0 ||
    councilRegistry.list().every((c) => c.memberCount === 0);

  return JSON.stringify(
    {
      councils: councils.map((c) => ({
        id: c.id,
        members: `${c.memberCount}`,
        quorum: councilRegistry.quorum(c.id),
      })),
      proposals: proposals.length,
      ratified,
      populationRequired: `${populated}/${councils.length} councils populated`,
      production_gate: gateBlocked ? "BLOCKED" : "READY",
      principle: "Law authorizes → Governance ratifies → Policy enforces → Code executes",
    },
    null,
    2
  );
}

async function run(argv) {
  const forge = createForge();
  const [cmd, arg] = argv.slice(2);

  switch (cmd) {
    case "councils":
      return JSON.stringify(councilsToList(forge.councilRegistry), null, 2);
    case "council": {
      if (!arg) return usage();
      const c = forge.councilRegistry.get(arg);
      return JSON.stringify(
        { ...c, members: c.members.map((m) => m.id) },
        null,
        2
      );
    }
    case "audit":
      return JSON.stringify(auditToLog(forge.auditLog), null, 2);
    case "verify": {
      const result = forge.auditLog.verify();
      return JSON.stringify(
        { valid: result.valid, entries: forge.auditLog.length, tampered: result.tampered },
        null,
        2
      );
    }
    case "proposal": {
      if (!arg) return usage();
      return JSON.stringify(forge.proposalEngine.get(arg).snapshot(), null, 2);
    }
    case "status":
      return status(forge);
    default:
      return usage();
  }
}

export { run, AuditLog, CouncilRegistry, ProposalEngine, RatificationEngine };