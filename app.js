const storageKey = "job-tracker-applications-v1";
const apiBase = "/api/applications";
const statuses = ["已投递", "有回应", "面试中", "Offer", "已拒绝", "已放弃"];

const form = document.querySelector("#applicationForm");
const editForm = document.querySelector("#editForm");
const editDialog = document.querySelector("#editDialog");
const closeEditBtn = document.querySelector("#closeEditBtn");
const list = document.querySelector("#applicationList");
const template = document.querySelector("#applicationTemplate");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const startDateFilter = document.querySelector("#startDateFilter");
const endDateFilter = document.querySelector("#endDateFilter");
const clearFiltersBtn = document.querySelector("#clearFiltersBtn");
const exportBtn = document.querySelector("#exportBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const mapStage = document.querySelector("#mapStage");
const downloadMapBtn = document.querySelector("#downloadMapBtn");

const counters = {
  total: document.querySelector("#totalCount"),
  active: document.querySelector("#activeCount"),
  interview: document.querySelector("#interviewCount"),
  reply: document.querySelector("#replyRate"),
};

let applications = readCachedApplications();
let visibleApplications = [];

form.date.valueAsDate = new Date();
render();
loadApplications();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const savedItem = await createApplication(formToApplication(new FormData(form)));
  applications.unshift(savedItem);
  cacheApplications();
  form.reset();
  form.date.valueAsDate = new Date();
  form.priority.value = "中";
  render();
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(editForm);
  const id = data.get("id");
  const original = applications.find((item) => item.id === id);
  if (!original) return;

  const nextItem = {
    ...original,
    ...formToApplication(data),
    id,
    createdAt: original.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const savedItem = await updateApplication(id, nextItem);
  applications = applications.map((item) => (item.id === id ? savedItem : item));
  cacheApplications();
  editDialog.close();
  render();
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
startDateFilter.addEventListener("change", render);
endDateFilter.addEventListener("change", render);
downloadMapBtn.addEventListener("click", downloadMap);
closeEditBtn.addEventListener("click", () => editDialog.close());

clearFiltersBtn.addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "全部";
  startDateFilter.value = "";
  endDateFilter.value = "";
  render();
});

sampleBtn.addEventListener("click", () => {
  form.company.value = "Atlassian";
  form.role.value = "Frontend Engineer";
  form.source.value = "官网";
  form.status.value = "已投递";
  form.priority.value = "高";
  form.notes.value = "使用英文简历 v3，三天后检查是否需要 follow-up。";
  form.company.focus();
});

exportBtn.addEventListener("click", () => {
  if (!visibleApplications.length) return;
  const headers = ["公司", "岗位", "投递日期", "渠道", "状态", "优先级", "链接", "备注"];
  const rows = visibleApplications.map((item) => [
    item.company,
    item.role,
    item.date,
    item.source,
    item.status,
    item.priority,
    item.link,
    item.notes,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `投递记录-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
});

function render() {
  visibleApplications = getFilteredApplications();
  list.replaceChildren();
  visibleApplications.forEach((item) => list.appendChild(createCard(item)));
  emptyState.style.display = visibleApplications.length ? "none" : "block";
  updateStats(visibleApplications);
  renderMap(visibleApplications);
}

function getFilteredApplications() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const startDate = startDateFilter.value;
  const endDate = endDateFilter.value;

  return applications
    .filter((item) => status === "全部" || item.status === status)
    .filter((item) => !startDate || item.date >= startDate)
    .filter((item) => !endDate || item.date <= endDate)
    .filter((item) => {
      const haystack = [item.company, item.role, item.source, item.notes, item.status]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function createCard(item) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.querySelector('[data-field="role"]').textContent = item.role;
  card.querySelector('[data-field="company"]').textContent = item.company;
  card.querySelector('[data-field="date"]').textContent = formatDate(item.date);
  card.querySelector('[data-field="source"]').textContent = item.source;
  card.querySelector('[data-field="priority"]').textContent = `${item.priority}优先级`;
  card.querySelector('[data-field="notes"]').textContent = item.notes || "无备注";

  const pill = card.querySelector('[data-field="status"]');
  pill.textContent = item.status;
  pill.classList.toggle("interview", item.status === "面试中");
  pill.classList.toggle("offer", item.status === "Offer");
  pill.classList.toggle("rejected", item.status === "已拒绝" || item.status === "已放弃");

  const link = card.querySelector('[data-field="link"]');
  if (item.link) {
    link.href = item.link;
  } else {
    link.hidden = true;
  }

  const statusSelect = card.querySelector('[data-action="status"]');
  statuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    option.selected = status === item.status;
    statusSelect.appendChild(option);
  });
  statusSelect.addEventListener("change", () => changeStatus(item, statusSelect.value));

  card.querySelector('[data-action="edit"]').addEventListener("click", () => openEditDialog(item));
  card.querySelector(".delete-button").addEventListener("click", () => removeApplication(item));

  return card;
}

async function changeStatus(item, status) {
  const previousStatus = item.status;
  item.status = status;
  cacheApplications();
  render();

  try {
    const savedItem = await updateApplication(item.id, { ...item, status });
    applications = applications.map((candidate) => (candidate.id === item.id ? savedItem : candidate));
    cacheApplications();
    render();
  } catch {
    item.status = previousStatus;
    cacheApplications();
    render();
    alert("状态没有同步到 Mac，请确认服务器还在运行。");
  }
}

async function removeApplication(item) {
  const previousApplications = applications;
  applications = applications.filter((candidate) => candidate.id !== item.id);
  cacheApplications();
  render();

  try {
    await deleteApplication(item.id);
  } catch {
    applications = previousApplications;
    cacheApplications();
    render();
    alert("删除没有同步到 Mac，请确认服务器还在运行。");
  }
}

function openEditDialog(item) {
  editForm.id.value = item.id;
  editForm.company.value = item.company;
  editForm.role.value = item.role;
  editForm.date.value = item.date;
  editForm.source.value = item.source;
  editForm.status.value = item.status;
  editForm.priority.value = item.priority;
  editForm.link.value = item.link;
  editForm.notes.value = item.notes;
  editDialog.showModal();
}

function updateStats(items) {
  const total = items.length;
  const active = items.filter((item) => !["已拒绝", "已放弃"].includes(item.status)).length;
  const interview = items.filter((item) => ["面试中", "Offer"].includes(item.status)).length;
  const replied = items.filter((item) => ["有回应", "面试中", "Offer"].includes(item.status)).length;

  counters.total.textContent = total;
  counters.active.textContent = active;
  counters.interview.textContent = interview;
  counters.reply.textContent = total ? `${Math.round((replied / total) * 100)}%` : "0%";
}

function renderMap(items) {
  const counts = getFlowCounts(items);
  const nodes = [
    node("投递", counts.total, 74, 150, "root"),
    node("无回应", counts.noReply, 290, 74, "muted"),
    node("有回应", counts.replied, 290, 226, "reply"),
    node("面试", counts.interview, 510, 226, "interview"),
    node("被拒", counts.rejected, 730, 106, "rejected"),
    node("Offer", counts.offer, 730, 226, "offer"),
    node("放弃", counts.abandoned, 730, 346, "muted"),
  ];
  const edges = [
    edge(164, 150, 222, 74),
    edge(164, 150, 222, 226),
    edge(380, 226, 442, 226),
    edge(600, 226, 662, 106),
    edge(600, 226, 662, 226),
    edge(600, 226, 662, 346),
  ];

  mapStage.innerHTML = `
    <svg id="flowMapSvg" viewBox="0 0 850 430" role="img" aria-label="投递路径图">
      <defs>
        <filter id="softShadow" x="-20%" y="-30%" width="140%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#1d1d1f" flood-opacity="0.12"/>
        </filter>
      </defs>
      ${edges.join("")}
      ${nodes.join("")}
    </svg>
  `;
}

function getFlowCounts(items) {
  return {
    total: items.length,
    noReply: items.filter((item) => item.status === "已投递").length,
    replied: items.filter((item) => item.status !== "已投递").length,
    interview: items.filter((item) => ["面试中", "Offer", "已拒绝"].includes(item.status)).length,
    rejected: items.filter((item) => item.status === "已拒绝").length,
    offer: items.filter((item) => item.status === "Offer").length,
    abandoned: items.filter((item) => item.status === "已放弃").length,
  };
}

function node(label, count, x, y, tone) {
  return `
    <g class="map-node ${tone}" transform="translate(${x} ${y})" filter="url(#softShadow)">
      <rect width="92" height="66" rx="16"/>
      <text x="46" y="27" text-anchor="middle">${label}</text>
      <text class="count" x="46" y="50" text-anchor="middle">${count}</text>
    </g>
  `;
}

function edge(x1, y1, x2, y2) {
  const mid = (x1 + x2) / 2;
  return `<path class="map-edge" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}"/>`;
}

function downloadMap() {
  const svg = document.querySelector("#flowMapSvg");
  if (!svg) return;
  const source = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `投递路径图-${new Date().toISOString().slice(0, 10)}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadApplications() {
  try {
    const response = await fetch(apiBase);
    if (!response.ok) throw new Error("Unable to load applications");
    const serverApplications = await response.json();
    applications = await syncCachedApplications(serverApplications);
    cacheApplications();
    render();
  } catch {
    render();
  }
}

async function syncCachedApplications(serverApplications) {
  const merged = [...serverApplications];
  const cachedApplications = readCachedApplications();
  const missingApplications = cachedApplications.filter(
    (item) => !merged.some((candidate) => isSameApplication(candidate, item)),
  );

  for (const item of missingApplications) {
    const response = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (response.ok) {
      merged.unshift(await response.json());
    }
  }

  return merged;
}

function isSameApplication(a, b) {
  return (
    a.id === b.id ||
    [a.company, a.role, a.date, a.createdAt].join("|") ===
      [b.company, b.role, b.date, b.createdAt].join("|")
  );
}

function formToApplication(data) {
  return {
    company: data.get("company").trim(),
    role: data.get("role").trim(),
    date: data.get("date"),
    source: data.get("source"),
    status: data.get("status"),
    priority: data.get("priority"),
    link: data.get("link").trim(),
    notes: data.get("notes").trim(),
    createdAt: new Date().toISOString(),
  };
}

async function createApplication(item) {
  try {
    const response = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!response.ok) throw new Error("Unable to save application");
    return await response.json();
  } catch {
    alert("没有同步到 Mac，已先保存在这个浏览器里。请确认服务器还在运行。");
    return { ...item, id: createId() };
  }
}

async function updateApplication(id, item) {
  const response = await fetch(`${apiBase}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!response.ok) throw new Error("Unable to update application");
  return await response.json();
}

async function deleteApplication(id) {
  const response = await fetch(`${apiBase}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Unable to delete application");
}

function readCachedApplications() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? [];
  } catch {
    return [];
  }
}

function cacheApplications() {
  localStorage.setItem(storageKey, JSON.stringify(applications));
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(value) {
  if (!value) return "未填写日期";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
