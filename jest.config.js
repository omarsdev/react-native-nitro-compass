// `babel.config.js` uses the RN preset with the Metro-only `module:`
// prefix that plain Babel doesn't understand. The library code we test
// here is pure TypeScript with no RN-specific syntax, so we run Jest
// against a minimal preset list and ignore the RN config.
//
// Only `.test.ts` files are picked up — `__tests__/spec-shape.ts` is a
// type-level smoke test consumed by `tsc --noEmit`, not a Jest test.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
}
