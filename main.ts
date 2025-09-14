import Papa from "npm:papaparse@5.4.1";
const { unparse } = Papa;

import { randomToken } from "npm:rxdb/plugins/utils";
  



const kv = await Deno.openKv();

const PEER_ID_LENGTH = 12;

type ServerPeer = {
  id: string;
  socket: WebSocket;
  rooms: Set<string>;
  lastPing: number;
};

const peerById = new Map<string, ServerPeer>();
const peersByRoom = new Map<string, Set<string>>();

const SIMPLE_PEER_PING_INTERVAL = 1000 * 60 * 2;

function disconnectSocket(peerId: string, reason: string) {
  console.log("# disconnect peer " + peerId + " reason: " + reason);
  const peer = peerById.get(peerId);
  if (peer) {
    peer.socket.close && peer.socket.close(undefined, reason);
    peer.rooms.forEach((roomId) => {
      const room = peersByRoom.get(roomId);
      room?.delete(peerId);
      if (room && room.size === 0) {
        peersByRoom.delete(roomId);
      }
    });
  }
  peerById.delete(peerId);
}

function validateIdString(roomId: string): boolean {
  if (
    typeof roomId === "string" &&
    roomId.length > 5 &&
    roomId.length < 100
  ) {
    return true;
  } else {
    return false;
  }
}

setInterval(() => {
  const minTime = Date.now() - SIMPLE_PEER_PING_INTERVAL;
  Array.from(peerById.values()).forEach((peer) => {
    if (peer.lastPing < minTime) {
      disconnectSocket(peer.id, "no ping for 2 minutes");
    }
  });
}, 1000 * 5);

function handleSignaling(req: Request): Response {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  const peerId = randomToken(PEER_ID_LENGTH);
  const peer: ServerPeer = {
    id: peerId,
    socket,
    rooms: new Set(),
    lastPing: Date.now(),
  };

  socket.onopen = () => {
    peerById.set(peerId, peer);

    socket.send(JSON.stringify({ type: "init", yourPeerId: peerId }));
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log(message);
    peer.lastPing = Date.now();

    const type = message.type;
    switch (type) {
      case "join": {
        const roomId = message.room;
        if (
          !validateIdString(roomId) ||
          !validateIdString(peerId)
        ) {
          disconnectSocket(peerId, "invalid ids");
          return;
        }

        if (peer.rooms.has(peerId)) {
          return;
        }
        peer.rooms.add(roomId);

        let room = peersByRoom.get(message.room);
        if (typeof room === "undefined") {
          room = new Set();
          peersByRoom.set(message.room, room);
        }

        room.add(peerId);

        // tell everyone about new room state
        room.forEach((otherPeerId) => {
          const otherPeer = peerById.get(otherPeerId);
          if (otherPeer) {
            otherPeer.socket.send(
              JSON.stringify({
                type: "joined",
                otherPeerIds: Array.from(room),
              }),
            );
          }
        });
        break;
      }
      case "signal": {
        if (
          message.senderPeerId !== peerId
        ) {
          disconnectSocket(peerId, "spoofed sender");
          return;
        }
        const receiver = peerById.get(message.receiverPeerId);
        if (receiver) {
          socket.send(JSON.stringify(
            message,
          ));
        }
        break;
      }
      case "ping":
        break;
      default:
        disconnectSocket(peerId, "unknown message type " + type);
    }
  };

  socket.onclose = () => {
    disconnectSocket(peerId, "disconnect socket");
  };

  socket.onerror = (err) => {
    console.error("SERVER ERROR:");
    console.dir(err);
    disconnectSocket(peerId, "socket errored");
  };

  return response;
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/signaling") return handleSignaling(req);

  if (req.method === "POST" && url.pathname === "/sync") {
    const clientData = await req.json();
    if (Array.isArray(clientData)) {
      for (const rec of clientData) {
        if (rec.name && rec.date) {
          const key = ["attendance", rec.name, rec.date];
          const existing = await kv.get(key);
          delete rec.synced;
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
    if (entry.value) {
      entries.push(entry.value as { name: string; date: string });
    }
  }
  return entries;
}

Deno.serve(handleRequest);
