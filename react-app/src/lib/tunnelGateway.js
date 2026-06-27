const gatewayUrl = (import.meta.env.VITE_TUNNEL_GATEWAY_URL || '').replace(/\/+$/, '');
const gatewayKey = import.meta.env.VITE_TUNNEL_GATEWAY_KEY || '';

export function isTunnelGatewayEnabled() {
  return Boolean(gatewayUrl);
}

async function gatewayFetch(path, options = {}) {
  if (!gatewayUrl) {
    throw new Error('Tunnel gateway URL is not configured');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (gatewayKey) {
    headers['X-Lebuser-Gateway-Key'] = gatewayKey;
  }

  const response = await fetch(`${gatewayUrl}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.title || response.statusText || 'Gateway request failed');
  }

  return payload;
}

export function getTunnelGatewayStatus() {
  return gatewayFetch('/api/status');
}

export function sendTunnelCommand(command) {
  return gatewayFetch('/api/tunnel/send', {
    method: 'POST',
    body: JSON.stringify(command),
  });
}
