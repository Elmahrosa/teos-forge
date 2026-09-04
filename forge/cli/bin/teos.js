#!/usr/bin/env node
import { run } from "../src/index.js";

run(process.argv)
  .then((out) => console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2)))
  .catch((err) => {
    const msg = err?.message || String(err);
    console.error(msg);
    process.exit(1);
  });
