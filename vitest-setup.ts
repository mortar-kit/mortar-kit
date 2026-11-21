// Test setup for every vitest project. In DOM (jsdom) projects: register
// jest-dom's matchers and unmount rendered components after each test
// (testing-library only auto-cleans with vitest globals, which are off).
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@solidjs/testing-library');
  afterEach(cleanup);
}
