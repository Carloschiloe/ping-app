# SDK 57 — Lint Compatibility

**Causa:** el upgrade a Expo SDK 57 subió `eslint-config-expo` (10.0.0 → 57.0.2),
que trae `eslint-plugin-react-hooks@^7` vía `plugin:react-hooks/recommended`.
Ese preset activa como `error` un set nuevo de reglas orientadas a
React Compiler (`refs`, `set-state-in-effect`, `immutability`,
`static-components`, `purity`, `preserve-manual-memoization`), que no
formaban parte del gate histórico del proyecto. El codebase preexistente
no fue escrito bajo esas restricciones: 101 errores en ~24 archivos, cero
relación con el runtime (arranque/login/chats/video/audio ya certificados
en iPhone tras el upgrade).

**Decisión:** degradar esas 6 reglas a `warn` de forma centralizada en
`mobile/eslint.config.js` (no `eslintrc` en 24 archivos). Se pospone su
adopción progresiva. `react-hooks/rules-of-hooks` (error) y
`react-hooks/exhaustive-deps` (warn) — el gate histórico — no se tocan.
Lint global no se desactiva: TypeScript, imports, sintaxis y el resto de
reglas de React siguen activas igual que antes.

**Deuda futura:** adoptar progresivamente las reglas de React Compiler
(`refs`, `set-state-in-effect`, `immutability`, `static-components`,
`purity`, `preserve-manual-memoization`) archivo por archivo, y evaluar
`experiments.reactCompiler` en `app.json` cuando el codebase esté listo.
