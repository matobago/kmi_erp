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
      "POST /jobs": "Create a job",
      "PUT /jobs/:id": "Replace one job (including its tasks)",
      "PATCH /jobs/:id": "Partial-update one job",
      "DELETE /jobs/:id": "Delete one job",
      "PUT /jobs": "Replace the entire jobs array (AI bulk update)",
      "GET /colors": "Legend: id, display name, hex",
      "GET /colors/:id": "One color (id is navy, steel, coral, gold, purple, gray, green)",
      "POST /colors": "Add a color { id, name, hex, textHex }",
      "PUT /colors/:id": "Replace one color",
      "PATCH /colors/:id": "Partial-update one color",
      "DELETE /colors/:id": "Delete one color",
      "PUT /colors": "Replace the entire colors array",
    },
    color: {
      id: "navy | steel | coral | gold | purple | gray | green",
      name: "legend label, e.g. Drywall - Hang",
      hex: "#35507f",
      textHex: "#ffffff",
    },
    job: {
      name: "string",
      tasks: [
        {
          name: "string",
          start: "YYYY-MM-DD",
          end: "YYYY-MM-DD",
          color: "id from /colors",
          value: "number (contract dollars)",
        },
      ],
    },
  });
});

function normalizeJobs(body) {
  const jobs = Array.isArray(body) ? body : body && body.jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.map((job, i) => ({
    ...job,
    id: job.id != null ? Number(job.id) : i + 1,
    name: job.name || "",
    tasks: (job.tasks || []).map((task, j) => ({
      ...task,
      id: task.id != null ? Number(task.id) : j + 1,
    })),
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
