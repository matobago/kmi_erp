const path = require("path");
const jsonServer = require("json-server");
const {
  useRedis,
  dbFile,
  loadSeed,
  loadState,
  saveState,
} = require("./store");

const server = jsonServer.create();
const router = useRedis
  ? jsonServer.router(loadSeed())
  : jsonServer.router(dbFile);
const middlewares = jsonServer.defaults({
  static: path.join(__dirname, "public"),
});

const mutating = new Set(["POST", "PUT", "PATCH", "DELETE"]);

server.use(middlewares);
server.use(jsonServer.bodyParser);

function ensureStateShape(state) {
  if (!state || typeof state !== "object") return state;
  if (!Array.isArray(state.specialTasks)) state.specialTasks = [];
  return state;
}

if (useRedis) {
  server.use(async (req, res, next) => {
    try {
      const state = ensureStateShape(await loadState());
      router.db.setState(state);
    } catch (err) {
      return res.status(503).json({
        error: "Database unavailable",
        detail: err.message,
      });
    }

    if (!mutating.has(req.method)) return next();

    const sendJson = res.json.bind(res);
    const sendJsonp = res.jsonp.bind(res);

    async function persistThen(send, body) {
      if (res.statusCode < 400) {
        try {
          await saveState(router.db.getState());
        } catch (err) {
          return sendJson({
            error: "Failed to persist database",
            detail: err.message,
          });
        }
      }
      return send(body);
    }

    res.json = (body) => persistThen(sendJson, body);
    res.jsonp = (body) => persistThen(sendJsonp, body);
    next();
  });
}

server.get("/api", (_req, res) => {
  res.json({
    name: "KMI Billing Forecast API",
    database: useRedis ? "upstash-redis" : "db.json",
    resources: {
      "GET /config": "Timeline window and cost rates",
      "PUT /config": "Replace config",
      "PATCH /config": "Update fields: timelineStart, timelineEnd, actualCostRate, kmiCostRate, crewLaborCost, crewDaysPerPeriod, actualBilling",
      "GET /jobs": "All jobs with nested tasks",
      "GET /jobs/:id": "One job",
      "POST /jobs": "Create a job { name, tasks[] }; assigns job and nested task ids",
      "POST /jobs/:id/tasks": "Append tasks to a job { tasks[] }; assigns nested task ids",
      "PUT /jobs/:id": "Replace one job (including its tasks)",
      "PATCH /jobs/:id": "Partial-update one job",
      "DELETE /jobs/:id": "Delete one job",
      "PUT /jobs": "Replace the entire jobs array (AI bulk update)",
      "GET /specialTasks": "Orphan Change Order tasks (no job parent)",
      "GET /specialTasks/:id": "One special task",
      "POST /specialTasks": "Create a Change Order { color, value, start?, end? }",
      "PUT /specialTasks/:id": "Replace one special task",
      "PATCH /specialTasks/:id": "Partial-update one special task",
      "DELETE /specialTasks/:id": "Delete one special task",
      "PUT /specialTasks": "Replace the entire specialTasks array",
      "GET /colors": "Legend: id, display name, hex",
      "GET /colors/:id": "One color (id is navy, steel, coral, gold, purple, gray, plaster, shower, ballistic, mineral, sheathing, rainscreen, samples)",
      "POST /colors": "Add a color { id, name, hex, textHex }",
      "PUT /colors/:id": "Replace one color",
      "PATCH /colors/:id": "Partial-update one color",
      "DELETE /colors/:id": "Delete one color",
      "PUT /colors": "Replace the entire colors array",
    },
    color: {
      id: "navy | steel | coral | gold | purple | gray | plaster | shower | ballistic | mineral | sheathing | rainscreen | samples",
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
    specialTask: {
      name: "always Change Order",
      start: "YYYY-MM-DD (optional until timing assigned)",
      end: "YYYY-MM-DD (optional until timing assigned)",
      color: "id from /colors",
      value: "number (contract dollars)",
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

function nextSpecialTaskId(tasks) {
  let max = 0;
  tasks.forEach((task) => {
    const id = Number(task.id);
    if (id > max) max = id;
  });
  return max + 1;
}

function normalizeSpecialTask(task, j) {
  const normalized = normalizeTask(task, j);
  normalized.name = "Change Order";
  return normalized;
}

function normalizeSpecialTasks(body) {
  const tasks = Array.isArray(body) ? body : body && body.specialTasks;
  if (!Array.isArray(tasks)) return null;
  return tasks.map((task, j) => normalizeSpecialTask(task, j));
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

server.put("/specialTasks", (req, res) => {
  const tasks = normalizeSpecialTasks(req.body);
  if (!tasks) {
    return res.status(400).json({
      error: "Send a JSON array of special tasks, or { specialTasks: [...] }",
    });
  }
  router.db.set("specialTasks", tasks).write();
  res.json(router.db.get("specialTasks").value());
});

server.post("/specialTasks", (req, res) => {
  const body = req.body || {};
  const tasks = router.db.get("specialTasks").value() || [];
  const task = normalizeSpecialTask(
    { ...body, id: nextSpecialTaskId(tasks) },
    0
  );
  router.db.get("specialTasks").push(task).write();
  res.status(201).json(task);
});

server.put("/specialTasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = router.db.get("specialTasks").find({ id }).value();
  if (!existing) {
    return res.status(404).json({ error: "Special task not found" });
  }
  const task = normalizeSpecialTask({ ...req.body, id }, 0);
  router.db.get("specialTasks").find({ id }).assign(task).write();
  res.json(task);
});

server.patch("/specialTasks/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = router.db.get("specialTasks").find({ id }).value();
  if (!existing) {
    return res.status(404).json({ error: "Special task not found" });
  }
  const task = normalizeSpecialTask({ ...existing, ...req.body, id }, 0);
  router.db.get("specialTasks").find({ id }).assign(task).write();
  res.json(task);
});

server.use(router);

module.exports = server;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, "0.0.0.0", () => {
    console.log("KMI Billing Forecast");
    console.log("  database " + (useRedis ? "upstash-redis" : dbFile));
    console.log("  chart  http://localhost:" + port + "/");
    console.log("  api    http://localhost:" + port + "/api");
    console.log("  jobs   http://localhost:" + port + "/jobs");
    console.log("  specialTasks http://localhost:" + port + "/specialTasks");
    console.log("  colors http://localhost:" + port + "/colors");
    console.log("  config http://localhost:" + port + "/config");
  });
}
