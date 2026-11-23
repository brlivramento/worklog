"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = __dirname;
const port = Number(process.env.PORT || 3000);
const dataPath = path.join(root, "data", "data.json");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};
let queue = Promise.resolve();
const keys = [
  "clients",
  "projects",
  "people",
  "tasks",
  "attendance",
  "activity",
  "meetings",
];
const send = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
};
http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api/data") {
      if (req.method === "GET") {
        try {
          send(res, 200, await fs.readFile(dataPath, "utf8"), mime[".json"]);
        } catch (e) {
          send(res, 500, "Unable to read data.json: " + e.message);
        }
        return;
      }
      if (req.method !== "PUT") {
        send(res, 405, "Method not allowed");
        return;
      }
      let body = "";
      try {
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 5_000_000) {
            send(res, 413, "JSON exceeds 5 MB");
            return;
          }
        }
        const parsed = JSON.parse(body);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !keys.every((k) => Array.isArray(parsed[k]))
        ) {
          send(res, 400, "Invalid Worklog JSON");
          return;
        }
        const content = JSON.stringify(parsed, null, 2) + "\n";
        const operation = queue
          .catch(() => {})
          .then(async () => {
            const temp = path.join(
              path.dirname(dataPath),
              `.data-${process.pid}-${Date.now()}.tmp`,
            );

            try {
              await fs.writeFile(temp, content, "utf8");
              await fs.rename(temp, dataPath);
            } finally {
              await fs.rm(temp, { force: true }).catch(() => {});
            }
          });
        queue = operation;
        await operation;
        send(res, 200, "Saved");
      } catch (e) {
        send(res, 500, "Unable to save data.json: " + e.message);
      }
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed");
      return;
    }
    try {
      const relative = decodeURIComponent(
        pathname === "/" ? "/index.html" : pathname,
      );
      const file = path.resolve(root, "." + relative);
      if (
        !file.startsWith(root + path.sep) ||
        path.basename(file).startsWith(".") ||
        ["data.json", "base.json", "server.js"].includes(path.basename(file))
      ) {
        send(res, 403, "Forbidden");
        return;
      }
      const body = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (e) {
      send(res, 404, "Not found");
    }
  })
  .listen(port, "0.0.0.0", () => {
    console.log(`Worklog: http://localhost:${port}`);
  });
