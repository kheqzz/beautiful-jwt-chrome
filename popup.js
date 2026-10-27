const CONFIGS_KEY = "beautifulJwtConfigs";
const TOKENS_KEY = "beautifulJwtTokens";

const form = document.getElementById("config-form");
const idField = document.getElementById("config-id");
const nameField = document.getElementById("name");
const sessionField = document.getElementById("session-token");
const endpointField = document.getElementById("endpoint");
const intervalField = document.getElementById("interval");
const formStatus = document.getElementById("form-status");
const tokenList = document.getElementById("token-list");
const emptyState = document.getElementById("empty-state");
const tokenCount = document.getElementById("token-count");

document.addEventListener("DOMContentLoaded", () => void render());
form.addEventListener("submit", onSave);
document.getElementById("reset-form").addEventListener("click", resetForm);
document.getElementById("refresh-all").addEventListener("click", onRefreshAll);

async function readStorage() {
  const data = await chrome.storage.local.get([CONFIGS_KEY, TOKENS_KEY]);
  return {
    configs: Array.isArray(data[CONFIGS_KEY]) ? data[CONFIGS_KEY] : [],
    tokens: Array.isArray(data[TOKENS_KEY]) ? data[TOKENS_KEY] : []
  };
}
async function send(message) {
  return await chrome.runtime.sendMessage(message);
}
function setStatus(message, type = "") {
  formStatus.textContent = message;
  formStatus.className = `status ${type}`.trim();
}
function resetForm() {
  form.reset();
  idField.value = "";
  intervalField.value = "5";
  setStatus("");
}
async function onSave(event) {
  event.preventDefault();
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  setStatus("Meminta izin host dan mengambil JWT…");
  const config = {
    id: idField.value || undefined,
    name: nameField.value.trim(),
    sessionToken: sessionField.value.trim(),
    endpoint: endpointField.value.trim(),
    intervalMinutes: Number(intervalField.value)
  };
  try {
    const endpointUrl = new URL(config.endpoint);
    if (!["http:", "https:"].includes(endpointUrl.protocol)) {
      throw new Error("Endpoint hanya mendukung HTTP atau HTTPS.");
    }
    const originPattern = `${endpointUrl.origin}/*`;
    const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
    if (!hasPermission) {
      const granted = await chrome.permissions.request({ origins: [originPattern] });
      if (!granted) throw new Error(`Izin akses ke ${endpointUrl.origin} ditolak.`);
    }
    const result = await send({ type: "SAVE_CONFIG", config });
    if (!result?.ok) throw new Error(result?.error || "Gagal menyimpan konfigurasi.");
    setStatus("Konfigurasi disimpan dan JWT berhasil diperbarui.", "success");
    resetForm();
    await render();
  } catch (error) {
    setStatus(error.message || "Gagal menyimpan konfigurasi.", "error");
  } finally {
    saveButton.disabled = false;
  }
}
async function onRefreshAll() {
  const button = document.getElementById("refresh-all");
  button.disabled = true;
  button.textContent = "…";
  try {
    const result = await send({ type: "REFRESH_ALL" });
    const failed = (result?.results || []).filter((item) => !item.ok);
    if (failed.length) setStatus(`${failed.length} token gagal di-refresh. Periksa status di daftar.`, "error");
    else setStatus("Semua JWT berhasil diperbarui.", "success");
    await render();
  } catch (error) {
    setStatus(error.message || "Gagal refresh token.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "↻";
  }
}
async function render() {
  const { configs, tokens } = await readStorage();
  tokenList.replaceChildren();
  tokenCount.textContent = `${tokens.length} token`;
  emptyState.hidden = tokens.length > 0;
  for (const token of tokens) {
    const config = configs.find((item) => item.id === token.id);
    const card = document.createElement("article");
    card.className = "token-card";

    const top = document.createElement("div");
    top.className = "token-card-top";
    const info = document.createElement("div");
    info.className = "token-title";
    info.textContent = token.name || "Token tanpa nama";
    const meta = document.createElement("div");
    meta.className = "token-meta";
    meta.textContent = `Diperbarui ${formatTime(token.lastUpdatedAt)} · tiap ${config?.intervalMinutes || "?"} menit`;
    info.append(meta);
    const status = document.createElement("span");
    status.className = `token-status ${token.lastError ? "error" : "ok"}`;
    status.textContent = token.lastError ? "GAGAL REFRESH" : "AKTIF";
    top.append(info, status);

    const jwt = document.createElement("div");
    jwt.className = "jwt-value";
    jwt.textContent = token.jwt;

    const actions = document.createElement("div");
    actions.className = "token-actions";
    const edit = makeButton("Edit", "small-button", async () => {
      if (!config) return;
      idField.value = config.id;
      nameField.value = config.name;
      sessionField.value = config.sessionToken;
      endpointField.value = config.endpoint;
      intervalField.value = String(config.intervalMinutes);
      setStatus("Konfigurasi dimuat ke form. Session token ditampilkan untuk diedit.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const refresh = makeButton("↻ Refresh", "small-button", async (button) => {
      button.disabled = true;
      try {
        const result = await send({ type: "REFRESH_CONFIG", id: token.id });
        if (!result?.ok) throw new Error(result?.error || "Refresh gagal.");
        setStatus(`JWT "${token.name}" berhasil diperbarui.`, "success");
      } catch (error) {
        setStatus(error.message || "Refresh gagal.", "error");
      }
      await render();
    });
    const copy = makeButton("Copy JWT", "small-button copy", async (button) => {
      try {
        await navigator.clipboard.writeText(token.jwt);
        const previous = button.textContent;
        button.textContent = "Tersalin ✓";
        setTimeout(() => { button.textContent = previous; }, 1200);
      } catch {
        setStatus("Clipboard tidak tersedia. Pilih dan salin JWT secara manual.", "error");
      }
    });
    const del = makeButton("Hapus", "small-button delete", async () => {
      const confirmed = confirm(`Hapus "${token.name}" beserta konfigurasi dan token tersimpannya?`);
      if (!confirmed) return;
      const result = await send({ type: "DELETE_CONFIG", id: token.id });
      if (!result?.ok) setStatus(result?.error || "Gagal menghapus token.", "error");
      else setStatus("Token dan konfigurasinya dihapus.", "success");
      await render();
    });
    actions.append(edit, refresh, copy, del);
    card.append(top, jwt, actions);
    tokenList.append(card);
  }
}
function makeButton(label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", () => void callback(button));
  return button;
}
function formatTime(timestamp) {
  if (!timestamp) return "belum pernah";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short"
  }).format(new Date(timestamp));
}
