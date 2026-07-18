// Electron main process. Embeds the Next.js standalone server (see next.config.ts's
// `output: "standalone"` and the build step in package.json's `electron:build`) and points it at
// a per-user SQLite database instead of the server-deployment Postgres path — see
// prisma/schema.sqlite.prisma and src/lib/db.ts for the DB_PROVIDER split this relies on.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { spawn } = require("child_process");
const Database = require("better-sqlite3");

// Set from code rather than relying on CLI flags — more portable across the varied (often
// container/CI/WSL) environments this gets tested and packaged in. disable-dev-shm-usage works
// around a shared-memory crash seen under WSLg where /dev/shm is present and correctly permissioned
// but Chromium's renderer still fails to create shared memory segments there.
if (process.env.MYNAB_NO_SANDBOX === "1") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.disableHardwareAcceleration();
}

let serverProcess = null;
let mainWindow = null;

// Packaged: resources/app.asar.unpacked or resources/app (per electron-builder config below).
// Dev (electron .): repo root.
const appRoot = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // server not up yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
}

// Applies prisma/migrations-sqlite/*/migration.sql in order against a brand-new database file,
// tracked in a small bookkeeping table. Deliberately not `prisma migrate deploy` — that would
// require bundling Prisma's migration engine binary into the packaged app for a single first-run
// step; running the same SQL files directly with better-sqlite3 (already a dependency for the
// app itself) avoids that entirely.
function runMigrations(dbPath, migrationsDir) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(
    `CREATE TABLE IF NOT EXISTS "_app_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  const applied = new Set(db.prepare(`SELECT name FROM "_app_migrations"`).all().map((r) => r.name));

  const migrationNames = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const name of migrationNames) {
    if (applied.has(name)) continue;
    const sqlPath = path.join(migrationsDir, name, "migration.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    db.exec(sql);
    db.prepare(`INSERT INTO "_app_migrations" (name) VALUES (?)`).run(name);
  }

  db.close();
}

async function startServer() {
  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "mynab.db");

  if (!fs.existsSync(dbPath)) {
    const migrationsDir = path.join(appRoot, "prisma", "migrations-sqlite");
    runMigrations(dbPath, migrationsDir);
  }

  const port = await findFreePort();
  const serverEntry = path.join(appRoot, ".next", "standalone", "server.js");

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: path.join(appRoot, ".next", "standalone"),
    env: {
      ...process.env,
      // Without this, spawning the packaged Electron binary itself (process.execPath) would try
      // to launch another copy of the app's GUI instead of running server.js as plain Node.
      ELECTRON_RUN_AS_NODE: "1",
      DB_PROVIDER: "sqlite",
      DATABASE_URL: `file:${dbPath}`,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });

  await waitForServer(`http://127.0.0.1:${port}/`);
  return port;
}

console.log("[mynab] app starting, isPackaged =", app.isPackaged, "appRoot =", appRoot);

app.whenReady().then(async () => {
  console.log("[mynab] app ready, starting embedded server...");
  const port = await startServer();
  console.log("[mynab] server ready on port", port, "- opening window");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.webContents.on("did-finish-load", () => console.log("[mynab] window finished loading"));
  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => console.error("[mynab] window failed to load:", code, desc));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = new BrowserWindow({ width: 1280, height: 900, autoHideMenuBar: true });
      mainWindow.loadURL(`http://127.0.0.1:${port}`);
    }
  });
}).catch((err) => {
  console.error("[mynab] fatal startup error:", err);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
