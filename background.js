const ALARM_PREFIX = "beautiful-jwt-refresh:";
const CONFIGS_KEY = "beautifulJwtConfigs";
const TOKENS_KEY = "beautifulJwtTokens";

chrome.runtime.onInstalled.addListener(() => {
  void restoreAlarms();
});
chrome.runtime.onStartup.addListener(() => {
  void restoreAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  void refreshConfig(id).catch(async (error) => {
    await recordError(id, safeError(error));
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SAVE_CONFIG") {
    saveConfigAndRefresh(message.config)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: safeError(error) }));
    return true;
  }
  if (message?.type === "REFRESH_CONFIG") {
    refreshConfig(message.id)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: safeError(error) }));
    return true;
  }
  if (message?.type === "REFRESH_ALL") {
    refreshAll()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: safeError(error) }));
    return true;
  }
  if (message?.type === "DELETE_CONFIG") {
    deleteConfig(message.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: safeError(error) }));
    return true;
  }
});

async function getConfigs() {
  const data = await chrome.storage.local.get(CONFIGS_KEY);
  return Array.isArray(data[CONFIGS_KEY]) ? data[CONFIGS_KEY] : [];
}
async function getTokens() {
  const data = await chrome.storage.local.get(TOKENS_KEY);
  return Array.isArray(data[TOKENS_KEY]) ? data[TOKENS_KEY] : [];
}
async function putConfigs(configs) {
  await chrome.storage.local.set({ [CONFIGS_KEY]: configs });
}
async function putTokens(tokens) {
  await chrome.storage.local.set({ [TOKENS_KEY]: tokens });
}
function safeError(error) {
  return error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";
}
function alarmName(id) {
  return `${ALARM_PREFIX}${id}`;
}
async function ensureHostPermission(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Endpoint harus berupa URL lengkap, misalnya http://localhost:8000/api/token/jwt.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Endpoint hanya mendukung HTTP atau HTTPS.");
  }
  const originPattern = `${url.origin}/*`;
  const granted = await chrome.permissions.contains({ origins: [originPattern] });
  if (!granted) {
    throw new Error(`Izin akses ke ${url.origin} belum diberikan. Simpan konfigurasi lagi dan izinkan akses host saat diminta.`);
  }
}
async function saveConfigAndRefresh(input) {
  const configs = await getConfigs();
  const id = input.id || crypto.randomUUID();
  const config = {
    id,
    name: String(input.name || "").trim(),
    sessionToken: String(input.sessionToken || "").trim(),
    endpoint: String(input.endpoint || "").trim(),
    intervalMinutes: Math.max(1, Math.min(10080, Number(input.intervalMinutes) || 5)),
    updatedAt: Date.now()
  };
  if (!config.name || !config.sessionToken || !config.endpoint) {
    throw new Error("Nama, session token, dan endpoint wajib diisi.");
  }
  await ensureHostPermission(config.endpoint);
  const index = configs.findIndex((item) => item.id === id);
  if (index >= 0) configs[index] = config;
  else configs.unshift(config);
  await putConfigs(configs);
  await chrome.alarms.clear(alarmName(id));
  chrome.alarms.create(alarmName(id), {
    delayInMinutes: config.intervalMinutes,
    periodInMinutes: config.intervalMinutes
  });
  const result = await refreshConfig(id);
  return { id, ...result };
}
async function restoreAlarms() {
  const configs = await getConfigs();
  const existing = await chrome.alarms.getAll();
  const expected = new Set(configs.map((config) => alarmName(config.id)));
  for (const alarm of existing) {
    if (alarm.name.startsWith(ALARM_PREFIX) && !expected.has(alarm.name)) {
      await chrome.alarms.clear(alarm.name);
    }
  }
  for (const config of configs) {
    const name = alarmName(config.id);
    const existingAlarm = await chrome.alarms.get(name);
    if (!existingAlarm) {
      chrome.alarms.create(name, {
        delayInMinutes: config.intervalMinutes,
        periodInMinutes: config.intervalMinutes
      });
    }
  }
}
async function refreshConfig(id) {
  const configs = await getConfigs();
  const config = configs.find((item) => item.id === id);
  if (!config) throw new Error("Konfigurasi tidak ditemukan.");
  await ensureHostPermission(config.endpoint);

  const tokensBefore = await getTokens();
  const old = tokensBefore.find((item) => item.id === id);
  const response = await fetch(config.endpoint, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${config.sessionToken}`,
      "Accept": "application/json"
    },
    cache: "no-store",
    credentials: "omit"
  });

  const raw = await response.text();
  if (!response.ok) {
    const detail = raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
    throw new Error(`HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("Respons endpoint bukan JSON yang valid.");
  }
  if (typeof body?.token !== "string" || !body.token.trim()) {
    throw new Error('Field "token" tidak ditemukan atau kosong pada respons JSON.');
  }

  const jwt = body.token.trim();
  const tokens = await getTokens();
  const entry = {
    id: config.id,
    name: config.name,
    endpoint: config.endpoint,
    jwt,
    lastUpdatedAt: Date.now(),
    lastError: ""
  };
  const index = tokens.findIndex((item) => item.id === id);
  if (index >= 0) tokens[index] = entry;
  else tokens.unshift(entry);
  await putTokens(tokens);
  return { token: entry, previousTokenKept: false };
}
async function refreshAll() {
  const configs = await getConfigs();
  const results = [];
  for (const config of configs) {
    try {
      await refreshConfig(config.id);
      results.push({ id: config.id, ok: true });
    } catch (error) {
      await recordError(config.id, safeError(error));
      results.push({ id: config.id, ok: false, error: safeError(error) });
    }
  }
  return { results };
}
async function recordError(id, errorMessage) {
  const tokens = await getTokens();
  const index = tokens.findIndex((item) => item.id === id);
  if (index >= 0) {
    tokens[index] = { ...tokens[index], lastError: errorMessage };
    await putTokens(tokens);
  }
}
async function deleteConfig(id) {
  const configs = (await getConfigs()).filter((item) => item.id !== id);
  const tokens = (await getTokens()).filter((item) => item.id !== id);
  await putConfigs(configs);
  await putTokens(tokens);
  await chrome.alarms.clear(alarmName(id));
}
