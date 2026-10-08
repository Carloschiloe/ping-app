// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // The shipped app entrypoint is App.tsx. These are unused Expo Router
    // starter files retained in the repository, but expo-router is not part
    // of Ping's navigation/runtime dependency graph.
    ignores: ['dist/*', 'app/**/*', 'components/external-link.tsx'],
  },
  {
    // SDK 57 bump trajo eslint-plugin-react-hooks@7 vía eslint-config-expo,
    // cuyo preset "recommended" activa como error el set de reglas orientadas
    // a React Compiler (no forma parte del gate histórico del proyecto). El
    // código preexistente no fue escrito bajo esas restricciones; se degradan
    // a warning para no bloquear CI ni forzar un refactor masivo ahora, sin
    // perder la señal para una adopción progresiva futura. rules-of-hooks y
    // exhaustive-deps (el gate histórico) NO se tocan.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // These tests invoke the hook with deterministic native-module mocks;
    // they are not React render functions. Keep the runtime hook contract
    // covered by the tests while disabling this naming heuristic only for
    // the test pattern.
    files: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
]);
