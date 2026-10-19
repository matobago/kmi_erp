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
  if (!Array.isArray(state.specialTasks)) {
    throw new Error("specialTasks must be an array");
  }
}

function migrateChangeOrderJobs(state) {
  const kept = [];
  const migrated = [];
  let nextId = 0;
  (state.specialTasks || []).forEach((task) => {
    const id = Number(task.id);
    if (id > nextId) nextId = id;
  });

  (state.jobs || []).forEach((job) => {
    if (!/change\s*orders?/i.test(job.name || "")) {
      kept.push(job);
      return;
    }
    (job.tasks || []).forEach((task) => {
      nextId += 1;
      migrated.push({
        id: nextId,
        name: "Change Order",
        color: task.color || "",
        value: task.value != null && task.value !== "" ? Number(task.value) : 0,
        ...(task.start ? { start: task.start } : {}),
        ...(task.end ? { end: task.end } : {}),
      });
    });
    if (Array.isArray(state.config.jobOrder)) {
      state.config.jobOrder = state.config.jobOrder.filter(
        (id) => Number(id) !== Number(job.id)
      );
    }
  });

  state.jobs = kept;
  state.specialTasks = [...(state.specialTasks || []), ...migrated];
  return migrated.length;
}

async function pullProduction() {
  const [config, colors, jobs, specialTasksRes] = await Promise.all([
    fetchJson("config"),
    fetchJson("colors"),
    fetchJson("jobs"),
    fetch(`${baseUrl}/specialTasks`).then(async (response) => {
      if (response.status === 404) return [];
      if (!response.ok) {
        throw new Error(`specialTasks returned ${response.status}`);
      }
      return response.json();
    }),
  ]);
  const specialTasks = Array.isArray(specialTasksRes) ? specialTasksRes : [];
  const state = { config, colors, jobs, specialTasks };
  assertState(state);
  const migrated = migrateChangeOrderJobs(state);

  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, dbFile);

  const tasks = state.jobs.reduce(
    (count, job) => count + (job.tasks || []).length,
    0
  );
  console.log(`Wrote ${dbFile}`);
  console.log(
    `  ${state.jobs.length} jobs, ${tasks} tasks, ${state.specialTasks.length} special tasks, ${colors.length} colors`
  );
  if (migrated) {
    console.log(`  migrated ${migrated} Change Order job task(s) → specialTasks`);
  }
  console.log(`  source ${baseUrl}`);
}

pullProduction().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
