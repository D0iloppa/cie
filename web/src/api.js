// cie API 래퍼. 같은 오리진(/api) — Express 가 SPA 와 API 를 함께 서빙.
async function jpost(path, body) {
  const r = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}
async function jput(path, body) {
  const r = await fetch(`/api${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}
async function jget(path) {
  const r = await fetch(`/api${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const ask = (body) => jpost('/ask', body);
export const logMeal = ({ label, verdict }) => jpost('/log', { label, verdict });
export const getHistory = (limit = 30) => jget(`/history?limit=${limit}`);
export const getSettings = () => jget('/settings');
export const saveSettings = (s) => jput('/settings', s);

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
