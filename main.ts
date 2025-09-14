import Papa from "https://esm.sh/papaparse@5.4.1";

const { parse, unparse } = Papa;

const kv = await Deno.openKv();

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/sync") {
    const clientData = await req.json();
    if (Array.isArray(clientData)) {
      for (const rec of clientData) {
        if (rec.name && rec.date) {
          const key = ["attendance", rec.name, rec.date];
          const existing = await kv.get(key);
          if (!existing.value) {
            await kv.set(key, rec);
          }
        }
      }
    }

    const allRecords = await getAllAttendance();
    return Response.json(allRecords);
  }

  if (req.method === "GET" && url.pathname === "/sync") {
    const allRecords = await getAllAttendance();
    return Response.json(allRecords);
  }

  if (req.method === "GET" && url.pathname === "/csv") {
    const allRecords = await getAllAttendance();
    const csv = unparse(allRecords);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=attendance.csv",
      },
    });
  }

  // Serve static files
  if (req.method === "GET") {
    try {
      const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = await Deno.readTextFile(`./public${filePath}`);
      const contentType = getContentType(filePath);
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

function getContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".webmanifest")) return "application/manifest+json";
  if (path.endsWith(".png")) return "image/png";
  return "text/plain";
}

async function getAllAttendance(): Promise<
  Array<{ name: string; date: string }>
> {
  const entries: Array<{ name: string; date: string }> = [];
  for await (const entry of kv.list({ prefix: ["attendance"] })) {
    if (entry.value) entries.push(entry.value);
  }
  return entries;
}

Deno.serve(handleRequest);
