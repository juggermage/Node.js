const API = "/api/v1";
const LIFECYCLE_ENTITIES = new Set([
  "children",
  "parents",
  "groups",
  "employees",
  "rooms",
  "subjects"
]);
const resources = [
  {
    group: "Основне",
    items: [
      ["children", "Діти", "/children"],
      ["parents", "Батьки", "/parents"],
      ["child-parent", "Зв’язки дітей і батьків", "/child-parent"],
      ["groups", "Групи", "/groups"],
      ["rooms", "Кімнати", "/rooms"],
      ["attendance", "Відвідуваність", "/attendance"]
    ]
  },
  {
    group: "Персонал і навчання",
    items: [
      ["employees", "Працівники", "/employees"],
      ["staff-assignments", "Призначення персоналу", "/staff-assignments"],
      ["subjects", "Предмети", "/subjects"],
      ["teacher-subject", "Предмети викладачів", "/teacher-subject"],
      ["schedules", "Розклад", "/schedules"]
    ]
  },
  {
    group: "Фінанси",
    items: [
      ["invoices", "Рахунки", "/billing/invoices"],
      ["payments", "Платежі", "/billing/payments"],
      ["tuition", "Тарифи навчання", "/billing/tuition/rates"],
      ["meals", "Харчування", "/meals/rates"],
      ["discounts", "Знижки", "/billing/discounts"],
      ["salaries", "Зарплати", "/billing/salaries/rates"],
      ["expenses", "Витрати", "/billing/expenses"]
    ]
  },
  {
    group: "Аналітика",
    items: [
      ["analytics", "Аналітика", "/analytics"],
      ["audit", "Журнал аудиту", "/audit"]
    ]
  }
];
let token = localStorage.getItem("kg_token") || "";
let currentResource = null;
let currentRecords = [];
let currentPage = 1;
let pageSize = 20;
let editId = null;
let compareScenarios = [];
const $ = (id) => document.getElementById(id);
const headers = () => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});
const toast = (message) => {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 3200);
};
function showView(id, title) {
  ["dashboard", "entity-view", "optimizer-view"].forEach((key) => $(key).classList.add("hidden"));
  $(id).classList.remove("hidden");
  $("page-title").textContent = title;
}
function buildNavigation() {
  const nav = $("navigation");
  nav.innerHTML =
    '<button class="nav-item active" data-view="dashboard">⌂ Огляд</button><button class="nav-item" data-view="optimizer">▦ Оптимізатор</button>';
  resources.forEach((section) => {
    nav.insertAdjacentHTML(
      "beforeend",
      `<div class="nav-label">${section.group.toUpperCase()}</div>`
    );
    section.items.forEach(([key, label]) =>
      nav.insertAdjacentHTML(
        "beforeend",
        `<button class="nav-item" data-resource="${key}">${label}</button>`
      )
    );
  });
  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    if (button.dataset.resource) openResource(button.dataset.resource);
    else if (button.dataset.view === "optimizer") openOptimizer();
    else openDashboard();
  });
}
async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error?.message || payload.message || `HTTP ${response.status}`);
  let data = payload.data ?? payload;
  if (
    data &&
    !Array.isArray(data) &&
    typeof data === "object" &&
    Object.keys(data).length === 1 &&
    data.data !== undefined
  )
    data = data.data;
  return data;
}

function tokenPayload() {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}
function configureDeveloperConsole() {
  const role = String(tokenPayload().role || tokenPayload().user?.role || "").toUpperCase();
  $("api-console").classList.toggle("hidden", !["DEVELOPER", "SUPER_ADMIN"].includes(role));
}
async function loadAudit() {
  const params = new URLSearchParams();
  const entity = $("audit-entity").value,
    action = $("audit-action").value,
    limit = $("audit-limit").value;
  if (entity) params.set("entityType", entity);
  if (action) params.set("action", action);
  params.set("limit", limit);
  const result = await request(`/audit?${params.toString()}`);
  currentRecords = normalizeCollection(result);
  $("table-head").innerHTML =
    "<tr><th>Час</th><th>Сутність</th><th>Дія</th><th>Ідентифікатор запису</th><th>Зміни</th></tr>";
  $("table-body").innerHTML = currentRecords
    .map(
      (item) =>
        `<tr><td>${escapeHtml(new Date(item.createdAt).toLocaleString("uk-UA"))}</td><td>${escapeHtml(item.entityType)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entityId)}</td><td><button class="table-action" data-audit="${item.id}">Деталі</button></td></tr>`
    )
    .join("");
  $("empty-state").classList.toggle("hidden", currentRecords.length > 0);
  $("table-body").onclick = async (e) => {
    const b = e.target.closest("[data-audit]");
    if (!b) return;
    try {
      const item = await request(`/audit/${b.dataset.audit}`);
      const detail = document.createElement("div");
      detail.className = "audit-detail-overlay";
      detail.innerHTML = `<section class="audit-detail-card"><div class="panel-heading"><div><p class="eyebrow">ДЕТАЛІ АУДИТУ</p><h3>${escapeHtml(item.entityType)} · ${escapeHtml(item.action)}</h3></div><button class="icon-button" type="button">✕</button></div><div class="audit-change-grid"><div><h4>Було</h4><pre>${escapeHtml(JSON.stringify(item.before, null, 2) || "—")}</pre></div><div><h4>Стало</h4><pre>${escapeHtml(JSON.stringify(item.after, null, 2) || "—")}</pre></div></div></section>`;
      document.body.appendChild(detail);
      detail.querySelector("button").onclick = () => detail.remove();
      detail.onclick = (e) => {
        if (e.target === detail) detail.remove();
      };
    } catch (err) {
      toast(err.message);
    }
  };
}
function authState() {
  const loggedIn = Boolean(token);
  $("login-panel").classList.toggle("hidden", loggedIn);
  $("dashboard").classList.toggle("hidden", !loggedIn);
  $("entity-view").classList.add("hidden");
  $("optimizer-view").classList.add("hidden");
  $("user-label").textContent = loggedIn ? "Сесія активна" : "Не авторизовано";
}
async function checkApi() {
  try {
    await fetch(`${API}/health`);
    $("api-status").textContent = "підключено";
  } catch {
    $("api-status").textContent = "недоступний";
  }
}
async function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    const result = await request("/auth/login", { method: "POST", body: JSON.stringify(data) });
    token = result.token || result.accessToken || result.data?.token || "";
    if (!token) throw new Error("У відповіді API не знайдено токен авторизації");
    localStorage.setItem("kg_token", token);
    authState();
    openDashboard();
  } catch (error) {
    $("login-error").textContent = error.message;
  }
}
function openDashboard() {
  showView("dashboard", "Огляд");
  $("today").textContent = new Intl.DateTimeFormat("uk-UA", { dateStyle: "long" }).format(
    new Date()
  );
  $("quick-links").innerHTML = resources
    .flatMap((s) => s.items)
    .slice(0, 9)
    .map(([key, label]) => `<button class="quick-link" data-quick="${key}">${label} →</button>`)
    .join("");
  $("quick-links").onclick = (e) => {
    const b = e.target.closest("[data-quick]");
    if (b) openResource(b.dataset.quick);
  };
  $("overview-stats").innerHTML = [
    ["Групові кімнати", "12"],
    ["Спеціалізовані кімнати", "8"],
    ["Максимальна місткість", "240"],
    ["Оренда / місяць", "50 000 ₴"]
  ]
    .map(([a, b]) => `<div class="stat-card"><span>${a}</span><strong>${b}</strong></div>`)
    .join("");
}
function findResource(key) {
  return resources.flatMap((s) => s.items).find((item) => item[0] === key);
}
function fieldsFor(record) {
  return Object.keys(record || {})
    .filter(
      (k) =>
        ![
          "passwordHash",
          "tokenVersion",
          "id",
          "_id",
          "createdAt",
          "updatedAt",
          "archivedAt",
          "deletedAt",
          "createdBy",
          "updatedBy",
          "tokenVersion"
        ].includes(k) &&
        ![
          "parents",
          "children",
          "group",
          "employee",
          "room",
          "enrollments",
          "payments",
          "invoices",
          "items",
          "history",
          "mainRoom"
        ].includes(k)
    )
    .slice(0, 8);
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}
function normalizeEntityRecord(record) {
  let value = record;
  const wrappers = ["data", "item", "record"];
  while (value && typeof value === "object" && !Array.isArray(value)) {
    const wrapper = wrappers.find(
      (key) => value[key] && typeof value[key] === "object" && !Array.isArray(value[key])
    );
    if (!wrapper) break;
    value = value[wrapper];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = { ...value };
  if (!normalized.id && normalized._id) normalized.id = String(normalized._id);
  return normalized;
}
function normalizeCollection(result) {
  let value = result;
  for (let i = 0; i < 3 && value && !Array.isArray(value) && typeof value === "object"; i++) {
    if (Array.isArray(value.items)) {
      value = value.items;
      break;
    }
    if (Array.isArray(value.records)) {
      value = value.records;
      break;
    }
    if (Array.isArray(value.data)) {
      value = value.data;
      break;
    }
    if (value.data && typeof value.data === "object") {
      value = value.data;
      continue;
    }
    break;
  }
  return Array.isArray(value) ? value.map(normalizeEntityRecord) : [];
}
function unwrapRecord(result) {
  return normalizeEntityRecord(result);
}
function humanizeKey(key) {
  return (
    {
      firstName: "Ім’я",
      lastName: "Прізвище",
      birthDate: "Дата народження",
      dietaryNotes: "Дієтичні примітки",
      notes: "Примітки",
      phone: "Телефон",
      email: "Email",
      name: "Назва",
      status: "Статус",
      capacity: "Місткість",
      mealCategory: "Вікова категорія харчування",
      ageFromMonths: "Вік від",
      ageToMonths: "Вік до",
      mainRoomId: "Групова кімната",
      childId: "Дитина",
      parentId: "Батько / мати",
      groupId: "Група",
      roomId: "Кімната",
      subjectId: "Предмет",
      employeeId: "Працівник",
      date: "Дата",
      amount: "Сума / тариф",
      percentage: "Відсоток",
      value: "Відсоток знижки",
      validFrom: "Діє з",
      validTo: "Діє до",
      category: "Вікова категорія",
      isActive: "Активна",
      description: "Опис",
      purpose: "Призначення",
      role: "Посада",
      employeeCode: "Табельний номер",
      relation: "Тип зв’язку",
      isPrimary: "Основний контакт"
    }[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
  );
}
function displayValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (
    ["birthDate", "date", "startDate", "endDate", "effectiveFrom", "paidAt", "dueDate"].includes(
      key
    )
  ) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("uk-UA");
  }
  if (["ageFromMonths", "ageToMonths"].includes(key))
    return `${(Number(value) / 12).toLocaleString("uk-UA", { maximumFractionDigits: 1 })} років`;
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  if (typeof value === "object")
    return Array.isArray(value)
      ? `${value.length} запис(ів)`
      : Object.entries(value)
          .map(([k, v]) => `${humanizeKey(k)}: ${displayValue(k, v)}`)
          .join(" · ");
  return String(value);
}

const SERVER_FIELDS = new Set([
  "id",
  "_id",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "deletedAt",
  "createdBy",
  "updatedBy",
  "childCode",
  "enrolledAt",
  "tokenVersion",
  "passwordHash"
]);
function cleanPayload(value) {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SERVER_FIELDS.has(key)) continue;
    if (
      [
        "parents",
        "children",
        "group",
        "employee",
        "room",
        "enrollments",
        "payments",
        "invoices",
        "items",
        "history",
        "mainRoom"
      ].includes(key)
    )
      continue;
    result[key] = cleanPayload(item);
  }
  if (typeof result.birthDate === "string") result.birthDate = result.birthDate.slice(0, 10);
  return result;
}
function analyticsMoney(value) {
  const amount = Number(value || 0) / 100;
  return `${amount.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
}

function setAnalyticsDefaults() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const format = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  $("analytics-from").value = format(first);
  $("analytics-to").value = format(now);
}

async function loadAnalytics() {
  const from = $("analytics-from").value;
  const to = $("analytics-to").value;
  if (!from || !to || from > to) throw new Error("Вкажіть коректний період аналітики.");
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const [summary, income, expenses, debts, profitability, groups, attendance] = await Promise.all([
    request(`/analytics/summary${query}`),
    request(`/analytics/income${query}`),
    request(`/analytics/expenses${query}`),
    request(`/analytics/debts${query}`),
    request(`/analytics/profitability${query}`),
    request(`/analytics/groups${query}`),
    request(`/analytics/attendance${query}`)
  ]);
  const cards = [
    ["Нарахований дохід", analyticsMoney(summary.income?.accrued)],
    ["Фактично отримано", analyticsMoney(summary.income?.received)],
    ["Усі витрати", analyticsMoney(summary.expenses?.total)],
    ["Операційний результат", analyticsMoney(profitability.operatingProfit)],
    ["Модельний результат з орендою", analyticsMoney(profitability.model?.modelProfit)],
    ["Заборгованість", analyticsMoney(debts.netOutstanding)]
  ];
  const categoryRows = (data) =>
    Object.entries(data || {})
      .map(
        ([name, value]) =>
          `<div class="finance-item"><span>${escapeHtml(name)}</span><strong>${analyticsMoney(value)}</strong></div>`
      )
      .join("") || '<p class="muted">За цей період даних немає.</p>';
  const groupRows = groups.groups || [];
  const attendanceSummary = attendance.summary || {};
  $("analytics-results").innerHTML = `
    <div class="stats-grid">${cards.map(([label, value]) => `<div class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
    <div class="panel-heading"><h3>Нарахований дохід за категоріями</h3></div><div class="finance-grid">${categoryRows(income.accrued?.byCategory)}</div>
    <div class="panel-heading"><h3>Фактично отриманий дохід</h3></div><div class="finance-grid">${categoryRows(income.received?.byCategory)}</div>
    <div class="panel-heading"><h3>Витрати за категоріями</h3></div><div class="finance-grid">${categoryRows(expenses.byCategory)}</div>
    <div class="panel-heading"><h3>Відвідуваність</h3></div><div class="finance-grid">${[
      ["Усього", attendanceSummary.total],
      ["Присутні", attendanceSummary.present],
      ["Відсутні", attendanceSummary.absent],
      ["Запізнення", attendanceSummary.late],
      ["Поважна причина", attendanceSummary.excused]
    ]
      .map(
        ([label, value]) =>
          `<div class="finance-item"><span>${label}</span><strong>${Number(value || 0)}</strong></div>`
      )
      .join("")}</div>
    <div class="panel-heading"><h3>Фінансові показники за групами</h3></div><div class="table-wrap"><table><thead><tr><th>Група</th><th>Нарахований дохід</th><th>Отримано</th><th>Витрати</th><th>Результат</th><th>Борг</th></tr></thead><tbody>${groupRows.map((group) => `<tr><td>${escapeHtml(group.groupName)}</td><td>${analyticsMoney(group.accruedIncome)}</td><td>${analyticsMoney(group.receivedIncome)}</td><td>${analyticsMoney(group.expenses)}</td><td>${analyticsMoney(group.profit)}</td><td>${analyticsMoney(group.outstandingBalance)}</td></tr>`).join("") || '<tr><td colspan="6">За цей період даних по групах немає.</td></tr>'}</tbody></table></div>
    <p class="muted">Період: ${escapeHtml(from)} — ${escapeHtml(to)}. Фінансові показники беруться з фактичних рахунків, платежів, витрат і зарплат у базі даних.</p>`;
}

function setScheduleGenerationDefaults() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const format = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  $("schedule-valid-from").value = format(start);
  $("schedule-valid-to").value = format(end);
  $("schedule-generation-result").textContent = "";
}

async function loadScheduleGroups() {
  const select = $("single-schedule-group");
  select.innerHTML = '<option value="">Завантаження груп...</option>';
  try {
    const groups = normalizeCollection(await request("/groups?status=ACTIVE"));
    select.innerHTML =
      '<option value="">Оберіть групу</option>' +
      groups
        .map((group) => {
          const count = group._count?.enrollments ?? 0;
          return `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)} (${count} дітей)</option>`;
        })
        .join("");
    if (!groups.length) select.innerHTML = '<option value="">Немає активних груп</option>';
  } catch (error) {
    select.innerHTML = '<option value="">Не вдалося завантажити групи</option>';
    $("single-schedule-result").textContent = `Помилка завантаження груп: ${error.message}`;
  }
}

async function generateSingleSchedule() {
  const button = $("generate-single-schedule");
  try {
    const groupId = $("single-schedule-group").value;
    const validFrom = $("schedule-valid-from").value;
    const validTo = $("schedule-valid-to").value || null;
    const name = $("single-schedule-name").value.trim();
    if (!groupId) throw new Error("Оберіть групу.");
    if (!validFrom) throw new Error("Вкажіть дату початку розкладу.");
    if (validTo && validTo < validFrom)
      throw new Error("Дата завершення не може бути раніше дати початку.");
    button.disabled = true;
    button.textContent = "Генерація...";
    const result = await request("/schedules/generate", {
      method: "POST",
      body: JSON.stringify({ groupId, validFrom, validTo, ...(name ? { name } : {}) })
    });
    $("single-schedule-result").textContent =
      `Розклад створено: ${result.name}. Занять і режимних подій: ${(result.items || []).length}. Період: ${validFrom} — ${validTo || "без завершення"}.`;
    toast("Розклад окремої групи успішно створено.");
    await openResource("schedules");
    $("schedule-generation-panel").classList.remove("hidden");
    $("single-schedule-result").textContent =
      `Розклад створено: ${result.name}. Занять і режимних подій: ${(result.items || []).length}. Період: ${validFrom} — ${validTo || "без завершення"}.`;
  } catch (error) {
    $("single-schedule-result").textContent =
      `Не вдалося згенерувати розклад групи: ${error.message}`;
    toast(`Помилка генерації: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Згенерувати розклад групи";
  }
}

async function generateAllSchedules() {
  try {
    const validFrom = $("schedule-valid-from").value;
    const validTo = $("schedule-valid-to").value || null;
    if (!validFrom) throw new Error("Вкажіть дату початку розкладу.");
    if (validTo && validTo < validFrom)
      throw new Error("Дата завершення не може бути раніше дати початку.");
    $("generate-schedule").disabled = true;
    $("generate-schedule").textContent = "Генерація...";
    const result = await request("/schedules/generate-all", {
      method: "POST",
      body: JSON.stringify({ validFrom, validTo })
    });
    const skipped = (result.skippedGroups || [])
      .map((item) => `${item.groupName}: ${item.reason}`)
      .join("; ");
    $("schedule-generation-result").textContent =
      `Створено розкладів: ${result.groupsGenerated}; занять і режимних подій: ${result.totalItems}; пропущено порожніх груп: ${result.groupsSkipped}. Період: ${result.validFrom} — ${result.validTo || "без завершення"}.${skipped ? ` Пропущені групи: ${skipped}` : ""}`;
    toast(`Повний розклад створено для ${result.groupsGenerated} груп.`);
    await openResource("schedules");
    $("schedule-generation-panel").classList.remove("hidden");
    $("schedule-generation-result").textContent =
      `Створено розкладів: ${result.groupsGenerated}; занять і режимних подій: ${result.totalItems}; пропущено порожніх груп: ${result.groupsSkipped}. Період: ${result.validFrom} — ${result.validTo || "без завершення"}.${skipped ? ` Пропущені групи: ${skipped}` : ""}`;
  } catch (error) {
    $("schedule-generation-result").textContent =
      `Не вдалося згенерувати розклад: ${error.message}`;
    toast(`Не вдалося згенерувати повний розклад: ${error.message}`);
  } finally {
    $("generate-schedule").disabled = false;
    $("generate-schedule").textContent = "Згенерувати повний розклад";
  }
}

async function openResource(key, query = {}) {
  const item = findResource(key);
  if (!item) return;
  currentResource = item;
  currentPage = 1;
  $("pagination-controls").classList.toggle("hidden", ["analytics", "audit"].includes(key));
  $("audit-filters").classList.toggle("hidden", key !== "audit");
  $("schedule-generation-panel").classList.toggle("hidden", key !== "schedules");
  $("analytics-panel").classList.toggle("hidden", key !== "analytics");
  $("generate-schedule").classList.toggle("hidden", key !== "schedules");
  if (key === "analytics" && !$("analytics-from").value) setAnalyticsDefaults();
  if (key === "analytics") {
    $("entity-description").textContent =
      "Фінансові, операційні та відвідувальні показники за обраний період.";
    $("table-head").innerHTML = "";
    $("table-body").innerHTML = "";
    $("empty-state").classList.add("hidden");
    $("editor").classList.add("hidden");
    $("create-entity").classList.add("hidden");
    $("api-console").classList.add("hidden");
    loadAnalytics().catch((error) => {
      $("analytics-results").textContent = error.message;
    });
    return;
  }
  if (key === "schedules" && !$("schedule-valid-from").value) setScheduleGenerationDefaults();
  if (key === "schedules") loadScheduleGroups();
  $("create-entity").classList.toggle("hidden", ["audit", "analytics"].includes(key));
  $("entity-search")
    .closest(".filter-label")
    .classList.toggle("hidden", key === "audit");
  $("entity-status")
    .closest(".filter-label")
    .classList.toggle("hidden", key === "audit");
  $("apply-filter").classList.toggle("hidden", key === "audit");
  $("group-details")?.classList.add("hidden");
  $("api-console").classList.toggle(
    "hidden",
    !["DEVELOPER", "SUPER_ADMIN"].includes(String(tokenPayload().role || "").toUpperCase())
  );
  editId = null;
  showView("entity-view", item[1]);
  if (key === "audit") {
    $("entity-description").textContent = "Історія змін системи з фільтрацією за сутністю та дією.";
    $("editor").classList.add("hidden");
    $("api-console").classList.add("hidden");
    $("create-entity").classList.add("hidden");
    try {
      await loadAudit();
    } catch (e) {
      toast(e.message);
    }
    return;
  }
  $("entity-description").textContent =
    `API: ${API}${item[2]} · Перегляд, створення, редагування, видалення та спеціальні API-операції.`;
  $("editor").classList.add("hidden");
  $("create-entity").classList.toggle("hidden", ["audit", "analytics"].includes(key));
  $("table-body").innerHTML = '<tr><td colspan="8">Завантаження...</td></tr>';
  $("api-path").value = item[2];
  $("api-method").value = "GET";
  $("api-query").value = Object.keys(query).length ? JSON.stringify(query, null, 2) : "";
  $("api-body").value = "";
  $("api-response").textContent = "";
  try {
    const requestQuery = { ...query };
    if (["children", "parents"].includes(key)) requestQuery.limit = 100;
    const queryString = new URLSearchParams(requestQuery).toString();
    const result = await request(`${item[2]}${queryString ? `?${queryString}` : ""}`);
    currentRecords = normalizeCollection(result);
    renderTable();
  } catch (error) {
    currentRecords = [];
    $("table-head").innerHTML = "";
    $("table-body").innerHTML = `<tr><td>${escapeHtml(error.message)}</td></tr>`;
  }
}
function renderRecordDetails(record) {
  const excluded = new Set([
    "id",
    "_id",
    "createdAt",
    "updatedAt",
    "archivedAt",
    "deletedAt",
    "createdBy",
    "updatedBy",
    "passwordHash",
    "tokenVersion"
  ]);
  const relationKeys = new Set([
    "parents",
    "children",
    "child",
    "parent",
    "group",
    "employee",
    "room",
    "enrollments",
    "payments",
    "invoices",
    "items",
    "history"
  ]);
  const entries = Object.entries(record || {}).filter(
    ([key, value]) => !excluded.has(key) && !relationKeys.has(key) && value !== undefined
  );
  const title =
    record.name ||
    [record.firstName, record.lastName].filter(Boolean).join(" ") ||
    record.employeeCode ||
    record.childCode ||
    "Деталі запису";
  const cards = entries
    .map(
      ([key, value]) =>
        `<div class="detail-field"><span>${escapeHtml(humanizeKey(key))}</span><strong>${escapeHtml(displayValue(key, value))}</strong></div>`
    )
    .join("");
  let related = "";
  if (Array.isArray(record.enrollments))
    related += `<section class="detail-section"><h4>Історія зарахувань</h4>${record.enrollments.length ? record.enrollments.map((x) => `<p>${escapeHtml(x.group?.name || "Група не вказана")} · ${escapeHtml(displayValue("startDate", x.startDate))} — ${escapeHtml(displayValue("endDate", x.endDate))}</p>`).join("") : '<p class="muted">Немає зарахувань.</p>'}</section>`;
  if (Array.isArray(record.parents))
    related += `<section class="detail-section"><h4>Батьки / опікуни</h4>${
      record.parents.length
        ? record.parents
            .map((x) => {
              const parent = x.parent || x;
              return `<p>${escapeHtml([parent.firstName, parent.lastName].filter(Boolean).join(" "))} · ${escapeHtml(parent.phone || "")}</p>`;
            })
            .join("")
        : '<p class="muted">Не додано.</p>'
    }</section>`;
  if (Array.isArray(record.children))
    related += `<section class="detail-section"><h4>Діти</h4>${record.children.length ? record.children.map((x) => `<p>${escapeHtml([x.firstName, x.lastName].filter(Boolean).join(" "))}</p>`).join("") : '<p class="muted">Немає пов’язаних дітей.</p>'}</section>`;
  if (currentResource[0] === "schedules") {
    const items = Array.isArray(record.items) ? record.items : [];
    const days = ["", "Понеділок", "Вівторок", "Середа", "Четвер", "П’ятниця", "Субота", "Неділя"];
    const types = {
      LESSON: "Заняття",
      BREAKFAST: "Сніданок",
      LUNCH: "Обід",
      SNACK: "Перекус",
      SLEEP: "Сон",
      FREE_TIME: "Вільний час"
    };
    const rows = items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(days[item.dayOfWeek] || String(item.dayOfWeek || "—"))}</td><td>${escapeHtml(item.startTime || "—")}–${escapeHtml(item.endTime || "—")}</td><td>${escapeHtml(types[item.type] || item.type || "—")}</td><td>${escapeHtml(item.subject?.name || "—")}</td><td>${escapeHtml([item.teacher?.firstName, item.teacher?.lastName].filter(Boolean).join(" ") || "—")}</td><td>${escapeHtml(item.room?.name || "—")}</td><td>${escapeHtml(item.status === "CANCELLED" ? "Скасовано" : "Активне")}</td></tr>`
      )
      .join("");
    related += `<section class="detail-section"><h4>Заняття та режимні події (${items.length})</h4>${items.length ? `<div class="table-wrap"><table><thead><tr><th>День</th><th>Час</th><th>Тип</th><th>Предмет</th><th>Викладач</th><th>Кімната</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">У цьому розкладі поки немає занять.</p>'}</section>`;
  }
  if (currentResource[0] === "child-parent") {
    const child = record.child || {};
    const parent = record.parent || {};
    related += `<section class="detail-section"><h4>Дитина</h4><p>${escapeHtml([child.firstName, child.lastName].filter(Boolean).join(" ") || "Не знайдено")} · ${escapeHtml(child.childCode || "")}</p></section><section class="detail-section"><h4>Батько / опікун</h4><p>${escapeHtml([parent.firstName, parent.lastName].filter(Boolean).join(" ") || "Не знайдено")} · ${escapeHtml(parent.phone || "")}</p><p>${escapeHtml(parent.email || "")}</p></section>`;
  }
  if (currentResource[0] === "groups") {
    const activeEnrollments = (record.enrollments || []).filter((x) => !x.endDate);
    const children = activeEnrollments
      .filter((x) => x.child)
      .map((x) => ({ ...x.child, enrollmentId: x.id }));
    related += `<section class="detail-section"><div class="panel-heading"><h4>Діти в групі (${children.length}/${record.capacity ?? 20})</h4><button class="button button-primary" id="enroll-child-open" type="button">Додати дитину</button></div><div id="enroll-child-panel" class="hidden"><label class="form-field"><span>Дитина для зарахування</span><select id="enroll-child-select"><option value="">Завантаження...</option></select></label><div class="editor-actions"><button class="button button-primary" id="enroll-child-submit" type="button">Зарахувати до групи</button><span id="enroll-child-message" class="muted"></span></div></div>${children.length ? `<div class="table-wrap"><table><thead><tr><th>Ім’я та прізвище</th><th>Дата народження</th><th>Статус</th><th>Дія</th></tr></thead><tbody>${children.map((child) => `<tr><td>${escapeHtml([child.firstName, child.lastName].filter(Boolean).join(" "))}</td><td>${escapeHtml(displayValue("birthDate", child.birthDate))}</td><td>${escapeHtml(child.status || "—")}</td><td><button class="table-action danger" data-unenroll="${escapeHtml(child.enrollmentId)}">Відрахувати з групи</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">У цій групі поки немає зарахованих дітей.</p>'}</section>`;
  }
  $("editor").classList.add("hidden");
  $("group-details").innerHTML =
    `<div class="panel-heading"><div><p class="eyebrow">ДАНІ СУТНОСТІ</p><h3>${escapeHtml(title)}</h3></div><div class="detail-actions"><button class="button button-secondary" id="detail-edit">Редагувати</button><button class="icon-button" id="close-group-details">✕</button></div></div><div class="record-detail-grid">${cards || '<p class="muted">Додаткові дані відсутні.</p>'}</div>${related}`;
  $("group-details").classList.remove("hidden");
  $("close-group-details").onclick = () => $("group-details").classList.add("hidden");
  $("detail-edit").onclick = () => openEditor(record);
  if (currentResource[0] === "groups") {
    $("group-details")
      .querySelectorAll("[data-unenroll]")
      .forEach((button) => {
        button.onclick = async () => {
          if (
            !confirm(
              "Відрахувати дитину з цієї групи? Запис про зарахування буде збережено в історії."
            )
          )
            return;
          button.disabled = true;
          try {
            await request(
              `/groups/enrollments/${encodeURIComponent(button.dataset.unenroll)}/complete`,
              { method: "PATCH" }
            );
            toast("Дитину відраховано з групи. Історію зарахування збережено.");
            const updated = await request(`/groups/${record.id}`);
            renderRecordDetails(updated);
          } catch (error) {
            toast(`Не вдалося відрахувати дитину: ${error.message}`);
            button.disabled = false;
          }
        };
      });
    $("enroll-child-open").onclick = async () => {
      const panel = $("enroll-child-panel");
      panel.classList.toggle("hidden");
      if (panel.classList.contains("hidden")) return;
      const select = $("enroll-child-select");
      select.innerHTML = '<option value="">Завантаження...</option>';
      try {
        const allChildren = normalizeCollection(await request("/children?limit=100"));
        const activeChildIds = new Set(
          allChildren
            .filter((child) => (child.enrollments || []).some((item) => !item.endDate))
            .map((child) => child.id)
        );
        const minMonths = Number(record.ageFromMonths || 0);
        const maxMonths = Number(record.ageToMonths || 1000);
        const today = new Date();
        const eligible = allChildren.filter((child) => {
          if (child.status !== "ACTIVE" || activeChildIds.has(child.id) || !child.birthDate)
            return false;
          const born = new Date(child.birthDate);
          let months =
            (today.getFullYear() - born.getFullYear()) * 12 + today.getMonth() - born.getMonth();
          if (today.getDate() < born.getDate()) months--;
          return months >= minMonths && months <= maxMonths;
        });
        select.innerHTML =
          '<option value="">Оберіть дитину...</option>' +
          eligible
            .map(
              (child) =>
                `<option value="${escapeHtml(child.id)}">${escapeHtml([child.firstName, child.lastName].filter(Boolean).join(" "))} · ${escapeHtml(child.childCode || "")}</option>`
            )
            .join("");
        if (!eligible.length)
          select.innerHTML = '<option value="">Немає доступних дітей відповідного віку</option>';
      } catch (error) {
        select.innerHTML = '<option value="">Не вдалося завантажити дітей</option>';
        $("enroll-child-message").textContent = error.message;
      }
    };
    $("enroll-child-submit").onclick = async () => {
      const childId = $("enroll-child-select").value;
      if (!childId) {
        $("enroll-child-message").textContent = "Оберіть дитину.";
        return;
      }
      $("enroll-child-submit").disabled = true;
      $("enroll-child-message").textContent = "Зарахування...";
      try {
        await request(`/groups/${record.id}/enrollments`, {
          method: "POST",
          body: JSON.stringify({ childId })
        });
        toast("Дитину зараховано до групи.");
        const updated = await request(`/groups/${record.id}`);
        renderRecordDetails(updated);
      } catch (error) {
        $("enroll-child-message").textContent = error.message;
      } finally {
        if ($("enroll-child-submit")) $("enroll-child-submit").disabled = false;
      }
    };
  }
  $("group-details").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTable() {
  const total = currentRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize;
  const visibleRecords = currentRecords.slice(startIndex, startIndex + pageSize);
  const isChildParent = currentResource?.[0] === "child-parent";
  const keys = fieldsFor(currentRecords[0]);
  if (isChildParent) {
    $("table-head").innerHTML =
      "<tr><th>Дитина</th><th>Код дитини</th><th>Батько / опікун</th><th>Телефон</th><th>Тип зв’язку</th><th>Початок</th><th>Завершення</th><th>Дії</th></tr>";
    $("table-body").innerHTML = visibleRecords
      .map((record) => {
        const child = record.child || {};
        const parent = record.parent || {};
        const childName =
          [child.firstName, child.lastName].filter(Boolean).join(" ") || record.childId || "—";
        const parentName =
          [parent.firstName, parent.lastName].filter(Boolean).join(" ") || record.parentId || "—";
        return `<tr><td>${escapeHtml(childName)}</td><td>${escapeHtml(child.childCode || "—")}</td><td>${escapeHtml(parentName)}</td><td>${escapeHtml(parent.phone || "—")}</td><td>${escapeHtml(record.relation || "—")}</td><td>${escapeHtml(displayValue("startDate", record.startDate))}</td><td>${escapeHtml(displayValue("endDate", record.endDate))}</td><td class="row-actions"><button class="table-action" data-view="${record.id}">Перегляд</button><button class="table-action" data-edit="${record.id}">Редагувати</button><button class="table-action danger" data-delete="${record.id}">Завершити</button></td></tr>`;
      })
      .join("");
  } else {
    $("table-head").innerHTML =
      `<tr>${keys.map((k) => `<th>${escapeHtml(humanizeKey(k))}</th>`).join("")}<th>Дії</th></tr>`;
    $("table-body").innerHTML = visibleRecords
      .map((record) => {
        const lifecycleEnabled = LIFECYCLE_ENTITIES.has(currentResource[0]);
        const archived = record.status === "ARCHIVED";
        const lifecycleButton = lifecycleEnabled
          ? archived
            ? `<button class="table-action" data-restore="${record.id}">Відновити</button><button class="table-action danger" data-hard-delete="${record.id}">Фізично видалити</button>`
            : `<button class="table-action danger" data-archive="${record.id}">Архівувати</button>`
          : `<button class="table-action danger" data-delete="${record.id}">${currentResource[0] === "child-parent" ? "Завершити" : "Видалити"}</button>`;
        return `<tr>${keys.map((k) => `<td>${escapeHtml(formatCell(record[k], k))}</td>`).join("")}<td class="row-actions"><button class="table-action" data-view="${record.id}">Перегляд</button><button class="table-action" data-edit="${record.id}">Редагувати</button>${lifecycleButton}</td></tr>`;
      })
      .join("");
  }
  $("empty-state").classList.toggle("hidden", total > 0);
  $("pagination-controls").classList.toggle("hidden", total === 0);
  $("pagination-info").textContent =
    total === 0
      ? "Показано 0–0 із 0 записів"
      : `Показано ${startIndex + 1}–${Math.min(startIndex + pageSize, total)} із ${total} записів`;
  $("page-indicator").textContent = `Сторінка ${currentPage} із ${totalPages}`;
  $("page-prev").disabled = currentPage <= 1;
  $("page-next").disabled = currentPage >= totalPages;
  $("page-size").value = String(pageSize);
  $("table-body").onclick = async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const record = currentRecords.find(
      (item) =>
        item.id === button.dataset.edit ||
        item.id === button.dataset.view ||
        item.id === button.dataset.delete ||
        item.id === button.dataset.archive ||
        item.id === button.dataset.restore ||
        item.id === button.dataset.hardDelete
    );
    if (!record) return;
    if (button.dataset.edit || button.dataset.view) {
      try {
        let fetched = null;
        try {
          fetched = unwrapRecord(await request(`${currentResource[2]}/${record.id}`));
        } catch (detailError) {
          if (!record || Object.keys(record).length <= 1) throw detailError;
        }
        const full = { ...record, ...(fetched || {}) };
        if (button.dataset.view) renderRecordDetails(full);
        else await openEditor(full);
      } catch (error) {
        toast(`Не вдалося завантажити запис: ${error.message}`);
      }
    } else if (
      button.dataset.archive ||
      button.dataset.restore ||
      button.dataset.hardDelete ||
      button.dataset.delete
    ) {
      const entity = currentResource[0];
      const isArchive = Boolean(button.dataset.archive);
      const isRestore = Boolean(button.dataset.restore);
      const isHardDelete = Boolean(button.dataset.hardDelete);
      const isRelationEnd = entity === "child-parent" && Boolean(button.dataset.delete);
      const prompt = isArchive
        ? "Архівувати запис? Пов’язані дані та історія будуть збережені."
        : isRestore
          ? "Відновити запис з архіву?"
          : isHardDelete
            ? "Фізично видалити запис назавжди? Операцію неможливо скасувати."
            : "Завершити зв’язок між дитиною та батьком?";
      if (!confirm(prompt)) return;
      try {
        if (isArchive)
          await request(`/lifecycle/${entity}/${record.id}/archive`, { method: "POST" });
        else if (isRestore)
          await request(`/lifecycle/${entity}/${record.id}/restore`, { method: "POST" });
        else if (isHardDelete)
          await request(`/lifecycle/${entity}/${record.id}`, { method: "DELETE" });
        else if (isRelationEnd)
          await request(`${currentResource[2]}/${record.id}/complete`, { method: "PATCH" });
        else throw new Error("Для цієї сутності операція видалення не налаштована");
        toast(
          isArchive
            ? "Запис архівовано"
            : isRestore
              ? "Запис відновлено"
              : isHardDelete
                ? "Запис фізично видалено"
                : "Зв’язок завершено"
        );
        await openResource(entity);
      } catch (error) {
        toast(`Операція недоступна: ${error.message}`);
      }
    }
  };
}

function formatCell(value, key = "") {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    if (Array.isArray(value)) return `${value.length} запис(ів)`;
    const name = value.name || [value.firstName, value.lastName].filter(Boolean).join(" ");
    return name || "Пов’язані дані";
  }
  const formatted = displayValue(key, value);
  return formatted.length > 42 ? `${formatted.slice(0, 42)}…` : formatted;
}

const FORM_SCHEMAS = {
  children: [
    ["firstName", "Ім’я", "text", true],
    ["lastName", "Прізвище", "text", true],
    ["birthDate", "Дата народження", "date", true],
    ["dietaryNotes", "Дієтичні примітки", "textarea"],
    ["notes", "Додаткові примітки", "textarea"],
    ["discountId", "Основна знижка на навчання", "discount"],
    ["annualDiscountId", "Знижка за річну оплату (12%)", "annual-discount"]
  ],
  parents: [
    ["firstName", "Ім’я", "text", true],
    ["lastName", "Прізвище", "text", true],
    ["phone", "Телефон (+380...)", "tel", true],
    ["email", "Email", "email"]
  ],
  groups: [
    ["name", "Назва групи", "text", true],
    ["ageFromMonths", "Вік від (років)", "number", true],
    ["ageToMonths", "Вік до (років)", "number", true],
    ["mealCategory", "Вікова категорія харчування", "select", false, ["A2", "A3", "A4", "A5"]],
    ["mainRoomId", "Групова кімната", "relation"],
    ["capacity", "Місткість (максимум 20)", "number", true],
    ["status", "Статус", "select", false, ["ACTIVE", "INACTIVE"]]
  ],
  rooms: [
    ["name", "Назва кімнати", "text", true],
    ["purpose", "Призначення", "text", true],
    ["capacity", "Місткість", "number", true],
    ["status", "Статус", "select", false, ["ACTIVE", "INACTIVE"]]
  ],
  employees: [
    ["employeeCode", "Табельний номер", "text", true],
    ["firstName", "Ім’я", "text", true],
    ["lastName", "Прізвище", "text", true],
    ["phone", "Телефон", "tel"],
    ["email", "Email", "email"],
    ["role", "Посада", "select", true, ["MANAGER", "EDUCATOR", "ASSISTANT", "TEACHER"]]
  ],
  subjects: [
    ["name", "Назва предмета", "text", true],
    ["description", "Опис", "textarea"]
  ],
  schedules: [
    ["groupId", "Група", "relation", true],
    ["subjectId", "Предмет", "relation", true],
    ["employeeId", "Викладач", "relation", true],
    ["roomId", "Кімната", "relation", true],
    ["dayOfWeek", "День тижня (1–7)", "number", true],
    ["startTime", "Початок (HH:mm)", "time", true],
    ["endTime", "Кінець (HH:mm)", "time", true]
  ],
  attendance: [
    ["childId", "Дитина", "relation", true],
    ["date", "Дата", "date", true],
    ["status", "Відвідування", "select", true, ["PRESENT", "ABSENT", "LATE", "EXCUSED"]],
    ["notes", "Примітки", "textarea"]
  ],
  "child-parent": [
    ["childId", "Дитина", "relation", true],
    ["parentId", "Батько / мати", "relation", true],
    [
      "relation",
      "Тип зв’язку",
      "select",
      true,
      ["MOTHER", "FATHER", "GUARDIAN", "GRANDPARENT", "OTHER"]
    ]
  ],
  "staff-assignments": [
    ["employeeId", "Працівник", "relation", true],
    ["groupId", "Група", "relation", true],
    ["role", "Роль", "select", true, ["EDUCATOR", "ASSISTANT", "TEACHER"]]
  ],
  "teacher-subject": [
    ["employeeId", "Викладач", "relation", true],
    ["subjectId", "Предмет", "relation", true]
  ],
  invoices: [
    ["childId", "Дитина", "relation", true],
    ["period", "Розрахунковий період (YYYY-MM)", "text", true],
    ["amountDue", "Сума (копійки)", "number", true],
    ["dueDate", "Термін оплати", "date"]
  ],
  payments: [
    ["invoiceId", "Рахунок", "relation", true],
    ["amount", "Сума (копійки)", "number", true],
    ["paidAt", "Дата оплати", "date", true],
    ["method", "Спосіб оплати", "text"]
  ],
  tuition: [
    ["name", "Назва тарифу", "text", true],
    ["amount", "Тариф навчання (грн/місяць)", "number", true],
    ["validFrom", "Діє з", "date", true],
    ["validTo", "Діє до", "date"]
  ],
  meals: [
    ["category", "Вікова категорія", "select", true, ["A2", "A3", "A4", "A5"]],
    ["amount", "Вартість харчування (грн/день)", "number", true],
    ["validFrom", "Діє з", "date", true],
    ["validTo", "Діє до", "date"]
  ],
  discounts: [
    ["name", "Назва знижки", "text", true],
    ["value", "Знижка (%)", "select", true, ["10", "12", "20", "30"]]
  ],
  salaries: [
    ["role", "Посада", "text", true],
    ["amount", "Сума (грн)", "number", true],
    ["effectiveFrom", "Діє з", "date", true]
  ],
  expenses: [
    ["description", "Опис витрати", "text", true],
    ["amount", "Сума (грн)", "number", true],
    ["date", "Дата", "date", true],
    ["category", "Категорія", "text"]
  ]
};
function formValue(field, value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
const RELATION_LOOKUPS = {
  mainRoomId: "/rooms",
  roomId: "/rooms",
  groupId: "/groups",
  subjectId: "/subjects",
  employeeId: "/employees",
  childId: "/children",
  parentId: "/parents",
  invoiceId: "/billing/invoices"
};
async function renderEntityForm(record = {}) {
  const schema = FORM_SCHEMAS[currentResource[0]] || [];
  const relationData = {};
  if (currentResource[0] === "children") {
    try {
      relationData.discountId = normalizeCollection(await request("/billing/discounts")).filter(
        (item) => [10, 20, 30].includes(Number(item.percentage))
      );
    } catch {
      relationData.discountId = [];
    }
    try {
      relationData.annualDiscountId = normalizeCollection(
        await request("/billing/discounts")
      ).filter((item) => Number(item.percentage) === 12);
    } catch {
      relationData.annualDiscountId = [];
    }
  }
  for (const [key] of schema)
    if (RELATION_LOOKUPS[key]) {
      try {
        const lookupUrl = ["childId", "parentId"].includes(key)
          ? `${RELATION_LOOKUPS[key]}?limit=100`
          : RELATION_LOOKUPS[key];
        const data = await request(lookupUrl);
        relationData[key] = Array.isArray(data) ? data : data.items || [];
      } catch {
        relationData[key] = [];
      }
    }
  $("entity-form").innerHTML = schema
    .map(([key, label, type = "text", required = false, options = []]) => {
      let rawValue =
        key in record
          ? record[key]
          : key === "capacity" && currentResource[0] === "groups"
            ? 20
            : undefined;
      if (["discountId", "annualDiscountId"].includes(key) && currentResource[0] === "children") {
        const percentage = key === "discountId" ? [10, 20, 30] : [12];
        const assignment = record.discounts?.find(
          (item) =>
            (!item.validTo || new Date(item.validTo) >= new Date()) &&
            percentage.includes(Number(item.discount?.percentage))
        );
        rawValue = assignment?.discountId || assignment?.discount?.id || "";
      }
      if (
        currentResource[0] === "groups" &&
        ["ageFromMonths", "ageToMonths"].includes(key) &&
        rawValue !== undefined &&
        rawValue !== null
      )
        rawValue = Number(rawValue) / 12;
      if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue))
        rawValue = rawValue.id || rawValue._id || "";
      if (type === "date" && typeof rawValue === "string") rawValue = rawValue.slice(0, 10);
      const value = formValue(rawValue);
      const req = required ? "required" : "";
      let control;
      if (type === "discount" || type === "annual-discount") {
        const rows =
          type === "discount" ? relationData.discountId || [] : relationData.annualDiscountId || [];
        const empty = type === "discount" ? "Без основної знижки" : "Без знижки за річну оплату";
        control = `<select name="${key}"><option value="">${empty}</option>${rows.map((x) => `<option value="${x.id}" ${value === x.id ? "selected" : ""}>${escapeHtml(x.name)} — ${x.percentage}%</option>`).join("")}</select>`;
      } else if (type === "select")
        control = `<select name="${key}" ${req}><option value="">Оберіть...</option>${options.map((v) => `<option value="${v}" ${value === v ? "selected" : ""}>${v}</option>`).join("")}</select>`;
      else if (type === "relation") {
        const rows = relationData[key] || [];
        const label = (x) =>
          x.name || [x.firstName, x.lastName].filter(Boolean).join(" ") || x.childCode || x.id;
        control = `<select name="${key}" ${req}><option value="">Оберіть запис...</option>${rows.map((x) => `<option value="${x.id}" ${value === x.id ? "selected" : ""}>${escapeHtml(label(x))}</option>`).join("")}</select>`;
      } else if (type === "textarea")
        control = `<textarea name="${key}" rows="3">${escapeHtml(value)}</textarea>`;
      else if (type === "checkbox")
        control = `<input name="${key}" type="checkbox" ${value === "true" ? "checked" : ""}>`;
      else
        control = `<input name="${key}" type="${type}" value="${escapeHtml(value)}" ${req} ${type === "number" && key === "capacity" ? 'min="1" max="20"' : currentResource[0] === "groups" && ["ageFromMonths", "ageToMonths"].includes(key) ? 'min="2" max="5.9" step="0.1"' : ""}>`;
      return `<label class="form-field"><span>${label}${required ? " *" : ""}</span>${control}</label>`;
    })
    .join("");
}
async function openEditor(record = null) {
  $("group-details").classList.add("hidden");
  let source = normalizeEntityRecord(record || {});
  editId = source?.id || source?._id || null;
  if (editId && currentResource?.[2]) {
    $("editor-title").textContent = "Завантаження даних для редагування…";
    $("editor").classList.remove("hidden");
    try {
      const response = await request(`${currentResource[2]}/${encodeURIComponent(editId)}`);
      const fullRecord = normalizeEntityRecord(response);
      if (fullRecord && typeof fullRecord === "object") source = { ...source, ...fullRecord };
    } catch (error) {
      if (!source || Object.keys(source).length <= 1) {
        $("editor-message").textContent = `Не вдалося завантажити запис: ${error.message}`;
        return;
      }
    }
  }
  $("save-entity").classList.remove("hidden");
  $("editor-title").textContent = editId ? "Редагування запису" : "Створення запису";
  await renderEntityForm(source || {});
  for (const [key] of FORM_SCHEMAS[currentResource?.[0]] || []) {
    const field = $("entity-form").querySelector(`[name="${key}"]`);
    if (!field || !Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    let value = source[key];
    if (["discountId", "annualDiscountId"].includes(key) && currentResource[0] === "children") {
      const percentage = key === "discountId" ? [10, 20, 30] : [12];
      const assignment = source.discounts?.find(
        (item) =>
          (!item.validTo || new Date(item.validTo) >= new Date()) &&
          percentage.includes(Number(item.discount?.percentage))
      );
      value = assignment?.discountId || assignment?.discount?.id || "";
    }
    if (value && typeof value === "object" && !Array.isArray(value))
      value = value.id || value._id || "";
    if (field.type === "date") value = typeof value === "string" ? value.slice(0, 10) : value;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else if (value !== undefined && value !== null) field.value = String(value);
  }
  $("editor-message").textContent = "";
  $("editor").classList.remove("hidden");
  $("editor").scrollIntoView({ behavior: "smooth", block: "start" });
}
function readEntityForm() {
  const data = {};
  const schema = FORM_SCHEMAS[currentResource[0]] || [];
  $("entity-form")
    .querySelectorAll("[name]")
    .forEach((el) => {
      if (currentResource[0] === "children" && ["discountId", "annualDiscountId"].includes(el.name))
        return;
      if (el.type === "checkbox") data[el.name] = el.checked;
      else if (el.value !== "") {
        const field = schema.find((item) => item[0] === el.name);
        if (el.type === "number" || (currentResource[0] === "discounts" && el.name === "value"))
          data[el.name] = Number(el.value);
        else if (field?.[2] === "text" && ["ageCategories"].includes(el.name))
          data[el.name] = el.value
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        else data[el.name] = el.value;
      }
    });
  if (currentResource[0] === "groups") {
    for (const key of ["ageFromMonths", "ageToMonths"]) {
      if (data[key] !== undefined) {
        if (!Number.isFinite(data[key]) || data[key] < 2 || data[key] > 5.9)
          throw new Error("Вік потрібно вказувати в роках (від 2 до 5 років).");
        data[key] = Math.round(data[key] * 12);
      }
    }
  }
  if (currentResource[0] === "groups" && data.capacity > 20)
    throw new Error("Максимум 20 дітей у групі для всіх вікових категорій A2–A5.");
  return data;
}
async function saveEntity() {
  try {
    const data = readEntityForm();
    const discountId =
      currentResource[0] === "children"
        ? $("entity-form").querySelector("[name=discountId]")?.value || null
        : undefined;
    const annualDiscountId =
      currentResource[0] === "children"
        ? $("entity-form").querySelector("[name=annualDiscountId]")?.value || null
        : undefined;
    const base = currentResource[2];
    const saved = await request(editId ? `${base}/${editId}` : base, {
      method: editId ? "PATCH" : "POST",
      body: JSON.stringify(data)
    });
    if (currentResource[0] === "children") {
      const childId = editId || saved.id;
      if (childId)
        await request(`/children/${childId}/discount`, {
          method: "PUT",
          body: JSON.stringify({ discountId, annualDiscountId })
        });
    }
    $("editor-message").textContent = "Запис успішно збережено.";
    $("editor").classList.add("hidden");
    toast("Запис збережено");
    await openResource(currentResource[0]);
    $("table-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("editor-message").textContent = error.message;
  }
}

function openOptimizer() {
  showView("optimizer-view", "Оптимізатор");
  const ageInputs = $("age-inputs");
  if (!ageInputs.dataset.initialized) {
    ageInputs.innerHTML = ["A2", "A3", "A4", "A5"]
      .map(
        (age) => `
      <div class="age-card">
        <h4>${age}</h4>
        <label>Кількість дітей<input id="children-${age}" type="number" min="0" max="240" value="0"></label>
        <label>Дні фактичного / очікуваного відвідування за місяць<input id="days-${age}" type="number" min="0" max="31" value="20"></label>
      </div>`
      )
      .join("");
    ageInputs.dataset.initialized = "true";
  }
  if (!$("database-from").value || !$("database-to").value) {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const toInput = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    $("database-from").value = toInput(first);
    $("database-to").value = toInput(today);
  }
  $("optimizer-result").classList.add("hidden");
  configureDeveloperConsole();
}

function optimizerPayload() {
  const children = {},
    attendanceDays = {};
  ["A2", "A3", "A4", "A5"].forEach((age) => {
    children[age] = Number($(`children-${age}`).value);
    attendanceDays[age] = Number($(`days-${age}`).value);
  });
  return {
    children,
    attendanceDays,
    weeklyLessonMinutesPerGroup:
      $("lesson-minutes").value === "" ? null : Number($("lesson-minutes").value),
    otherMonthlyExpenses: Number($("other-expenses").value)
  };
}
function renderOptimization(data) {
  const r = data.result || data;
  $("optimizer-result").classList.remove("hidden");
  $("result-title").textContent = r.name || "Результат оптимізації";
  $("result-profit").textContent = `${moneyUAH(r.profit)} / міс.`;
  const c = r.configuration || {};
  $("result-stats").innerHTML = [
    ["Дітей", c.children],
    ["Груп", c.groups],
    ["Викладачів", c.teachers ?? "не задано"],
    ["Групових кімнат", `${c.groupRoomsUsed ?? c.groups}/12`]
  ]
    .map(([a, b]) => `<div class="stat-card"><span>${a}</span><strong>${b}</strong></div>`)
    .join("");
  $("result-groups").innerHTML = (r.groups || [])
    .map(
      (g) =>
        `<tr><td>${g.name}</td><td>${g.ageCategory}</td><td>${g.children}</td><td>${moneyUAH(g.educatorSalary)}</td><td>${moneyUAH(g.assistantSalary)}</td></tr>`
    )
    .join("");
  const labels = {
    tuition: "Навчання",
    meals: "Цільові кошти батьків на харчування",
    total: "Загальний дохід",
    food: "Замовлення готової їжі (цільові витрати)",
    educators: "Вихователі",
    assistants: "Помічники",
    manager: "Керівник",
    administrator: "Адміністратор",
    teachers: "Викладачі",
    salaries: "Увесь фонд зарплат",
    rent: "Оренда (всі приміщення)",
    other: "Інші витрати",
    totalExpenses: "Усі витрати"
  };
  const finance = [
    ...Object.entries(r.revenue || {}),
    ...Object.entries({ ...r.expenses, totalExpenses: r.expenses?.total })
  ];
  $("result-finance").innerHTML = finance
    .map(
      ([k, v]) =>
        `<div class="finance-item"><span>${labels[k] || k}</span><strong>${moneyUAH(v)}</strong></div>`
    )
    .join("");
  $("result-warnings").innerHTML = (r.warnings || []).map((w) => `<p>⚠ ${w}</p>`).join("");
}

async function compareOptimizer() {
  try {
    const payload = optimizerPayload();
    const name = $("scenario-name").value.trim() || `Сценарій ${compareScenarios.length + 1}`;
    compareScenarios.push({ name, ...payload });
    if (compareScenarios.length < 2) {
      $("compare-results").innerHTML =
        `<p>Додано «${escapeHtml(name)}». Додайте ще один сценарій для порівняння (${compareScenarios.length}/20).</p>`;
      return;
    }
    const result = await request("/optimization/compare", {
      method: "POST",
      body: JSON.stringify({ scenarios: compareScenarios.slice(-20) })
    });
    $("compare-results").innerHTML = (result.scenarios || [])
      .map(
        (item) =>
          `<div class="rule-list"><div><span>#${item.rank} ${escapeHtml(item.name)} · ${item.configuration.groups} груп</span><strong>${moneyUAH(item.profit)} / міс.</strong></div></div>`
      )
      .join("");
  } catch (error) {
    toast(error.message);
  }
}
async function runDatabaseOptimizer() {
  try {
    const from = $("database-from").value,
      to = $("database-to").value;
    if (!from || !to) throw new Error("Вкажіть період фактичних даних.");
    const result = await request("/optimization/from-database", {
      method: "POST",
      body: JSON.stringify({ from, to })
    });
    renderOptimization(result);
    $("result-title").textContent = "Оптимізація за фактичними даними бази";
    const source = result.source || {};
    $("result-warnings").insertAdjacentHTML(
      "afterbegin",
      `<p>Джерело: база даних · дітей: ${source.enrolledChildren ?? "—"} · записів відвідування: ${source.attendanceRecords ?? "—"} · період: ${from} — ${to}</p>`
    );
  } catch (error) {
    toast(error.message);
  }
}

async function executeApiRequest() {
  try {
    const method = $("api-method").value;
    let path = $("api-path").value.trim();
    if (!path.startsWith("/")) path = `/${path}`;
    const queryText = $("api-query").value.trim();
    if (queryText) {
      const query = JSON.parse(queryText);
      const params = new URLSearchParams(query);
      if (params.toString()) path += `${path.includes("?") ? "&" : "?"}${params}`;
    }
    const bodyText = $("api-body").value.trim();
    const options = { method };
    if (!["GET", "HEAD"].includes(method) && bodyText)
      options.body = JSON.stringify(cleanPayload(JSON.parse(bodyText)));
    const result = await request(path, options);
    $("api-response").textContent = JSON.stringify(result, null, 2);
    toast("API-запит виконано");
    if (method === "POST" || method === "PATCH" || method === "DELETE")
      await openResource(currentResource[0]);
    $("table-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("api-response").textContent = error.message;
  }
}

function moneyUAH(value) {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) / 100).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴`;
}
async function runOptimizer() {
  try {
    const payload = optimizerPayload();
    const result = await request("/optimization/optimize", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderOptimization(result);
  } catch (error) {
    toast(error.message);
  }
}
$("generate-schedule").addEventListener("click", generateAllSchedules);
$("generate-single-schedule").addEventListener("click", generateSingleSchedule);
$("analytics-load").addEventListener("click", () =>
  loadAnalytics().catch((error) => toast(error.message))
);
$("page-size").addEventListener("change", () => {
  pageSize = Number($("page-size").value) || 20;
  currentPage = 1;
  renderTable();
});
$("page-prev").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});
$("page-next").addEventListener("click", () => {
  const pages = Math.max(1, Math.ceil(currentRecords.length / pageSize));
  if (currentPage < pages) {
    currentPage++;
    renderTable();
  }
});
$("login-form").addEventListener("submit", login);
$("logout").addEventListener("click", () => {
  token = "";
  localStorage.removeItem("kg_token");
  authState();
});
$("refresh-entity").addEventListener(
  "click",
  () => currentResource && openResource(currentResource[0])
);
$("create-entity").addEventListener("click", () => openEditor());
$("close-editor").addEventListener("click", () => $("editor").classList.add("hidden"));
$("cancel-editor").addEventListener("click", () => $("editor").classList.add("hidden"));
$("save-entity").addEventListener("click", saveEntity);
$("apply-filter").addEventListener("click", () => {
  const query = {};
  const search = $("entity-search").value.trim();
  const status = $("entity-status").value;
  if (search) query.search = search;
  if (status) query.status = status;
  openResource(currentResource[0], query);
});
$("execute-api").addEventListener("click", executeApiRequest);
$("run-optimizer").addEventListener("click", () => runOptimizer(false));
$("compare-optimizer").addEventListener("click", compareOptimizer);
$("run-database").addEventListener("click", runDatabaseOptimizer);
$("audit-apply").addEventListener("click", () => loadAudit().catch((e) => toast(e.message)));
buildNavigation();
checkApi();
authState();
if (token) openDashboard();
