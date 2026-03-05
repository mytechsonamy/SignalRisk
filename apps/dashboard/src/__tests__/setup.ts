import '@testing-library/jest-dom';

// Polyfill ResizeObserver for jsdom (required by Recharts ResponsiveContainer)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
