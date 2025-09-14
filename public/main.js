import {
  addRxPlugin,
  createRxDatabase,
} from "https://esm.sh/rxdb/plugins/core";
import { RxDBDevModePlugin } from "https://esm.sh/rxdb/plugins/dev-mode";
import { getRxStorageLocalstorage } from "https://esm.sh/rxdb/plugins/storage-localstorage";
import { wrappedValidateAjvStorage } from "https://esm.sh/rxdb/plugins/validate-ajv";
import {
  getConnectionHandlerSimplePeer,
  replicateWebRTC,
} from "https://esm.sh/rxdb/plugins/replication-webrtc";
import {
  combineLatestWith,
  distinctUntilChanged,
  fromEvent,
  map,
  startWith,
} from "https://esm.sh/rxjs";

addRxPlugin(RxDBDevModePlugin);

const memberList = document.getElementById("member-list");
const addMemberForm = document.getElementById("add-member-form");
const newMemberInput = document.getElementById("new-member-name");
const meetingDate = document.getElementById("meeting-date");

// Get today or next Monday
function getNextMonday(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const offset = day === 1 ? 0 : (8 - day) % 7;
  date.setDate(date.getDate() + offset);
  return date;
}

// Set default value
meetingDate.value = getNextMonday().toISOString().split("T")[0];

// Prevent non-Mondays
meetingDate.addEventListener("input", () => {
  const selected = new Date(meetingDate.value);
  if (selected.getDay() !== 1) {
    meetingDate.value = getNextMonday(selected).toISOString().split("T")[0];
  }
});

const db = await createRxDatabase({
  name: "attendance",
  storage: wrappedValidateAjvStorage({
    storage: getRxStorageLocalstorage(),
  }),
});

await db.addCollections({
  // name of the collection
  members: {
    // we use the JSON-schema standard
    schema: {
      version: 0,
      primaryKey: "name",
      type: "object",
      properties: {
        name: {
          type: "string",
          maxLength: 100, // <- the primary key must have maxLength
        },
        fullname: {
          type: "string",
        },
      },
      required: ["name"],
    },
  },
  attendance: {
    // we use the JSON-schema standard
    schema: {
      version: 0,
      primaryKey: {
        // where should the composed string be stored
        key: "id",
        // fields that will be used to create the composed key
        fields: [
          "date",
          "member",
        ],
        // separator which is used to concat the fields values.
        separator: "|",
      },
      type: "object",
      properties: {
        id: {
          type: "string",
          maxLength: 100, // <- the primary key must have maxLength
        },
        member: {
          ref: "members",
          type: "string",
        },
        date: {
          type: "string",
          format: "date-time",
        },
        attended: {
          type: "boolean",
          default: false,
        },
        comment: {
          type: "string",
          default: "",
        },
      },
      required: ["member", "date"],
    },
  },
});

const membersPool = await replicateWebRTC({
  collection: db.members,
  connectionHandlerCreator: getConnectionHandlerSimplePeer({
    signalingServerUrl: "/signaling",
  }),
  topic: "pfadfinder-members", // <- set any app-specific room id here.
  secret: "mysecret",
  pull: {},
  push: {},
});

membersPool.error$.subscribe((err) => console.error("WebRTC Error:", err));

const attendancePool = await replicateWebRTC({
  collection: db.attendance,
  connectionHandlerCreator: getConnectionHandlerSimplePeer({
    signalingServerUrl: "/signaling",
  }),
  topic: "pfadfinder-attendance", // <- set any app-specific room id here.
  secret: "mysecret",
  pull: {},
  push: {},
});

attendancePool.error$.subscribe((err) => console.error("WebRTC Error:", err));

const selected_date$ = fromEvent(
  meetingDate,
  "change",
  (e) => new Date(e.target.value),
).pipe(
  startWith(getNextMonday()),
  map((d) => {
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }),
  map((d) => d.toISOString()),
  distinctUntilChanged(),
);

function bindCheckbox(doc, field, checkbox) {
  doc.get$(field).subscribe((val) => checkbox.checked = !!val);
  checkbox.addEventListener("change", async () => {
    await doc.incrementalPatch({ [field]: checkbox.checked });
  });
}

function bindInput(doc, field, input) {
  doc.get$(field).subscribe((val) => input.value = val);
  input.addEventListener("input", async () => {
    await doc.incrementalPatch({ [field]: input.value });
  });
}

const memberList$ = db.members.find().$;

memberList$.pipe(combineLatestWith(selected_date$)).subscribe(
  async ([members, today]) => {
    memberList.innerHTML = "";

    for (const member of members) {
      const member_attendance = await db.attendance.insertIfNotExists({
        member: member.name,
        date: today,
      });

      const wrapper = document.createElement("div");

      const checkbox = document.createElement("input");

      const qualityInput = document.createElement("input");

      checkbox.type = "checkbox";
      bindCheckbox(member_attendance, "attended", checkbox);

      const label = document.createElement("label");
      label.textContent = member.name;
      label.append(checkbox);

      qualityInput.type = "text";
      qualityInput.placeholder = "Komentar";
      bindInput(member_attendance, "comment", qualityInput);

      wrapper.appendChild(label);
      wrapper.appendChild(qualityInput);
      memberList.appendChild(wrapper);
    }
  },
);

addMemberForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newMemberInput.value.trim();
  if (name) {
    await db.members.insert({ name });
  }
});
