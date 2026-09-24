const path = require("path");
const jsonServer = require("json-server");

const dbFile = path.join(__dirname, "db.json");
const server = jsonServer.create();
const router = jsonServer.router(dbFile);
const middlewares = jsonServer.defaults({
  static: path.join(__dirname, "public"),
});

server.use(middlewares);
server.use(jsonServer.bodyParser);

server.get("/api", (_req, res) => {
  res.json({
    name: "KMI Billing Forecast API",
    database: "db.json",
    resources: {
      "GET /config": "Timeline window and cost rates",
      "PUT /config": "Replace config",
      "PATCH /config": "Update fields: timelineStart, timelineEnd, actualCostRate, kmiCostRate",
      "GET /jobs": "All jobs with nested tasks",
      "GET /jobs/:id": "One job",
      "POST /jobs": "Create a job { name, tasks[] }; assigns job and nested task ids",
      "POST /jobs/:id/tasks": "Append tasks to a job { tasks[] }; assigns nested task ids",
      "PUT /jobs/:id": "Replace one job (including its tasks)",
      "PATCH /jobs/:id": "Partial-update one job",
      "DELETE /jobs/:id": "Delete one job",
      "PUT /jobs": "Replace the entire jobs array (AI bulk update)",
      "GET /colors": "Legend: id, display name, hex",
      "GET /colors/:id": "One color (id is navy, steel, coral, gold, purple, gray)",
      "POST /colors": "Add a color { id, name, hex, textHex }",
      "PUT /colors/:id": "Replace one color",
      "PATCH /colors/:id": "Partial-update one color",
      "DELETE /colors/:id": "Delete one color",
      "PUT /colors": "Replace the entire colors array",
    },
    color: {
      id: "navy | steel | coral | gold | purple | gray",
      name: "legend label, e.g. Drywall - Hang",
      hex: "#35507f",
      textHex: "#ffffff",
    },
    job: {
      name: "string",
      tasks: [
        {
          name: "string",
          start: "YYYY-MM-DD (optional until timing assigned)",
          end: "YYYY-MM-DD (optional until timing assigned)",
          color: "id from /colors",
          value: "number (contract dollars)",
        },
      ],
    },
  });
});

function nextJobId(jobs) {
  let max = 0;
  jobs.forEach((job) => {
    const id = Number(job.id);
    if (id > max) max = id;
  });
  return max + 1;
}

function normalizeTask(task, j) {
  const normalized = {
    id: task.id != null ? Number(task.id) : j + 1,
    name: task.name || "",
    color: task.color || "",
    value: task.value != null && task.value !== "" ? Number(task.value) : 0,
  };
  if (task.start) normalized.start = task.start;
  if (task.end) normalized.end = task.end;
  return normalized;
}

function normalizeJobs(body) {
  const jobs = Array.isArray(body) ? body : body && body.jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.map((job, i) => ({
    ...job,
    id: job.id != null ? Number(job.id) : i + 1,
    name: job.name || "",
    tasks: (job.tasks || []).map((task, j) => normalizeTask(task, j)),
  }));
}

function normalizeColors(body) {
  const colors = Array.isArray(body) ? body : body && body.colors;
  if (!Array.isArray(colors)) return null;
  return colors.map((color) => ({
    ...color,
    id: color.id,
    name: color.name || "",
    hex: color.hex || "#35507f",
    textHex: color.textHex || "#ffffff",
  }));
}

server.put("/colors", (req, res) => {
  const colors = normalizeColors(req.body);
  if (!colors) {
    return res.status(400).json({
      error: "Send a JSON array of colors, or { colors: [...] }",
    });
  }
  router.db.set("colors", colors).write();
  res.json(router.db.get("colors").value());
});

server.put("/jobs", (req, res) => {
  const jobs = normalizeJobs(req.body);
  if (!jobs) {
    return res.status(400).json({
      error: "Send a JSON array of jobs, or { jobs: [...] }",
    });
  }
  router.db.set("jobs", jobs).write();
  res.json(router.db.get("jobs").value());
});

server.post("/jobs", (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ error: "Job name is required" });
  }
  const tasksIn = Array.isArray(body.tasks) ? body.tasks : [];
  if (!tasksIn.length) {
    return res.status(400).json({ error: "At least one task is required" });
  }
  const jobs = router.db.get("jobs").value() || [];
  const job = {
    id: nextJobId(jobs),
    name,
    tasks: tasksIn.map((task, j) => normalizeTask(task, j)),
  };
  router.db.get("jobs").push(job).write();
  res.status(201).json(job);
});

server.post("/jobs/:id/tasks", (req, res) => {
  const id = Number(req.params.id);
  const job = router.db.get("jobs").find({ id }).value();
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  const body = req.body || {};
  const tasksIn = Array.isArray(body.tasks) ? body.tasks : [];
  if (!tasksIn.length) {
    return res.status(400).json({ error: "At least one task is required" });
  }
  let nextId = 0;
  (job.tasks || []).forEach((task) => {
    const tid = Number(task.id);
    if (tid > nextId) nextId = tid;
  });
  const added = tasksIn.map((task, j) =>
    normalizeTask({ ...task, id: nextId + j + 1 }, j)
  );
  const updated = {
    ...job,
    tasks: [...(job.tasks || []), ...added],
  };
  router.db.get("jobs").find({ id }).assign(updated).write();
  res.status(201).json(updated);
});

server.use(router);

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log("KMI Billing Forecast");
  console.log("  chart  http://localhost:" + port + "/");
  console.log("  api    http://localhost:" + port + "/api");
  console.log("  jobs   http://localhost:" + port + "/jobs");
  console.log("  colors http://localhost:" + port + "/colors");
  console.log("  config http://localhost:" + port + "/config");
});
