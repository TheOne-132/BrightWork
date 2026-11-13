const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || relative.split(/[\\/]/).some((part) => part.startsWith("."))) {
      response.writeHead(403).end();
      return;
    }
    const content = await fs.readFile(file);
    response.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-cache" });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(8000, "127.0.0.1", () => console.log("Brightwork: http://127.0.0.1:8000"));
