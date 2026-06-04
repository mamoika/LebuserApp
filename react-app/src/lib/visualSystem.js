export const ROUTE_COLORS = [
  '#007AFF',
  '#FF9500',
  '#AF52DE',
  '#FF3B30',
  '#32ADE6',
  '#34C759',
  '#5856D6',
  '#C49500',
  '#FF453A',
  '#636366',
];

export const STATUS_COLORS = {
  arrival: {
    color: '#1A7A37',
    background: '#E8F8EE',
    border: 'rgba(52,199,89,0.25)',
  },
  pickup: {
    color: '#0055CC',
    background: '#E5F1FF',
    border: 'rgba(0,122,255,0.20)',
  },
  done: {
    color: '#8E8E93',
    background: '#F2F2F7',
    border: 'rgba(0,0,0,0.06)',
  },
  urgent: {
    color: '#FF3B30',
    background: 'rgba(255,59,48,0.10)',
  },
  gpsOk: '#34C759',
  gpsMissing: '#FF9500',
};

export const OWN_ROUTE_STYLE = {
  borderColor: '#8FC7FF',
  boxShadow: '0 0 0 2px rgba(0,122,255,0.20)',
};

export function getRouteColorByDisplay(displayNum) {
  return ROUTE_COLORS[(Math.max(displayNum, 1) - 1) % ROUTE_COLORS.length];
}

export function getRouteColorByIndex(index) {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

export function routeBadgeStyle(displayNum) {
  const color = getRouteColorByDisplay(displayNum);
  return {
    background: `${color}1F`,
    color,
  };
}
