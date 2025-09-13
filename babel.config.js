module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
    ],
    env: {
      production: {
        plugins: [
          'react-native-paper/babel',
          'transform-remove-console'
        ],
      },
    },
  };
};