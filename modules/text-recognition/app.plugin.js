const { withPodfile } = require('@expo/config-plugins');

function stripMlkitFrameworkScrub(contents) {
  return contents
    .split('\n')
    .filter((line) => {
      if (!line.includes('cleaned.gsub')) {
        return true;
      }
      return !(
        line.includes('MLKit') ||
        line.includes('GoogleMLKit') ||
        line.includes('MLImage')
      );
    })
    .join('\n');
}

function injectExcludedArchsFix(contents) {
  const scrubBlock = [
    '    Dir.glob(File.join(installer.sandbox.root, "Target Support Files", "**", "*.xcconfig")).each do |path|',
    '      text = File.read(path)',
    '      cleaned = text.gsub(/EXCLUDED_ARCHS\\[sdk=iphonesimulator\\*\\]\\s*=\\s*\\S+\\n?/, "")',
    '      File.write(path, cleaned) if text != cleaned',
    '    end',
  ].join('\n');

  if (contents.includes('Target Support Files", "**", "*.xcconfig')) {
    return contents;
  }

  const anchor = 'react_native_post_install(';

  if (!contents.includes(anchor)) {
    return contents;
  }

  return contents.replace(
    /(react_native_post_install\([\s\S]*?\n    \))/,
    `$1\n${scrubBlock}`
  );
}

module.exports = function withTextRecognitionIosPods(config) {
  return withPodfile(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    contents = stripMlkitFrameworkScrub(contents);
    contents = injectExcludedArchsFix(contents);
    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
