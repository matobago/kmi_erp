const fs = require("fs");
const path = require("path");

const baseUrl = (process.env.KMI_API_URL || "https://kmi-erp.vercel.app").replace(
  /\/$/,
  ""
);
const dbFile = path.join(__dirname, "..", "db.json");

async function fetchJson(resource) {
  const response = await fetch(`${baseUrl}/${resource}`);
  if (!response.ok) {
    throw new Error(`${resource} returned ${response.status}`);
  }
  return response.json();
}

function assertState(state) {
  if (!state.config || Array.isArray(state.config)) {
    throw new Error("config must be an object");
  }
  if (!Array.isArray(state.colors) || !Array.isArray(state.jobs)) {
    throw new Error("colors and jobs must be arrays");
  }
}

async function pullProduction() {
  const [config, colors, jobs] = await Promise.all([
    fetchJson("config"),
    fetchJson("colors"),
    fetchJson("jobs"),
  ]);
  const state = { config, colors, jobs };
  assertState(state);

  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, dbFile);

  const tasks = jobs.reduce((count, job) => count + (job.tasks || []).length, 0);
  console.log(`Wrote ${dbFile}`);
  console.log(`  ${jobs.length} jobs, ${tasks} tasks, ${colors.length} colors`);
  console.log(`  source ${baseUrl}`);
}

pullProduction().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
