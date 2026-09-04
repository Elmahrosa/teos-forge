// forge/src/audit.js
// Audit Engine — immutable audit logging with cryptographic hashing and chaining.

import { createHash, randomUUID } from "node:crypto";

const GENESIS_PREV_HASH = "0".repeat(64);

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function canonicalize(entry) {
  return JSON.stringify({
    seq: entry.seq,
    ts: entry.ts,
    event: entry.event,
    ref: entry.ref,
    actor: entry.actor,
    data: entry.data,
    prevHash: entry.prevHash,
  });
}

export class AuditLog {
  constructor({ entries = [], verifyOnLoad = true } = {}) {
    if (verifyOnLoad && entries.length > 0) {
      const restored = AuditLog.verify(entries);
      if (!restored.valid && restored.tampered.length > 0) {
        throw new Error(
          `AuditLog: cannot load tampered chain (${restored.tampered.length} tampered entries)`
        );
      }
      this.entries = restored.entries;
    } else {
      this.entries = entries.map((e) => ({ ...e }));
    }
  }

  get length() {
    return this.entries.length;
  }

  append({ event, ref = null, data = null, actor = "system" }) {
    const seq = this.entries.length + 1;
    const prevHash =
      this.entries.length === 0
        ? GENESIS_PREV_HASH
        : this.entries[this.entries.length - 1].hash;

    const entry = {
      seq,
      id: randomUUID(),
      ts: new Date().toISOString(),
      event,
      ref,
      actor,
      data,
      prevHash,
      hash: null,
    };
    entry.hash = sha256(canonicalize(entry));
    this.entries.push(entry);
    return entry;
  }

  tail() {
    return this.entries.length === 0 ? null : this.entries[this.entries.length - 1];
  }

  verify() {
    return AuditLog.verify(this.entries);
  }

  static verify(entries) {
    const validated = [];
    const tampered = [];
    let previous = { seq: 0, hash: GENESIS_PREV_HASH };

    for (const entry of entries) {
      const recomputed = sha256(canonicalize(entry));
      let broken = false;
      if (entry.seq !== previous.seq + 1) broken = true;
      if (entry.prevHash !== previous.hash) broken = true;
      if (entry.hash !== recomputed) broken = true;
      if (broken) {
        tampered.push({ seq: entry.seq, id: entry.id });
      }
      validated.push(entry);
      previous = entry;
    }

    return { valid: tampered.length === 0, entries: validated, tampered };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.entries));
  }

  static fromSeed(seedFn, count) {
    const log = new AuditLog({ verifyOnLoad: false });
    for (let i = 1; i <= count; i += 1) {
      log.append(seedFn(i));
    }
    return log;
  }
}

export { sha256, canonicalize, GENESIS_PREV_HASH };