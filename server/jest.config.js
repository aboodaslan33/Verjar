/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/env.ts'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  testTimeout: 30000,
  // الاختبارات تشترك في قاعدة بيانات واحدة
  maxWorkers: 1,
};
