// cie API 래퍼. 같은 오리진(/api) — Express 가 SPA 와 API 를 함께 서빙.
// 게스트 모드: 최초 방문 시 서버가 UUID 발급 → localStorage 에 보관, 모든 요청에 user 로 동봉.

const KEY = 'cie_uid';
let UID = localStorage.getItem(KEY) || null;

export function uid() { return UID; }

// 게스트 UUID 보장 (앱 시작 시 1회). 없으면 서버에서 발급받아 저장.
export async function ensureGuest() {
  if (UID) return UID;
  const r = await fetch('/api/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const d = await r.json();
  UID = d.user;
  localStorage.setItem(KEY, UID);
  return UID;
}

function withUser(path) {
  if (!UID) return path;
  return path + (path.includes('?') ? '&' : '?') + 'user=' + encodeURIComponent(UID);
}

async function jpost(path, body) {
  const r = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, user: UID }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}
async function jput(path, body) {
  const r = await fetch(`/api${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, user: UID }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}
async function jget(path) {
  const r = await fetch(`/api${withUser(path)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const ask = (body) => jpost('/ask', body);
export const logMeal = ({ label, verdict }) => jpost('/log', { label, verdict });
export const getHistory = (limit = 30) => jget(`/history?limit=${limit}`);
export const getSettings = () => jget('/settings');
export const saveSettings = (s) => jput('/settings', s);
export const getAccount = () => jget('/account');

// File → { media_type, data(base64, prefix 제거) }
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const [meta, data] = String(fr.result).split(',');
      const media_type = meta.slice(meta.indexOf(':') + 1, meta.indexOf(';'));
      resolve({ media_type, data });
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
