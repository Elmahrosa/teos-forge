// forge/src/council.js
// Council Engine — load council configurations (YAML), check membership,
// compute quorum, and determine proposal scope.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const REQUIRED_FIELDS = ["id", "name", "members"];

export class CouncilError extends Error {
  constructor(message, code = "COUNCIL_ERROR") {
    super(message);
    this.code = code;
  }
}

function validateCouncil(raw, source) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in raw)) {
      throw new CouncilError(
        `Council ${raw.id ?? source} is missing required field "${field}"`,
        "COUNCIL_SCHEMA"
      );
    }
  }
  if (!Array.isArray(raw.members)) {
    throw new CouncilError(
      `Council "${raw.id}" has invalid members (must be a list)`,
      "COUNCIL_SCHEMA"
    );
  }
  const filtered = raw.members.filter(
    (m) => typeof m === "object" && m !== null && typeof m.id === "string"
  );
  const seen = new Set();
  for (const m of filtered) {
    if (seen.has(m.id)) {
      throw new CouncilError(`Council "${raw.id}" has duplicate member "${m.id}"`);
    }
    if (m.verified === false) {
      throw new CouncilError(
        `Council "${raw.id}" references unverified member "${m.id}" — not permitted`,
        "COUNCIL_MEMBER_UNVERIFIED"
      );
    }
    seen.add(m.id);
  }
  return filtered;
}

export class CouncilRegistry {
  constructor(councils) {
    this.councils = new Map();
    for (const council of councils) {
      this.councils.set(council.id, council);
    }
  }

  static fromYamlDirectory(dirPath) {
    const councilFiles = readdirSync(dirPath)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .map((f) => join(dirPath, f))
      .filter((f) => statSync(f).isFile());

    const councils = councilFiles.map((file) => {
      const raw = parse(readFileSync(file, "utf8"));
      const normalized = validateCouncil(raw, file);
      return {
        id: raw.id,
        name: raw.name,
        description: raw.description ?? "",
        quorum_ratio: raw.quorum_ratio ?? 0.5,
        quorum_votes: raw.quorum_votes ?? null,
        majority: raw.majority ?? "simple",
        scope: Array.isArray(raw.scope) ? raw.scope : [],
        members: normalized,
        source: file,
      };
    });

    return new CouncilRegistry(councils);
  }

  list() {
    return [...this.councils.values()].map((c) => ({
      id: c.id,
      name: c.name,
      scope: c.scope,
      memberCount: c.members.length,
      quorumRatio: c.quorum_ratio,
      majority: c.majority,
    }));
  }

  get(councilId) {
    const council = this.councils.get(councilId);
    if (!council) {
      throw new CouncilError(`Unknown council "${councilId}"`, "COUNCIL_NOT_FOUND");
    }
    return council;
  }

  isMember(councilId, memberId) {
    return this.get(councilId).members.some((m) => m.id === memberId);
  }

  memberProfile(councilId, memberId) {
    const council = this.get(councilId);
    const member = council.members.find((m) => m.id === memberId);
    return member ?? null;
  }

  quorum(councilId) {
    const council = this.get(councilId);
    if (council.quorum_votes != null) {
      return Math.min(council.quorum_votes, council.members.length);
    }
    return Math.ceil(council.members.length * council.quorum_ratio);
  }

  quorumMet(councilId, votesCast) {
    return votesCast >= this.quorum(councilId);
  }

  inScope(councilId, proposalType) {
    const council = this.get(councilId);
    if (council.scope.length === 0) return true;
    return council.scope.includes(proposalType);
  }
}

export function createDefaultRegistry(dirPath) {
  return CouncilRegistry.fromYamlDirectory(dirPath);
}