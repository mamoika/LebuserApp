function browserFromUserAgent(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/CriOS\//.test(ua)) return 'Chrome iOS';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/FxiOS\//.test(ua)) return 'Firefox iOS';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

function osFromUserAgent(ua, platform) {
  const source = `${ua} ${platform}`;
  if (/iPad|iPhone|iPod/.test(source)) return 'iOS';
  if (/Android/.test(source)) return 'Android';
  if (/Mac OS X|MacIntel|MacPPC|Mac68K/.test(source)) return 'macOS';
  if (/Windows/.test(source)) return 'Windows';
  if (/Linux/.test(source)) return 'Linux';
  return platform || 'Unknown OS';
}

function deviceTypeFromUserAgent(ua, isMobile) {
  if (/iPad|Tablet/.test(ua)) return 'Tablet';
  if (isMobile || /Mobi|Android|iPhone|iPod/.test(ua)) return 'Mobile';
  return 'Desktop';
}

export function getSessionDeviceInfo() {
  if (typeof navigator === 'undefined') {
    return { device_label: 'Unknown device', user_agent: '' };
  }

  const ua = navigator.userAgent || '';
  const uaData = navigator.userAgentData;
  const platform = uaData?.platform || navigator.platform || '';
  const uaForDetection = platform === 'MacIntel' && navigator.maxTouchPoints > 1 ? `${ua} iPad` : ua;
  const browser = uaData?.brands?.find(brand => !/Not.?A.?Brand/i.test(brand.brand))?.brand
    || browserFromUserAgent(ua);
  const os = osFromUserAgent(uaForDetection, platform);
  const type = deviceTypeFromUserAgent(uaForDetection, Boolean(uaData?.mobile));
  const deviceLabel = [type, browser, os]
    .filter(Boolean)
    .join(' / ');

  return {
    device_label: deviceLabel || 'Unknown device',
    user_agent: ua,
  };
}
