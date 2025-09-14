import { addRecord, getAllRecords } from "./attendance.js";

const form = document.getElementById("attendance-form");
const list = document.getElementById("attendance-list");

async function renderList() {
  const records = await getAllRecords();
  list.innerHTML = records.map((r) =>
    `<li>${r.name} - ${new Date(r.date).toLocaleString()}</li>`
  ).join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  if (name) {
    await addRecord(name, false);
    document.getElementById("name").value = "";
    renderList();

    if ("serviceWorker" in navigator && "SyncManager" in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("attendance-sync");
    }
  }
});

if ("serviceWorker" in navigator) {
  addEventListener("DOMContentLoaded", (_event) => {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => console.log("SW registered", reg))
      .catch((err) => console.error("SW registration failed", err));
  });
}

renderList();
