const config = require('@rubensworks/eslint-config');
const vitest = require('@vitest/eslint-plugin');
const requireAsyncIteratorAutostartFalse = require('./packages/utils-monorepo/lib/eslint/require-async-iterator-autostart-false');

module.exports = config([
  {
    plugins: {
      'comunica-rules': {
        rules: {
          'require-async-iterator-autostart-false': requireAsyncIteratorAutostartFalse,
        },
      },
    },
    rules: {
      'comunica-rules/require-async-iterator-autostart-false': 'error',
    },
  },
  {
    files: [ '**/*.ts' ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: [ './tsconfig.eslint.json' ],
      },
    },
  },
  {
    rules: {
      // Default
      'unicorn/consistent-destructuring': 'off',
      'unicorn/no-array-callback-reference': 'off',

      // TODO: check if these can be enabled
      'ts/naming-convention': 'off',
      'ts/no-unsafe-return': 'off',
      'ts/no-unsafe-argument': 'off',
      'ts/no-unsafe-assignment': 'off',

      'ts/no-require-imports': [ 'error', { allow: [
        'process/',
        'is-stream',
        'readable-stream-node-to-web',
      ]}],
      'ts/no-var-requires': [ 'error', { allow: [
        'process/',
        'is-stream',
        'readable-stream-node-to-web',
      ]}],
    },
  },
  {
    // @rubensworks/eslint-config's test rules (see `eslint/test.js` in that package) enable
    // `eslint-plugin-jest` on `**/test/**/*.ts`, which doesn't apply anymore now that the
    // project uses Vitest instead of Jest. The shared config's `disableJest` option (see
    // `index.js`) is used above to drop that block entirely, so this re-adds the non-Jest
    // overrides it also contained (copied from `eslint/test.js`) and enables the
    // `eslint-plugin-vitest` equivalents of its jest/* rules instead. Only the rules that also
    // exist in `eslint-plugin-jest` (renamed where needed) are enabled here, so that this
    // mirrors what was previously enforced instead of pulling in `eslint-plugin-vitest`'s
    // stricter/stylistic `all` preset (e.g. import-style and padding rules) which was never
    // enforced under Jest.
    files: [ '**/test/**/*.ts' ],
    plugins: { vitest },
    rules: {
      // Jest rule name -> Vitest rule name (identical unless noted); rules with no Vitest
      // equivalent (e.g. no-deprecated-functions, no-jasmine-globals, no-export, no-if,
      // no-confusing-set-timeout) are intentionally omitted.
      'vitest/consistent-test-it': 'error',
      // Rule is not smart enough to check called function in the test
      'vitest/expect-expect': 'off',
      // Default rules that are overkill
      'vitest/max-expects': 'off',
      'vitest/max-nested-describe': 'error',
      'vitest/no-alias-methods': 'error',
      'vitest/no-commented-out-tests': 'error',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-conditional-in-test': 'off',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-done-callback': 'error',
      'vitest/no-duplicate-hooks': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-hooks': 'off',
      'vitest/no-identical-title': 'error',
      'vitest/no-interpolation-in-snapshots': 'error',
      'vitest/no-large-snapshots': 'error',
      'vitest/no-mocks-import': 'error',
      // Was jest/no-restricted-jest-methods
      'vitest/no-restricted-vi-methods': 'error',
      'vitest/no-restricted-matchers': 'error',
      'vitest/no-standalone-expect': 'error',
      'vitest/no-test-prefixes': 'error',
      'vitest/no-test-return-statement': 'error',
      // Note: jest/no-untyped-mock-factory only applied to `jest.mock()` factories; the closest
      // Vitest rule, `vitest/require-mock-type-parameters`, has much broader scope (e.g. also
      // flags untyped `vi.fn()`/`vi.spyOn()` calls) so it isn't enabled here to avoid unrelated
      // churn - it can be considered separately.
      'vitest/prefer-called-with': 'error',
      'vitest/prefer-comparison-matcher': 'error',
      'vitest/prefer-each': 'error',
      'vitest/prefer-equality-matcher': 'error',
      'vitest/prefer-expect-assertions': 'off',
      'vitest/prefer-expect-resolves': 'error',
      'vitest/prefer-hooks-in-order': 'error',
      'vitest/prefer-hooks-on-top': 'error',
      'vitest/prefer-lowercase-title': 'off',
      'vitest/prefer-mock-promise-shorthand': 'error',
      'vitest/prefer-snapshot-hint': 'error',
      'vitest/prefer-spy-on': 'error',
      'vitest/prefer-strict-equal': 'off',
      'vitest/prefer-to-be': 'error',
      'vitest/prefer-to-contain': 'error',
      'vitest/prefer-to-have-length': 'error',
      'vitest/prefer-todo': 'error',
      'vitest/require-hook': 'off',
      'vitest/require-to-throw-message': 'error',
      'vitest/require-top-level-describe': 'error',
      'vitest/unbound-method': 'off',
      'vitest/valid-describe-callback': 'error',
      'vitest/valid-expect-in-promise': 'error',
      'vitest/valid-expect': 'error',
      'vitest/valid-title': 'off',

      // The following are non-Jest overrides from `eslint/test.js` in `@rubensworks/eslint-config`,
      // kept as-is since `disableJest` drops that whole block (including these).
      'max-statements-per-line': 'off',
      'id-length': 'off',
      'arrow-body-style': 'off',
      'line-comment-position': 'off',
      'no-inline-comments': 'off',
      'unicorn/filename-case': 'off',
      'no-new': 'off',
      'unicorn/no-nested-ternary': 'off',
      'no-return-assign': 'off',
      'no-useless-call': 'off',
      'no-sync': 'off',
      'import/no-extraneous-dependencies': 'off',
      'func-style': 'off',
      'unicorn/consistent-function-scoping': 'off',

      'test/prefer-lowercase-title': 'off',

      'ts/naming-convention': 'off',
      'ts/no-unsafe-argument': 'off',
      'ts/no-unsafe-assignment': 'off',
      'ts/no-unsafe-call': 'off',
      'ts/no-unsafe-member-access': 'off',
      'ts/no-unsafe-return': 'off',
      'ts/unbound-method': 'off',
      'ts/brace-style': 'off',
      'ts/ban-ts-comment': 'off',
      'ts/ban-ts-ignore': 'off',
      'ts/explicit-function-return-type': 'off',
      'ts/no-extra-parens': 'off',
      'ts/restrict-plus-operands': 'off',
      'ts/no-require-imports': 'off',
      'ts/no-var-requires': 'off',

      // Incorrectly detects usage of undefined in "toHaveBeenLastCalledWith" checks
      'unicorn/no-useless-undefined': 'off',
    },
  },
  {
    // Specific rules for NodeJS-specific files
    files: [
      '**/test/**/*.ts',
      '**/__mocks__/*.js',
      'packages/actor-dereference-file/**/*.ts',
      'packages/actor-http-native/**/*.ts',
      'packages/logger-bunyan/**/*.ts',
      'packages/packager/**/*.ts',
    ],
    rules: {
      'import/no-nodejs-modules': 'off',
      'ts/no-require-imports': 'off',
      'ts/no-var-requires': 'off',
    },
  },
  {
    files: [
      // Browser versions of files cannot follow the camelCase naming scheme
      '**/*-browser.ts',
      // The funding YAML file needs the specific uppercase name
      '.github/FUNDING.yml',
    ],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    // Only the packager makes use of dynamic require
    files: [
      'packages/packager/bin/package.ts',
    ],
    rules: {
      'import/no-dynamic-require': 'off',
    },
  },
  {
    // The config packages use an empty index.ts
    files: [
      'engines/config-*/lib/index.ts',
    ],
    rules: {
      'import/unambiguous': 'off',
    },
  },
  {
    // Some packages make use of 'export default'
    files: [
      'packages/actor-http-*/lib/*.ts',
      'packages/jest/**/*.ts',
    ],
    rules: {
      'import/no-anonymous-default-export': 'off',
      'import/no-default-export': 'off',
    },
  },
  {
    // Some test files import 'jest-rdf' which triggers this
    // Some jest tests import '../../lib' which triggers this
    files: [
      '**/test/*-test.ts',
      '**/test/*-util.ts',
      'packages/jest/test/matchers/*-test.ts',
    ],
    rules: {
      'import/no-unassigned-import': 'off',
    },
  },
  {
    // Spec test engines
    files: [
      '**/spec/*.js',
    ],
    rules: {
      'import/extensions': 'off',
      'ts/no-var-requires': 'off',
      'ts/no-require-imports': 'off',
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    // Webpack configurations
    files: [
      '**/webpack.config.js',
    ],
    rules: {
      'ts/no-var-requires': 'off',
      'ts/no-require-imports': 'off',
      'import/extensions': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/no-nodejs-modules': 'off',
    },
  },
  {
    // Vite/Vitest configurations
    files: [
      '**/vite.config.ts',
      '**/vite.config.base.ts',
      'vitest.config.ts',
    ],
    rules: {
      'import/extensions': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/no-nodejs-modules': 'off',
      'import/no-default-export': 'off',
      'import/no-anonymous-default-export': 'off',
      // Synchronous fs checks are fine in build-time config code (a synchronous Vite plugin hook).
      'no-sync': 'off',
    },
  },
  {
    files: [
      'eslint.config.js',
    ],
    rules: {
      'ts/no-var-requires': 'off',
      'ts/no-require-imports': 'off',
    },
  },
  {
    ignores: [
      // The engine bundles are auto-generated code
      'engines/*/engine-default.js',
      'engines/*/engine-browser.js',
      'engines/*/comunica-browser.js',
      'engines/*/comunica-browser-vite.js',
      // The performance combination files are auto-generated
      'performance/*/combinations/**',
      // TODO: Remove this once solid-client-authn supports node 18.
      'engines/query-sparql/test/QuerySparql-solid-test.ts',
      // Dev-only files that are not checked in
      '**/bintest/**',
      '**/componentsjs-error-state.json',
      'lerna.json',
    ],
  },
], { disableJest: true });
