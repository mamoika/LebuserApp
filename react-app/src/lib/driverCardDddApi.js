const DDD_API_URL = import.meta.env.VITE_DDD_API_URL || '/api/driver-card-ddd';

async function callDddApi(sessionToken, file, fields = {}, employeeId = '') {
  const form = new FormData();
  form.append('file', file);
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });

  const scope = employeeId ? `?employee_id=${encodeURIComponent(employeeId)}` : '';
  const response = await fetch(`${DDD_API_URL}${scope}`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Import DDD nie powiódł się (${response.status})`);
  }
  return data;
}

export async function getDriverCardDddContext(sessionToken, employeeId = '') {
  const employeeScope = employeeId ? `&employee_id=${encodeURIComponent(employeeId)}` : '';
  const response = await fetch(`${DDD_API_URL}?action=context${employeeScope}`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Nie udało się pobrać archiwum DDD (${response.status})`);
  }
  return data;
}

export async function getDriverCardDddDetails(sessionToken, importId, employeeId = '') {
  const employeeScope = employeeId ? `&employee_id=${encodeURIComponent(employeeId)}` : '';
  const response = await fetch(`${DDD_API_URL}?action=details&id=${encodeURIComponent(importId)}${employeeScope}`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Nie udało się pobrać szczegółów DDD (${response.status})`);
  }
  return data;
}

export function parseDriverCardDdd(sessionToken, file, employeeId = '') {
  return callDddApi(sessionToken, file, { action: 'parse' }, employeeId);
}

export function importDriverCardDdd(sessionToken, file, employeeId, downloadedAt) {
  return callDddApi(sessionToken, file, {
    action: 'import',
    employee_id: employeeId,
    downloaded_at: downloadedAt,
  }, employeeId);
}
