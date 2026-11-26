// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Design-system rules: screens get every colour, size and font from the tokens in src/design.
const noRawColours = [
  {
    selector: 'Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: 'Use a colour token (useTheme().color…) instead of a hex value. Raw colours live in src/design/tokens.',
  },
  {
    selector: 'Literal[value=/^(rgb|rgba|hsl|hsla)\\(/]',
    message: 'Use a colour token (useTheme().color…) instead of a raw colour. Raw colours live in src/design/tokens.',
  },
];
const screenOnly = [
  {
    selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression",
    message: 'No inline styles in screens: use a component prop, or makeStyles() with theme tokens.',
  },
  {
    selector: 'Property[key.name=/^(fontSize|fontWeight|fontFamily|lineHeight|letterSpacing)$/]',
    message: 'Use <Text variant="…"> from ui/components; text styles come from the type scale.',
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    // build output, mirroring .gitignore
    ignores: ['dist/*', 'dist-shared/*', 'web-build/*', '.expo/*', 'server/dist/*', 'server/dist-dev/*', '.aws-sam/*'],
  },
  {
    rules: {
      // guards against HTML entities in JSX text; React Native <Text> renders ' and " as written
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/design/tokens/**'],
    rules: { 'no-restricted-syntax': ['error', ...noRawColours] },
  },
  {
    files: ['src/app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...noRawColours, ...screenOnly],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput', 'StyleSheet'],
              message: 'Use Text and TextField from ui/components, and makeStyles() from design.',
            },
          ],
        },
      ],
    },
  },
]);
