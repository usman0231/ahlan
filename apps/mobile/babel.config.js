/**
 * Babel configuration.
 *
 * WatermelonDB models use legacy decorators. The decorator plugin is safe to
 * enable globally; `@babel/plugin-transform-class-properties` is deliberately
 * NOT added, because Babel runs plugins before presets and it would then sit
 * ahead of `preset-typescript` and break every `declare` field in other
 * packages (`expo-file-system`, for one). Scoping it with `overrides` is not an
 * option either: Metro builds its Babel cache key without a filename, and a
 * config containing a `test` pattern throws in that path.
 *
 * With legacy decorators and no class-properties transform, a decorated field
 * that has no initializer is defined through the decorator's descriptor rather
 * than as an own property - which is exactly what WatermelonDB needs. The one
 * requirement is that model fields carry no definite-assignment `!`, so
 * `strictPropertyInitialization` is off for this package.
 *
 * `react-native-worklets/plugin` must stay last.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      'react-native-worklets/plugin',
    ],
  };
};
