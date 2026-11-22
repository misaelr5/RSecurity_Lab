import tseslint from 'typescript-eslint'
export default [
  { ignores: ['**/dist/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  { rules: { 'no-debugger': 'error' } },
]
