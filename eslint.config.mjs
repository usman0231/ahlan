// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      '**/metro.config.js',
      '**/babel.config.js',
      '**/jest.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'object-shorthand': 'warn',
    },
  },
  {
    /**
     * NestJS resolves constructor dependencies from `emitDecoratorMetadata`,
     * which needs the real class at runtime. `consistent-type-imports` sees a
     * constructor parameter as a type-only position and would rewrite
     * `import { ConfigService }` to `import type`, silently breaking injection.
     * The rule is off wherever decorators do the wiring.
     */
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Seeds and scripts are run by a human at a terminal; printing is the point.
    files: ['**/prisma/seed.ts', '**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    /**
     * The React app. The hooks rules earn their place here: a stale closure in
     * the inspection runner loses an inspector's answers, which is a data bug
     * rather than a style complaint.
     */
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /**
       * Reanimated shared values are mutable by design: assigning to
       * `sharedValue.value` is the documented way to drive an animation, and it
       * happens on the UI thread rather than through React state. The rule
       * cannot tell them apart from React-owned values, so it is off here;
       * every other hooks rule stays on.
       */
      'react-hooks/immutability': 'off',
      'react/jsx-key': 'error',
      /**
       * `allowAsProps` because navigator options take render props by design -
       * `tabBarIcon: ({ color }) => <Icon .../>` is the documented API, not an
       * accidental inline component.
       */
      'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
      // The new JSX transform needs neither.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
);
