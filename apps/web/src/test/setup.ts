import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 每個 test 後清掉 DOM，避免相互污染
afterEach(() => {
  cleanup();
});
