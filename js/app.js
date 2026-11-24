"use strict";

const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  iso = (d) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-"),
  localDT = (d) =>
    iso(d) +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0"),
  today = () => iso(new Date()),
  now = () => localDT(new Date()),
  dateName = (s) =>
    s
      ? new Date(s.slice(0, 10) + "T12:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      : "—",
  uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2),
  minutes = (a, b) =>
    a && b ? Math.max(0, (new Date(b) - new Date(a)) / 60000) : 0,
  fmt = (n) =>
    `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, "0")}m`,
  download = (name, blob) => {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

function toast(message, type = "success") {
  let host = document.getElementById("toastHost");

  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }

  const el = document.createElement("div");
  el.className = "toast-message " + type;
  el.textContent = message;
  host.append(el);
  setTimeout(() => {
    el.classList.add("closing");
    setTimeout(() => el.remove(), 240);
  }, 3200);
}

const statuses = ["Backlog", "In Progress", "QA", "Staging", "Production"],
  kinds = [
    "Feature",
    "Bug",
    "Hotfix",
    "Refactor",
    "Fix",
    "Chore",
    "Docs",
    "Test",
    "Perf",
    "Build",
    "CI",
  ],
  colors = {
    Feature: "#4187ce",
    Bug: "#e05b58",
    Hotfix: "#d78334",
    Refactor: "#9264be",
    Fix: "#d65d6f",
    Chore: "#7a8795",
    Docs: "#3a9d8b",
    Test: "#7f9c32",
    Perf: "#c39b2d",
    Build: "#6978bc",
    CI: "#9d6e9d",
  },
  cc = {
    Feature: "feat",
    Bug: "fix",
    Hotfix: "fix",
    Refactor: "refactor",
    Fix: "fix",
    Chore: "chore",
    Docs: "docs",
    Test: "test",
    Perf: "perf",
    Build: "build",
    CI: "ci",
  };

const sample = {
  clients: [],
  projects: [],
  people: [],
  tasks: [],
  attendance: [],
  activity: [],
  meetings: [],
};

const taskColors = { yellow: "Yellow", green: "Green", blue: "Blue", red: "Red" };

function normalize(raw) {
  const d = structuredClone(raw || sample);

  for (const k of Object.keys(sample)) if (!Array.isArray(d[k])) d[k] = [];

  for (const p of d.projects) {
    if (!p.clientId) {
      let c = d.clients.find((x) => x.name === p.client);

      if (!c && p.client) {
        c = { id: uid(), name: p.client, contact: "", description: "" };
        d.clients.push(c);
      }
      p.clientId = c?.id || "";
    }
    p.modules = Array.isArray(p.modules) ? p.modules : [];
  }

  for (const t of d.tasks) {
    t.datetime = t.datetime || (t.date ? t.date + "T09:00" : now());
    t.description = t.description ?? t.notes ?? "";
    t.kind = t.kind || "Chore";
    t.module = t.module || "";
    t.branches = Array.isArray(t.branches) ? t.branches : [];
    if (!Object.hasOwn(taskColors, t.color)) delete t.color;
  }

  for (const a of d.activity) {
    a.title = a.title || a.description?.slice(0, 80) || "Activity";
    a.start = a.start || (a.date || today()) + "T" + (a.time || "09:00");
    a.end = a.end || a.start;
    a.description = a.description || "";
    a.taskId = a.taskId || "";
  }

  for (const m of d.meetings) {
    m.start = m.start || (m.date || today()) + "T" + (m.time || "09:00");
    m.end = m.end || m.start;
    m.description = m.description || m.notes || "";
    m.peopleIds = Array.isArray(m.peopleIds) ? m.peopleIds : [];
  }

  return d;
}

// data.json is the only persistent source of Worklog records.
let data = normalize(sample);
let saving = Promise.resolve();
let ready = false;

async function loadData() {
  const response = await fetch("/api/data", { cache: "no-store" });
  if (!response.ok)
    throw new Error(`Unable to read data.json (${response.status})`);
  data = normalize(await response.json());
  ready = true;
  render();
}

async function save() {
  if (!ready) {
    toast("Data is not loaded yet.", "error");
    return false;
  }
  const payload = JSON.stringify(data, null, 2);
  const operation = saving
    .catch(() => { })
    .then(async () => {
      const response = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `HTTP ${response.status}`);
      }
    });
  saving = operation;
  try {
    await operation;
    return true;
  } catch (error) {
    console.error("Unable to save data.json:", error);
    toast("Unable to save data.json: " + error.message, "error");
    return false;
  }
}

async function persistChange(change, successMessage) {
  if (!ready) return false;
  const previous = structuredClone(data);
  change();
  if (!(await save())) {
    data = previous;
    render();
    return false;
  }
  render();
  if (successMessage) toast(successMessage);
  return true;
}

let tab = "overview",
  subProjects = "clients",
  subMeetings = "meetings",
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected = today(),
  taskProject = "",
  taskKind = "",
  taskColor = "",
  taskQuery = "",
  reportMonth = today().slice(0, 7),
  docsFolder = null,
  docsFiles = new Map(),
  docsCurrent = "";

const project = (id) => data.projects.find((p) => p.id === id),
  client = (id) => data.clients.find((c) => c.id === id),
  projectName = (id) => project(id)?.name || "—",
  clientName = (id) => client(id)?.name || "—",
  taskName = (id) => data.tasks.find((t) => t.id === id)?.title || "—",
  peopleForProject = (id) =>
    data.people.filter((p) => p.clientId === project(id)?.clientId),
  attendance = (d) => data.attendance.find((a) => a.date === d),
  attMins = (a) =>
    a?.start && a?.end
      ? Math.max(
        0,
        Number(a.end.slice(0, 2)) * 60 +
        Number(a.end.slice(3)) -
        (Number(a.start.slice(0, 2)) * 60 + Number(a.start.slice(3))) -
        Number(a.breakMin || 0),
      )
      : 0,
  kindTag = (k) =>
    `<span class="tag kind"><i class="kind-dot" style="--kind-color:${colors[k] || "#8c98a9"}"></i>${esc(k)}</span>`,
  btn = (label, action, primary = false) =>
    `<button class="btn ${primary ? "primary" : ""}" data-action="${action}">${label}</button>`,
  heading = (title, actions = "") =>
    `<div class="toolbar"><h1>${title}</h1><div class="actions">${actions}</div></div>`,
  field = (
    label,
    name,
    type = "text",
    value = "",
    options = [],
    wide = false,
    extra = "",
  ) =>
    `<label class="field ${wide ? "wide" : ""}">${label}${type === "textarea" ? `<textarea id="${name}" class="${extra}" name="${name}">${esc(value)}</textarea>` : type === "select" ? `<select id="${name}" name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : `<input type="${type}" id="${name}" name="${name}" value="${esc(value)}" ${extra}>`}</label>`,
  projectOptions = () =>
    data.projects.map((p) => [p.id, p.code + " · " + p.name]),
  clientOptions = () => data.clients.map((c) => [c.id, c.name]);

function render() {
  document
    .querySelectorAll("#nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  ({ overview, projects, tasks, git, activity, meetings, reports, docs })[
    tab
  ]();
}

const punchSteps = [
  ["start", "Clock in"],
  ["breakStart", "Start break"],
  ["breakEnd", "End break"],
  ["end", "Clock out"],
];

let editingAttendance = false;
let attendancePending = false;

function attendancePanel() {
  const record = attendance(selected);
  const next = record?.end || record?.mode === "Off"
    ? null
    : punchSteps.find(([key]) => !record?.[key]);
  const edit = editingAttendance;
  const button = (label, action, primary = false) =>
    `<button type="button" class="btn ${primary ? "primary" : ""}" data-action="${action}" ${attendancePending ? "disabled" : ""}>${label}</button>`;
  const mode = (value) => field("Work mode", "mode", "select", value,
    ["Office", "Remote", "Off"].map((name) => [name, name]));

  return `<section class="card panel"><h3>${dateName(selected)} · Attendance</h3>${edit
      ? `<form id="attendanceForm"><fieldset class="attendance-fields formgrid" ${attendancePending ? "disabled" : ""}>
        ${mode(record?.mode || "Remote")}
        ${field("Break (minutes)", "breakMin", "number", record?.breakMin ?? 0, [], false, 'min="0" step="1"')}
        ${field("Clock in", "start", "time", record?.start)}
        ${field("Clock out", "end", "time", record?.end)}
        ${field("Notes", "notes", "textarea", record?.notes, [], true)}
        <div class="formfoot wide">${button("Cancel", "cancelAttendance")}<button class="btn primary">Save attendance</button></div>
      </fieldset></form>`
      : `${record ? `<dl class="attendance-summary">
          <div><dt>Work mode</dt><dd>${esc(record.mode)}</dd></div>
          ${punchSteps.map(([key, label]) => `<div><dt>${label}</dt><dd>${esc(record[key] || "—")}</dd></div>`).join("")}
          <div><dt>Break</dt><dd>${Number(record.breakMin || 0)} min</dd></div>
        </dl>${record.notes ? `<p class="attendance-notes">${esc(record.notes)}</p>` : ""}`
        : '<p class="muted">No attendance recorded.</p>'}
        ${selected === today() && next && !record ? mode("Remote") : ""}
        <div class="formfoot">
          ${button(record ? "Edit attendance" : "Add attendance", "editAttendance")}
          ${record ? button("Delete attendance", "deleteAttendance") : ""}
          ${selected === today() && next ? button(next[1], "punchAttendance", true) : ""}
        </div>`
    }</section>`;
}

async function updateAttendance(change, message) {
  if (attendancePending) return;
  attendancePending = true;
  render();
  try {
    return await persistChange(change, message);
  } finally {
    attendancePending = false;
    render();
  }
}

function overview() {
  let rows = data.attendance.filter((a) =>
    a.date.startsWith(iso(month).slice(0, 7)),
  ),
    sum = (arr) => arr.reduce((n, a) => n + attMins(a), 0),
    office = rows.filter((a) => a.mode === "Office"),
    remote = rows.filter((a) => a.mode === "Remote");
  $("#main").innerHTML =
    heading(
      "Overview",
      `${btn("‹", "prevMonth")}${btn("Today", "today")}${btn("›", "nextMonth")}<strong>${month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>`,
    ) +
    `<div class="metrics"><div class="card metric"><label>Logged hours</label><strong>${fmt(sum(rows))}</strong><span>This month</span></div><div class="card metric"><label>Office days</label><strong>${office.length} <small>(${fmt(sum(office))})</small></strong><span>This month</span></div><div class="card metric"><label>Remote days</label><strong>${remote.length} <small>(${fmt(sum(remote))})</small></strong><span>This month</span></div><div class="card metric"><label>Active tasks</label><strong>${data.tasks.filter((t) => t.status !== "Production").length}</strong><span>All projects</span></div></div>${calendar()}<div class="below">${attendancePanel()}<section class="card panel"><h3>Daily timeline</h3>${timeline()}</section></div>`;

  const form = $("#attendanceForm");
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const date = selected;
    const record = attendance(date);
    const values = Object.fromEntries(new FormData(form));
    values.breakMin = Number(values.breakMin);
    if (values.end && (!values.start || values.end < values.start)) {
      toast("Clock out must be at or after clock in.", "error");
      return;
    }
    if (values.end && values.breakMin > minutes(date + "T" + values.start, date + "T" + values.end)) {
      toast("Break cannot exceed the time between clock in and clock out.", "error");
      return;
    }
    if (record?.breakStart && (!values.start || values.start > record.breakStart ||
      (values.end && values.end < (record.breakEnd || record.breakStart)) ||
      values.breakMin !== Number(record.breakMin || 0))) {
      values.breakStart = "";
      values.breakEnd = "";
    }
    editingAttendance = false;
    const success = await updateAttendance(() => {
      if (record) Object.assign(record, values);
      else data.attendance.push({ date, ...values });
    }, "Attendance saved.");
    if (!success && selected === date && tab === "overview") {
      editingAttendance = true;
      render();
    }
  };
}

function calendar() {
  let start = new Date(month);
  start.setDate(1 - start.getDay());

  let weeks = Math.ceil(
    (new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() +
      new Date(month).getDay()) /
    7,
  ),
    html =
      '<div class="card calendar"><div class="calhead">' +
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        .map((s) => `<div>${s}</div>`)
        .join("") +
      '</div><div class="calgrid">';

  for (let i = 0; i < weeks * 7; i++) {
    let d = new Date(start);
    d.setDate(start.getDate() + i);

    let key = iso(d),
      a = attendance(key);

    const tasks = data.tasks.filter((task) => task.datetime.startsWith(key));
    const activities = data.activity.filter((entry) => entry.start.startsWith(key));
    const markers = [
      ...tasks.map((task) => ["is-task", `Task: ${task.title}`]),
      ...activities.map((entry) => ["activity", `Activity: ${entry.title}`]),
    ];
    html += `<button type="button" class="day ${a?.mode === "Off" ? "day-off" : ""} ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${key === selected ? "selected" : ""} ${key === today() ? "today" : ""}" data-date="${key}" aria-pressed="${key === selected}" aria-label="${dateName(key)}${a?.mode === "Off" ? ", Holiday" : ""}, ${tasks.length} tasks, ${activities.length} activities">
      <span class="daynum">${d.getDate()}</span>
      ${a ? `<span class="chip ${esc(a.mode.toLowerCase())}">${esc(a.mode)}</span>` : ""}
      ${markers.length ? `<span class="day-markers" aria-hidden="true">${markers.map(([kind, title]) =>
      `<span class="day-marker ${kind}" title="${esc(title)}"></span>`).join("")}</span>` : ""}
      ${data.meetings.filter((meeting) => meeting.start.startsWith(key)).slice(0, 1).map(
        (meeting) => `<span class="chip">${esc(meeting.start.slice(11))} ${esc(meeting.title)}</span>`,
      ).join("")}
    </button>`;
  }

  return (
    html +
    '</div><div class="legend"><span><i class="dot" style="background:#7697d2"></i>Office</span><span><i class="dot" style="background:#62b78c"></i>Remote</span><span><i class="dot" style="background:#aa8dc9"></i>Off</span><span><i class="day-marker is-task"></i>Tasks</span><span><i class="day-marker activity"></i>Activities</span></div></div>'
  );
}

function timeline() {
  let items = [
    ...data.tasks
      .filter((task) => task.datetime.startsWith(selected))
      .map((task) => ({ ...task, start: task.datetime, type: "Task" })),
    ...data.activity
      .filter((a) => a.start.startsWith(selected))
      .map((a) => ({ ...a, type: "Activity" })),
    ...data.meetings
      .filter((m) => m.start.startsWith(selected))
      .map((m) => ({ ...m, type: "Meeting" })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  return items.length
    ? `<div class="list">${items.map((x) => `<div class="item card"><div class="itemtop"><strong>${esc(x.start.slice(11))} · ${esc(x.title)}</strong><span class="tag">${x.type}</span></div><div class="description clamp">${esc(x.description)}</div><div class="muted">${esc(projectName(x.project))}</div></div>`).join("")}</div>`
    : '<div class="empty">No entries</div>';
}

function projects() {
  let tabs = `<div class="tabs"><button class="btn ${subProjects === "clients" ? "active" : ""}" data-sub="clients">Clients</button><button class="btn ${subProjects === "projects" ? "active" : ""}" data-sub="projects">Projects</button></div>`;
  $("#main").innerHTML =
    heading(
      "Projects",
      btn(
        subProjects === "clients" ? "+ Client" : "+ Project",
        subProjects === "clients" ? "newClient" : "newProject",
        true,
      ),
    ) +
    tabs +
    (subProjects === "clients"
      ? `<div class="card tablewrap"><table class="datatable"><thead><tr><th>Client</th><th>Contact</th><th>Description</th><th></th></tr></thead><tbody>${data.clients.map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.contact)}</td><td>${esc(c.description)}</td><td><button class="btn" data-edit="client:${c.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="card tablewrap"><table class="datatable"><thead><tr><th>Code</th><th>Project</th><th>Client</th><th>Modules</th><th>Tasks</th><th></th></tr></thead><tbody>${data.projects.map((p) => `<tr><td><span class="tag">${esc(p.code)}</span></td><td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.description)}</div></td><td>${esc(clientName(p.clientId))}</td><td>${p.modules.map((m) => `<span class="tag">${esc(m)}</span>`).join("")}</td><td>${data.tasks.filter((t) => t.project === p.id).length}</td><td><button class="btn" data-edit="project:${p.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`);
}

function tasks() {
  let pid = taskProject,
    kind = taskKind;
  $("#main").innerHTML =
    heading("Tasks", btn("+ Task", "newTask", true)) +
    `<div class="filters"><input id="taskSearch" placeholder="Search tasks" value="${esc(taskQuery)}"><select id="taskProject"><option value="">All projects</option>${projectOptions()
      .map(
        ([v, l]) =>
          `<option value="${esc(v)}" ${v === pid ? "selected" : ""}>${esc(l)}</option>`,
      )
      .join(
        "",
      )}</select><select id="taskKind"><option value="">All types</option>${kinds.map((k) => `<option ${k === kind ? "selected" : ""}>${k}</option>`).join("")}</select>
      <select id="taskColorFilter" aria-label="Filter tasks by color">
        ${[["", "All colors"], ...Object.entries(taskColors), ["none", "No color"]]
      .map(([value, label]) => `<option value="${value}" ${value === taskColor ? "selected" : ""}>${label}</option>`)
      .join("")}
      </select></div><div id="board" class="board"></div>`;
  $("#taskSearch").oninput = (e) => {
    taskQuery = e.target.value;
    drawBoard();
  };
  $("#taskProject").onchange = (e) => {
    taskProject = e.target.value;
    drawBoard();
  };
  $("#taskKind").onchange = (e) => {
    taskKind = e.target.value;
    drawBoard();
  };
  $("#taskColorFilter").onchange = (e) => {
    taskColor = e.target.value;
    drawBoard();
  };
  drawBoard();
}

function taskColorButtons(color) {
  return Object.entries(taskColors)
    .map(([value, label]) => `<button type="button" class="task-color-dot" data-task-color="${value}" aria-pressed="${color === value}" aria-label="${label} task marker" title="${label} task marker"></button>`)
    .join("");
}

function drawBoard() {
  $("#board").innerHTML = statuses
    .map((s) => {
      let rows = data.tasks.filter(
        (t) =>
          t.status === s &&
          (!taskProject || t.project === taskProject) &&
          (!taskKind || t.kind === taskKind) &&
          (!taskColor || (t.color || "none") === taskColor) &&
          [t.title, t.description, t.module, ...t.branches]
            .join(" ")
            .toLowerCase()
            .includes(taskQuery.toLowerCase()),
      );

      return `<section class="lane" data-status="${s}"><div class="lanehead">${s}<span class="muted">${rows.length}</span></div>${rows.map((t) => `<div class="task" draggable="true" data-task="${esc(t.id)}" data-color="${esc(t.color || "")}"><div>${kindTag(t.kind)}<span class="tag">${esc(project(t.project)?.code)}</span></div><strong>${esc(t.module ? `${t.module} · ${t.title}` : t.title)}</strong><div class="description clamp">${esc(t.description)}</div><div class="muted">${esc(t.datetime.replace("T", " "))}</div><div>${t.branches.map((b) => `<span class="tag mono">${esc(b)}</span>`).join("")}</div><div class="taskfooter"><span class="muted">${esc(projectName(t.project))}</span><div class="task-actions">${taskColorButtons(t.color)}<button class="btn" data-edit="task:${esc(t.id)}">Edit</button></div></div></div>`).join("")}</section>`;
    })
    .join("");
  document
    .querySelectorAll(".task[draggable]")
    .forEach(
      (el) =>
      (el.ondragstart = (e) =>
        e.dataTransfer.setData("text/plain", el.dataset.task)),
    );
  document.querySelectorAll(".lane").forEach((el) => {
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = async (e) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData("text/plain");
      const status = el.dataset.status;
      await persistChange(() => {
        const t = data.tasks.find((x) => x.id === taskId);
        if (t) t.status = status;
      });
    };
  });
}

function activity() {
  let items = [...data.activity].sort((a, b) => b.start.localeCompare(a.start));
  $("#main").innerHTML =
    heading("Activity Log", btn("+ Activity", "newActivity", true)) +
    `<div class="list">${items.map((a) => `<article class="card item"><div class="itemtop"><div><strong>${esc(a.title)}</strong><div class="muted">${esc(a.start.replace("T", " "))} – ${esc(a.end.replace("T", " "))} · ${fmt(minutes(a.start, a.end))} · ${esc(projectName(a.project))}</div></div><button class="btn" data-edit="activity:${a.id}">Edit</button></div><div class="description clamp">${esc(a.description)}</div>${a.taskId ? `<span class="tag">Task: ${esc(taskName(a.taskId))}</span>` : ""}</article>`).join("")}</div>`;
}

function meetings() {
  let tabs = `<div class="tabs"><button class="btn ${subMeetings === "meetings" ? "active" : ""}" data-sub="meetings">Meetings</button><button class="btn ${subMeetings === "people" ? "active" : ""}" data-sub="people">People</button></div>`;
  $("#main").innerHTML =
    heading(
      "Meetings",
      btn(
        subMeetings === "meetings" ? "+ Meeting" : "+ Person",
        subMeetings === "meetings" ? "newMeeting" : "newPerson",
        true,
      ),
    ) +
    tabs +
    (subMeetings === "people"
      ? `<div class="card tablewrap"><table class="datatable"><thead><tr><th>Name</th><th>Client</th><th>Role</th><th>Email</th><th></th></tr></thead><tbody>${data.people.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(clientName(p.clientId))}</td><td>${esc(p.role)}</td><td>${esc(p.email)}</td><td><button class="btn" data-edit="person:${p.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="list">${[...data.meetings]
        .sort((a, b) => b.start.localeCompare(a.start))
        .map(
          (m) =>
            `<article class="card item"><div class="itemtop"><div><strong>${esc(m.title)}</strong><div class="muted">${esc(m.start.replace("T", " "))} – ${esc(m.end.replace("T", " "))} · ${esc(projectName(m.project))}</div></div><button class="btn" data-edit="meeting:${m.id}">Edit</button></div><div class="description clamp">${esc(m.description)}</div><div>${m.peopleIds.map((id) => `<span class="tag">${esc(data.people.find((p) => p.id === id)?.name || "Unknown")}</span>`).join("")}</div>${m.decisions ? `<div class="muted">Decisions: ${esc(m.decisions)}</div>` : ""}</article>`,
        )
        .join("")}</div>`);
}

function reportDays() {
  if (!reportMonth) return [];
  const days = new Map();
  const dayFor = (value) => {
    const date = value.slice(0, 10);
    if (!days.has(date)) days.set(date, { date, record: null, tasks: [], activities: [] });
    return days.get(date);
  };
  const inMonth = (value) => value?.startsWith(reportMonth + "-");
  for (const record of data.attendance) {
    if (inMonth(record.date)) dayFor(record.date).record = record;
  }
  for (const task of data.tasks) {
    if (inMonth(task.datetime)) dayFor(task.datetime).tasks.push(task);
  }
  for (const entry of data.activity) {
    if (inMonth(entry.start)) dayFor(entry.start).activities.push(entry);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function reports() {
  const days = reportDays();
  const total = days.reduce((sum, day) => sum + attMins(day.record), 0);
  const badges = (items) => items.map((item) => `<span class="tag">${esc(item.title)}</span>`).join("") || "—";
  $("#main").innerHTML = heading("Reports", btn("Export PDF", "pdf", true)) +
    `<div class="filters">
      <label>Month <input type="month" id="reportMonth" value="${esc(reportMonth)}"></label>
      <span class="tag">${days.filter(({ record }) => record).length} attendance days</span>
      <span class="tag">${fmt(total)} logged</span>
    </div>
    <div class="card tablewrap"><table class="datatable">
      <thead><tr><th>Date</th><th>Mode</th><th>Clock in</th><th>Clock out</th><th>Break</th><th>Total</th><th>Tasks</th><th>Activities</th></tr></thead>
      <tbody>${days.length ? days.map(({ date, record, tasks, activities }) => `
        <tr>
          <td>${dateName(date)}</td><td>${esc(record?.mode || "—")}</td>
          <td>${esc(record?.start || "—")}</td><td>${esc(record?.end || "—")}</td>
          <td>${record ? `${Number(record.breakMin || 0)} min` : "—"}</td>
          <td>${record?.end ? fmt(attMins(record)) : "—"}</td>
          <td class="report-badges">${badges(tasks)}</td>
          <td class="report-badges">${badges(activities)}</td>
        </tr>`).join("") : '<tr><td colspan="8" class="empty">No entries for this month.</td></tr>'}</tbody>
    </table></div>`;
  $("#reportMonth").onchange = (event) => {
    reportMonth = event.target.value;
    reports();
  };
  $('[data-action="pdf"]').disabled = !reportMonth;
}

function exportPDF() {
  if (!window.jspdf?.jsPDF) {
    toast("PDF library unavailable. Check your connection.", "error");
    return;
  }
  if (!reportMonth) return;

  const days = reportDays();
  const attendanceRows = days.filter(({ record }) => record);
  const workRows = days.flatMap(({ date, tasks, activities }) => [
    ...tasks.map((task) => [date, "Task", task.title, projectName(task.project), task.status || "-"]),
    ...activities.map((entry) => [date, "Activity", entry.title, projectName(entry.project), "-"]),
  ]);
  const total = attendanceRows.reduce((sum, { record }) => sum + attMins(record), 0);
  const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = width - margin * 2;
  const bottom = height - 19;
  const ink = "#222222";
  const muted = "#555555";
  const border = "#C8C8C8";
  const period = new Date(reportMonth + "-01T12:00").toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });
  let y;
  function pageHeader() {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(ink);
    pdf.text("Report", margin, 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(muted);
    pdf.text(period, margin, 23);
    pdf.setDrawColor(ink);
    pdf.line(margin, 30, width - margin, 30);
    y = 39;
  }
  function drawTable(title, columns, rows) {
    const lineHeight = 4;
    const padding = 2.5;
    function tableHeader(continued = false) {
      pdf.setTextColor(ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(continued ? `${title} (continued)` : title, margin, y + 4);
      y += 8;
      pdf.setFontSize(9);
      let x = margin;
      for (const [label, size] of columns) {
        pdf.setDrawColor(border);
        pdf.rect(x, y, size, 8);
        pdf.text(label, x + padding, y + 5.3);
        x += size;
      }
      y += 8;
    }
    function nextPage() {
      pdf.addPage();
      pageHeader();
      tableHeader(true);
    }

    if (y + 25 > bottom) {
      pdf.addPage();
      pageHeader();
    }
    tableHeader();

    if (!rows.length) {
      pdf.setDrawColor(border);
      pdf.rect(margin, y, contentWidth, 9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(muted);
      pdf.text("No entries for this period.", margin + padding, y + 5.6);
      y += 17;
      return;
    }
    rows.forEach((row, index) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const wrapped = row.map((value, column) =>
        pdf.splitTextToSize(String(value ?? "-"), columns[column][1] - padding * 2),
      );
      const lines = Math.max(...wrapped.map((cell) => cell.length));
      if (lines * lineHeight + padding * 2 <= bottom - 55 &&
        y + lines * lineHeight + padding * 2 > bottom) nextPage();

      let offset = 0;
      while (offset < lines) {
        const available = Math.floor((bottom - y - padding * 2) / lineHeight);
        if (available < 1) {
          nextPage();
          continue;
        }
        const count = Math.min(available, lines - offset);
        const rowHeight = count * lineHeight + padding * 2;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(ink);
        pdf.setDrawColor(border);
        const shaded = index % 2 === 1;
        if (shaded) pdf.setFillColor("#F7F7F7");
        let x = margin;
        columns.forEach(([, size], column) => {
          pdf.rect(x, y, size, rowHeight, shaded ? "FD" : "S");
          wrapped[column].slice(offset, offset + count).forEach((line, lineIndex) => {
            pdf.text(line, x + padding, y + padding + 3 + lineIndex * lineHeight);
          });
          x += size;
        });
        y += rowHeight;
        offset += count;
      }
    });
    y += 8;
  }
  pageHeader();
  const summaries = [
    ["Attendance days", String(attendanceRows.length)],
    ["Logged hours", fmt(total)],
    ["Tasks", String(days.reduce((count, day) => count + day.tasks.length, 0))],
    ["Activities", String(days.reduce((count, day) => count + day.activities.length, 0))],
  ];
  const gap = 4;
  const box = (contentWidth - gap * (summaries.length - 1)) / summaries.length;
  summaries.forEach(([label, value], index) => {
    const x = margin + index * (box + gap);
    pdf.setDrawColor(border);
    pdf.roundedRect(x, y, box, 19, 2, 2);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(muted);
    pdf.text(label, x + 4, y + 6);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(ink);
    pdf.text(value, x + 4, y + 14);
  });
  y += 27;
  drawTable("Attendance",
    [["Date", 32], ["Mode", 30], ["Clock in", 29], ["Clock out", 29], ["Break", 28], ["Total", 32]],
    attendanceRows.map(({ date, record }) => [
      date, record.mode, record.start || "-", record.end || "-",
      `${Number(record.breakMin || 0)} min`, record.end ? fmt(attMins(record)) : "-",
    ]),
  );
  drawTable("Tasks and activities",
    [["Date", 27], ["Type", 19], ["Title", 69], ["Project", 39], ["Status", 26]],
    workRows,
  );

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(border);
    pdf.line(margin, height - 14, width - margin, height - 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(muted);
    pdf.text("Worklog", margin, height - 9);
    pdf.text(`Page ${page} of ${pages}`, width - margin, height - 9, { align: "right" });
  }
  pdf.save(`worklog-report-${reportMonth}.pdf`);
  toast("PDF exported.");
}

function git() {
  const choices = data.tasks.filter((task) => task.status === "In Progress").map((task) => [
    task.id,
    `${project(task.project)?.code || ""} · ${task.module || "General"} · ${task.title}`,
  ]);
  $("#main").innerHTML = heading("Git Planner") +
    `<div class="card git-planner">
      ${field("Task", "gitTask", "select", choices[0]?.[0] || "",
      [["", choices.length ? "Select an in-progress task" : "No tasks in progress"], ...choices])}
      <fieldset class="planner-group">
        <legend>Scope</legend>
        ${field("Shared scope", "gitScope", "text", "")}
        <p class="note">Optional. Used in the branch name and commit message.</p>
      </fieldset>
      <fieldset class="planner-group">
        <legend>Branch</legend>
        <div class="formgrid">
          ${field("Prefix", "gitPrefix", "select", "feat",
        Object.entries({ ...commitLabels, hotfix: "Urgent fix" }).map(([value, label]) => [value, `${value} · ${label}`]))}
          ${field("Name", "gitSlug", "text", "")}
        </div>
        <p class="note">prefix/scope-name</p>
        <div id="gitBranch" class="codebox mono"></div>
        <div class="actions">
          <button class="btn" data-action="copyBranch">Copy branch</button>
          <button class="btn primary" data-action="linkBranch">Add branch to task</button>
        </div>
      </fieldset>
      <fieldset class="planner-group">
        <legend>Conventional Commit</legend>
        <div class="formgrid">
          ${field("Type", "gitType", "select", "feat",
          [...new Set(Object.values(cc))].map((value) => [value, `${value} · ${commitLabels[value]}`]))}
          ${field("Description", "gitDescription", "text", "")}
        </div>
        <div id="gitCommit" class="codebox mono"></div>
        <div class="actions"><button class="btn" data-action="copyCommit">Copy commit</button></div>
      </fieldset>
      <div class="actions"><button class="btn" data-action="suggestGit">Suggest branch &amp; commit</button></div>
    </div>`;
  $("#gitTask").onchange = gitAutofill;
  document.querySelector(".git-planner").addEventListener("input", gitPreview);
  gitAutofill();
}

const commitLabels = {
  feat: "Feature",
  fix: "Bug fix",
  refactor: "Refactoring",
  chore: "Maintenance",
  docs: "Documentation",
  test: "Tests",
  perf: "Performance",
  build: "Build",
  ci: "Continuous integration",
};

const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function gitAutofill() {
  const task = data.tasks.find((item) => item.id === $("#gitTask").value && item.status === "In Progress");
  const type = task ? cc[task.kind] || "chore" : "feat";
  const prefix = task?.kind === "Hotfix" ? "hotfix" : type;
  $("#gitType").value = type;
  $("#gitPrefix").value = prefix;
  $("#gitScope").value = task ? slug(task.module || project(task.project)?.code || "general") : "";
  $("#gitSlug").value = slug(task?.title);
  $("#gitDescription").value = task?.title.trim() || "";
  gitPreview();
}

function gitPreview() {
  const scope = slug($("#gitScope").value);
  const type = $("#gitType").value;
  const prefix = $("#gitPrefix").value;
  const name = slug($("#gitSlug").value);
  const description = $("#gitDescription").value.trim();
  const branch = name ? `${prefix}/${scope ? scope + "-" : ""}${name}` : "";
  const commit = description ? `${type}${scope ? `(${scope})` : ""}: ${description}` : "";
  $("#gitBranch").textContent = branch;
  $("#gitCommit").textContent = commit;
  const task = data.tasks.find((item) => item.id === $("#gitTask").value && item.status === "In Progress");
  $('[data-action="copyBranch"]').disabled = !branch;
  $('[data-action="copyCommit"]').disabled = !commit;
  $('[data-action="linkBranch"]').disabled = !branch || !task || task.branches.includes(branch);
  $('[data-action="suggestGit"]').disabled = !task;
}

function modal(kind, id) {
  let collection = {
    client: "clients",
    project: "projects",
    person: "people",
    task: "tasks",
    activity: "activity",
    meeting: "meetings",
  }[kind],
    obj = data[collection].find((x) => x.id === id) || {},
    f = [];

  if (kind === "client")
    f = [
      field("Name", "name", "text", obj.name),
      field("Contact", "contact", "text", obj.contact),
      field(
        "Description",
        "description",
        "textarea",
        obj.description,
        [],
        true,
      ),
    ];

  if (kind === "project")
    f = [
      field(
        "Client",
        "clientId",
        "select",
        obj.clientId || data.clients[0]?.id,
        clientOptions(),
      ),
      field("Code", "code", "text", obj.code),
      field("Project name", "name", "text", obj.name),
      field(
        "Modules (one per line)",
        "modules",
        "textarea",
        (obj.modules || []).join("\n"),
        [],
        true,
      ),
      field(
        "Description",
        "description",
        "textarea",
        obj.description,
        [],
        true,
      ),
    ];

  if (kind === "person")
    f = [
      field(
        "Client",
        "clientId",
        "select",
        obj.clientId || data.clients[0]?.id,
        clientOptions(),
      ),
      field("Name", "name", "text", obj.name),
      field("Role", "role", "text", obj.role),
      field("Email", "email", "email", obj.email),
    ];

  if (kind === "task")
    f = [
      field(
        "Type",
        "kind",
        "select",
        obj.kind || "Feature",
        kinds.map((k) => [
          k,
          `${cc[k]} - ${{
            Feature: "Funcionalidade",
            Bug: "Correção",
            Hotfix: "Correção urgente",
            Refactor: "Refatoração",
            Fix: "Correção",
            Chore: "Manutenção",
            Docs: "Documentação",
            Test: "Testes",
            Perf: "Performance",
            Build: "Compilação",
            CI: "Integração contínua",
          }[k]
          }`,
        ]),
      ),
      field(
        "Project",
        "project",
        "select",
        obj.project || data.projects[0]?.id,
        projectOptions(),
      ),
      field("Module", "module", "select", obj.module || "", [], false),
      field("Date & time", "datetime", "datetime-local", obj.datetime || now()),
      field("Title", "title", "text", obj.title, [], true),
      field(
        "Status",
        "status",
        "select",
        obj.status || "Backlog",
        statuses.map((s) => [s, s]),
      ),
      `<div class="field wide"><span>Branches</span><div id="branchList" class="branch-list"></div><button type="button" class="btn" id="addBranch">+ Add branch</button></div>`,
      field(
        "Description",
        "description",
        "textarea",
        obj.description,
        [],
        true,
        "long",
      ),
    ];

  if (kind === "activity")
    f = [
      field(
        "Project",
        "project",
        "select",
        obj.project || data.projects[0]?.id,
        projectOptions(),
      ),
      field(
        "Related task",
        "taskId",
        "select",
        obj.taskId || "",
        [["", "No related task"]],
        false,
      ),
      field("Start", "start", "datetime-local", obj.start || now()),
      field("End", "end", "datetime-local", obj.end || now()),
      field("Title", "title", "text", obj.title, [], true),
      field(
        "Description",
        "description",
        "textarea",
        obj.description,
        [],
        true,
        "long",
      ),
    ];

  if (kind === "meeting")
    f = [
      field(
        "Project",
        "project",
        "select",
        obj.project || data.projects[0]?.id,
        projectOptions(),
      ),
      field("Start", "start", "datetime-local", obj.start || now()),
      field("End", "end", "datetime-local", obj.end || now()),
      field("Title", "title", "text", obj.title, [], true),
      `<div class="field wide"><span>Attendees (from project client)</span><div id="peopleChecks"></div></div>`,
      field(
        "Description / Minutes",
        "description",
        "textarea",
        obj.description,
        [],
        true,
        "long",
      ),
      field("Decisions", "decisions", "textarea", obj.decisions, [], true),
    ];
  $("#modalTitle").textContent =
    (id ? "Edit " : "New ") + kind[0].toUpperCase() + kind.slice(1);
  $("#modalFields").classList.toggle("edit-task-fields", kind === "task" && Boolean(id));
  $("#modalFields").innerHTML = f.join("");
  $("#modal").showModal();

  if (kind === "task") {
    let update = () => {
      let p = project($("#modalFields [name=project]").value),
        current = $("#modalFields [name=module]").value || obj.module || "",
        mods = p?.modules || [];
      $("#modalFields [name=module]").innerHTML = [
        ["", "No module"],
        ...mods.map((m) => [m, m]),
      ]
        .map(
          ([v, l]) =>
            `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(l)}</option>`,
        )
        .join("");
    };
    $("#modalFields [name=project]").onchange = () => {
      obj.module = "";
      update();
    };
    update();

    const addBranch = (v) => {
      let row = document.createElement("div");
      row.className = "branch-row";
      row.innerHTML = `<input class="mono" placeholder="feat/orders-create" value="${esc(v)}"><button type="button" class="btn">Remove</button>`;
      row.querySelector("button").onclick = () => row.remove();
      $("#branchList").append(row);
    };
    (obj.branches || []).forEach(addBranch);
    $("#addBranch").onclick = () => addBranch("");
  }

  if (kind === "activity") {
    let update = () => {
      let pid = $("#modalFields [name=project]").value,
        old = $("#modalFields [name=taskId]").value || obj.taskId || "";
      $("#modalFields [name=taskId]").innerHTML = [
        ["", "No related task"],
        ...data.tasks
          .filter((t) => t.project === pid)
          .map((t) => [t.id, t.title]),
      ]
        .map(
          ([v, l]) =>
            `<option value="${esc(v)}" ${v === old ? "selected" : ""}>${esc(l)}</option>`,
        )
        .join("");
    };
    $("#modalFields [name=project]").onchange = () => {
      obj.taskId = "";
      update();
    };
    update();
  }

  if (kind === "meeting") {
    let update = () => {
      let ppl = peopleForProject($("#modalFields [name=project]").value);
      $("#peopleChecks").innerHTML =
        ppl
          .map(
            (p) =>
              `<label style="display:inline-flex;align-items:center;gap:6px;margin:5px 15px 5px 0"><input type="checkbox" name="attendee" value="${esc(p.id)}" ${(obj.peopleIds || []).includes(p.id) ? "checked" : ""}>${esc(p.name)}</label>`,
          )
          .join("") ||
        '<span class="muted">No people registered for this client</span>';
    };
    $("#modalFields [name=project]").onchange = update;
    update();
  }
  $("#modalForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const v = Object.fromEntries(new FormData(e.target));
      if (kind === "project")
        v.modules = String(v.modules || "")
          .split(/\r?\n|,/)
          .map((x) => x.trim())
          .filter(Boolean);
      if (kind === "task")
        v.branches = [...document.querySelectorAll("#branchList input")]
          .map((i) => i.value.trim())
          .filter(Boolean);
      if (kind === "meeting")
        v.peopleIds = [
          ...document.querySelectorAll("#peopleChecks input:checked"),
        ].map((i) => i.value);
      if ((kind === "activity" || kind === "meeting") && v.end < v.start) {
        toast("End must be after start.", "error");
        return;
      }
      const success = await persistChange(() => {
        const existing = id ? data[collection].find((x) => x.id === id) : null;
        if (existing) Object.assign(existing, v);
        else data[collection].push({ id: uid(), ...v });
      });
      if (!success) return;
      $("#modal").close();
      toast((id ? "Updated " : "Added ") + kind + " successfully.");
    } catch (error) {
      console.error("Form save failed:", error);
      toast("Unable to save: " + error.message, "error");
    }
  };
}

let docFiles = new Map();

function docs() {
  $("#main").innerHTML =
    heading("Documentation") +
    `<section id="docsLayout"><div class="card docs-toolbar"><button class="btn primary" id="openDocs">Open docs folder</button><input id="folderInput" type="file" webkitdirectory directory multiple hidden><select id="docSelect"><option value="">Select Markdown file</option></select><button class="btn" id="refreshDocs">Refresh</button><button class="btn" id="fullDocs">Full screen</button></div><article id="docsContent" class="card markdown-body"><h1>Documentation</h1><p>Select the docs folder.</p></article></section>`;
  $("#openDocs").onclick = openDocs;
  $("#folderInput").onchange = (e) => {
    docsFolder = null;
    docFiles = new Map(
      [...e.target.files]
        .filter((f) => /\.md$/i.test(f.name))
        .map((f) => [f.webkitRelativePath.split("/").slice(1).join("/"), f]),
    );
    docsSelect();
  };
  $("#refreshDocs").onclick = () =>
    docsFolder ? scanDocs(docsFolder) : $("#openDocs").click();
  $("#docSelect").onchange = (e) => readDoc(e.target.value);
  $("#fullDocs").onclick = () => {
    let el = $("#docsLayout");
    el.classList.toggle("docs-fullscreen");
    $("#fullDocs").textContent = el.classList.contains("docs-fullscreen")
      ? "Exit full screen"
      : "Full screen";
  };

  if (docFiles.size) docsSelect();
  else loadDefaultDocs();
}

async function loadDefaultDocs() {
  const content = $("#docsContent");

  if (location.protocol === "file:") {
    content.innerHTML =
      "<h2>docs/</h2><p>Click <strong>Open docs folder</strong> once to grant access. Browsers do not allow automatic local folder access.</p>";
    return;
  }

  try {
    const r = await fetch("docs/index.json", { cache: "no-store" });

    if (!r.ok) throw Error("index unavailable");

    const index = await r.json();

    const names = Array.isArray(index)
      ? index
      : index.files || index.documents || [];

    const files = new Map();

    for (const entry of names) {
      const name = typeof entry === "string" ? entry : entry.file || entry.path;

      if (!name || !name.toLowerCase().endsWith(".md") || name.includes(".."))
        continue;

      const response = await fetch("docs/" + name, { cache: "no-store" });

      if (response.ok) {
        const md = await response.text();
        files.set(name, new File([md], name, { type: "text/markdown" }));
      }
    }

    if (files.size) {
      docFiles = files;
      docsSelect();
      toast("Documentation loaded from docs/.");
    } else content.textContent = "No Markdown files found in docs/.";
  } catch (e) {
    content.innerHTML =
      "<h2>docs/</h2><p>Click Open docs folder to select the local documentation directory.</p>";
  }
}

async function openDocs() {
  if (window.showDirectoryPicker && window.isSecureContext) {
    try {
      docsFolder = await window.showDirectoryPicker({
        mode: "read",
        id: "worklog-docs",
      });
      await scanDocs(docsFolder);
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  $("#folderInput").click();
}

async function scanDocs(folder) {
  let files = new Map();
  async function walk(dir, prefix = "") {
    for await (let [name, handle] of dir.entries()) {
      if (handle.kind === "directory") await walk(handle, prefix + name + "/");
      else if (/\.md$/i.test(name)) files.set(prefix + name, handle);
    }
  }
  await walk(folder);
  docFiles = files;
  docsSelect();
}

function docsSelect() {
  let names = [...docFiles.keys()].sort(),
    select = $("#docSelect");
  select.innerHTML =
    names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("") ||
    "<option>No Markdown files</option>";

  if (names.length)
    readDoc(names.includes(docsCurrent) ? docsCurrent : names[0]);
}

async function readDoc(name) {
  if (!docFiles.has(name)) return;
  docsCurrent = name;
  $("#docSelect").value = name;

  try {
    let f = docFiles.get(name),
      raw = await (f instanceof File ? f : f.getFile()),
      txt = await raw.text();

    if (window.marked && window.DOMPurify) {
      $("#docsContent").innerHTML = DOMPurify.sanitize(marked.parse(txt));
      $("#docsContent")
        .querySelectorAll("img")
        .forEach((i) => i.remove());
      $("#docsContent")
        .querySelectorAll("a")
        .forEach((a) => {
          if (!/^https?:$/.test(new URL(a.href, location.href).protocol))
            a.removeAttribute("href");
          else {
            a.target = "_blank";
            a.rel = "noopener noreferrer";
          }
        });
    } else $("#docsContent").textContent = txt;
  } catch (e) {
    $("#docsContent").textContent = "Unable to load Markdown file.";
  }
}

$("#nav").onclick = (e) => {
  let b = e.target.closest("[data-tab]");

  if (b) {
    tab = b.dataset.tab;
    render();
  }
};

$("#main").onclick = async (e) => {
  let d = e.target.closest("[data-date]");

  if (d) {
    editingAttendance = false;
    selected = d.dataset.date;
    month = new Date(selected + "T12:00");
    month.setDate(1);
    render();
    $(`[data-date="${selected}"]`)?.focus();
    return;
  }

  let sub = e.target.closest("[data-sub]");

  if (sub) {
    if (tab === "projects") subProjects = sub.dataset.sub;
    else subMeetings = sub.dataset.sub;
    render();
    return;
  }

  const colorButton = e.target.closest("[data-task-color]");
  if (colorButton) {
    const taskId = colorButton.closest("[data-task]").dataset.task;
    const task = data.tasks.find((item) => item.id === taskId);
    const color = colorButton.dataset.taskColor;
    if (task && Object.hasOwn(taskColors, color)) {
      await persistChange(() => {
        if (task.color === color) delete task.color;
        else task.color = color;
      });
    }
    return;
  }

  let edit = e.target.closest("[data-edit]");

  if (edit) {
    let [kind, id] = edit.dataset.edit.split(":");
    modal(kind, id);
    return;
  }

  let action = e.target.closest("[data-action]")?.dataset.action;

  if (!action) return;
  switch (action) {
    case "prevMonth":
      month.setMonth(month.getMonth() - 1);
      render();
      break;
    case "nextMonth":
      month.setMonth(month.getMonth() + 1);
      render();
      break;
    case "today":
      editingAttendance = false;
      selected = today();
      month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      render();
      break;
    case "editAttendance":
      editingAttendance = true;
      render();
      $("#attendanceForm [name=mode]").focus();
      break;
    case "cancelAttendance":
      editingAttendance = false;
      render();
      $("#main [data-action=editAttendance]").focus();
      break;
    case "deleteAttendance": {
      const date = selected;
      if (!confirm(`Delete attendance for ${dateName(date)}?`)) break;
      await updateAttendance(() => {
        data.attendance = data.attendance.filter((record) => record.date !== date);
      }, "Attendance deleted.");
      break;
    }
    case "punchAttendance": {
      const date = selected;
      const record = attendance(date);
      if (date !== today() || record?.end || record?.mode === "Off") break;
      const nextIndex = punchSteps.findIndex(([key]) => !record?.[key]);
      if (nextIndex === -1) break;
      const [key, label] = punchSteps[nextIndex];
      const time = now().slice(11);
      const previous = record?.[punchSteps[nextIndex - 1]?.[0]];
      if (previous && time < previous) {
        toast("The current time is earlier than the previous punch. Edit attendance to correct it.", "error");
        break;
      }
      const mode = $("#main [name=mode]")?.value || "Remote";
      if (mode === "Off") {
        toast("Use Add attendance to record a day off.", "error");
        break;
      }
      await updateAttendance(() => {
        if (!record) {
          data.attendance.push({ date, mode, start: time, breakMin: 0, notes: "" });
          return;
        }
        record[key] = time;
        if (key === "breakEnd") {
          record.breakMin = minutes(date + "T" + record.breakStart, date + "T" + time);
        }
      }, `${label} recorded.`);
      break;
    }
    case "newClient":
      modal("client");
      break;
    case "newProject":
      modal("project");
      break;
    case "newTask":
      modal("task");
      break;
    case "newActivity":
      modal("activity");
      break;
    case "newMeeting":
      modal("meeting");
      break;
    case "newPerson":
      modal("person");
      break;
    case "pdf":
      exportPDF();
      break;
    case "suggestGit":
      gitAutofill();
      break;
    case "copyBranch":
      navigator.clipboard?.writeText($("#gitBranch").textContent);
      break;
    case "copyCommit":
      navigator.clipboard?.writeText($("#gitCommit").textContent);
      break;
    case "linkBranch": {
      const taskId = $("#gitTask").value;
      const branch = $("#gitBranch").textContent;
      const t = data.tasks.find((x) => x.id === taskId && x.status === "In Progress");
      if (t && branch && !t.branches.includes(branch)) {
        await persistChange(() => {
          const task = data.tasks.find((x) => x.id === taskId);
          if (task && !task.branches.includes(branch))
            task.branches.push(branch);
        }, "Branch linked to task.");
      }
      break;
    }
  }
};

$("#cancelModal").onclick = $("#closeModal").onclick = () =>
  $("#modal").close();

$("#themeBtn").onclick = () => {
  document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
};
document.documentElement.dataset.theme = "light";

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    $("#docsLayout")?.classList.contains("docs-fullscreen")
  ) {
    $("#docsLayout").classList.remove("docs-fullscreen");
    $("#fullDocs").textContent = "Full screen";
  }
});

loadData().catch((error) => {
  console.error("Unable to initialize Worklog:", error);
  $("#main").innerHTML =
    `<section class="card panel"><h2>Unable to load data.json</h2><p>${esc(error.message)}</p><p>Start the application with <code>node server.js</code> and reload the page.</p></section>`;
});
