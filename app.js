const storageKey = "job-tracker-applications-v1";
const apiBase = "/api/applications";
const statuses = ["已投递", "有回应", "面试中", "Offer", "已拒绝", "已放弃"];

const form = document.querySelector("#applicationForm");
const list = document.querySelector("#applicationList");
const template = document.querySelector("#applicationTemplate");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const exportBtn = document.querySelector("#exportBtn");
const sampleBtn = document.querySelector("#sampleBtn");

const counters = {
  total: document.querySelector("#totalCount"),
  active: document.querySelector("#activeCount"),
  interview: document.querySelector("#interviewCount"),
  reply: document.querySelector("#replyRate"),
};

let applications = readCachedApplications();

form.date.valueAsDate = new Date();
render();
loadApplications();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const item = {
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
  const savedItem = await createApplication(item);
  applications.unshift(savedItem);
  cacheApplications();
  form.reset();
  form.date.valueAsDate = new Date();
  form.priority.value = "中";
  render();
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);

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
  if (!applications.length) return;
  const headers = ["公司", "岗位", "投递日期", "渠道", "状态", "优先级", "链接", "备注"];
  const rows = applications.map((item) => [
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
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const filtered = applications
    .filter((item) => status === "全部" || item.status === status)
    .filter((item) => {
      const haystack = [item.company, item.role, item.source, item.notes, item.status]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  list.replaceChildren();
  filtered.forEach((item) => list.appendChild(createCard(item)));
  emptyState.style.display = filtered.length ? "none" : "block";
  updateStats();
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
  statusSelect.addEventListener("change", () => {
    const previousStatus = item.status;
    item.status = statusSelect.value;
    updateApplicationStatus(item.id, item.status).catch(() => {
      item.status = previousStatus;
      cacheApplications();
      render();
      alert("状态没有同步到 Mac，请确认服务器还在运行。");
    });
    cacheApplications();
    render();
  });

  card.querySelector(".delete-button").addEventListener("click", () => {
    const previousApplications = applications;
    applications = applications.filter((candidate) => candidate.id !== item.id);
    deleteApplication(item.id).catch(() => {
      applications = previousApplications;
      cacheApplications();
      render();
      alert("删除没有同步到 Mac，请确认服务器还在运行。");
    });
    cacheApplications();
    render();
  });

  return card;
}

function updateStats() {
  const total = applications.length;
  const active = applications.filter((item) => !["已拒绝", "已放弃"].includes(item.status)).length;
  const interview = applications.filter((item) => item.status === "面试中").length;
  const replied = applications.filter((item) => ["有回应", "面试中", "Offer"].includes(item.status)).length;

  counters.total.textContent = total;
  counters.active.textContent = active;
  counters.interview.textContent = interview;
  counters.reply.textContent = total ? `${Math.round((replied / total) * 100)}%` : "0%";
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

async function updateApplicationStatus(id, status) {
  const response = await fetch(`${apiBase}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error("Unable to update status");
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
