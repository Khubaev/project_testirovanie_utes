const API = '/api';

export async function submitSurvey(data) {
  const res = await fetch(`${API}/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

const DEVICE_ID_STORAGE = 'guest_survey_device_id';
const SUBMITTED_STORAGE = 'guest_survey_submitted';

export function getOrCreateDeviceId() {
  let id = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_ID_STORAGE) : null;
  if (!id && typeof crypto !== 'undefined' && crypto.randomUUID) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE, id);
  }
  return id || null;
}

export function hasAlreadySubmitted() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(SUBMITTED_STORAGE) === '1';
}

export function markAsSubmitted() {
  if (typeof localStorage !== 'undefined') localStorage.setItem(SUBMITTED_STORAGE, '1');
}

export function clearSubmittedFlag() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SUBMITTED_STORAGE);
}

/** Проверка по серверу: есть ли ответ с данным device_id в БД */
export async function checkSubmittedOnServer(deviceId) {
  if (!deviceId) return false;
  const res = await fetch(`${API}/surveys/check?device_id=${encodeURIComponent(deviceId)}`);
  if (!res.ok) return false;
  const data = await res.json();
  return data.submitted === true;
}

export async function getStats() {
  const res = await fetch(`${API}/surveys/stats`);
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

export async function getRooms() {
  const res = await fetch(`${API}/surveys/rooms`);
  if (!res.ok) throw new Error('Не удалось загрузить список комнат');
  return res.json();
}
