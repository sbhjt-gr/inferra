const { withPodfile } = require('@expo/config-plugins');

const MARKER = 'inferrlm_skip_mlkit_simulator';

const SKIP_MLKIT_BLOCK = [
  `    # ${MARKER}`,
  '    mlkit_frameworks = %w[',
  '      MLImage',
  '      MLKitCommon',
  '      MLKitTextRecognition',
  '      MLKitTextRecognitionChinese',
  '      MLKitTextRecognitionCommon',
  '      MLKitTextRecognitionDevanagari',
  '      MLKitTextRecognitionJapanese',
  '      MLKitTextRecognitionKorean',
  '      MLKitVision',
  '    ]',
  '    mlkit_prefixes = %w[GoogleMLKit MLImage MLKit]',
  '    installer.pods_project.targets.each do |target|',
  '      next unless mlkit_prefixes.any? { |prefix| target.name == prefix || target.name.start_with?(prefix) }',
  '      target.build_configurations.each do |config|',
  "        config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64 x86_64'",
  '      end',
  '    end',
  '    Dir.glob(File.join(installer.sandbox.root, "Target Support Files", "**", "*.xcconfig")).each do |path|',
  '      text = File.read(path)',
  '      cleaned = text.gsub(/EXCLUDED_ARCHS\\[sdk=iphonesimulator\\*\\]\\s*=\\s*\\S+\\n?/, "")',
  '      if File.basename(path).start_with?("Pods-") && cleaned =~ /^OTHER_LDFLAGS\\s*=\\s*(.*)$/',
  '        ldflags = $1.strip',
  '        sim_ldflags = ldflags.dup',
  '        mlkit_frameworks.each do |fw|',
  '          sim_ldflags.gsub!(/\\s*-framework\\s+"#{Regexp.escape(fw)}"/, "")',
  '          sim_ldflags.gsub!(/\\s*-framework\\s+#{Regexp.escape(fw)}\\b/, "")',
  '        end',
  '        sim_ldflags.gsub!(/\\s*-l"GoogleMLKit"/, "")',
  '        sim_ldflags = sim_ldflags.gsub(/\\s+/, " ").strip',
  '        unless cleaned.include?("OTHER_LDFLAGS[sdk=iphonesimulator*]")',
  '          cleaned << "\\nOTHER_LDFLAGS[sdk=iphonesimulator*] = #{sim_ldflags}\\n"',
  '        end',
  '      end',
  '      File.write(path, cleaned) if text != cleaned',
  '    end',
].join('\n');

function stripOldExcludedArchsScrub(contents) {
  const oldScrub = [
    '    Dir.glob(File.join(installer.sandbox.root, "Target Support Files", "**", "*.xcconfig")).each do |path|',
    '      text = File.read(path)',
    '      cleaned = text.gsub(/EXCLUDED_ARCHS\\[sdk=iphonesimulator\\*\\]\\s*=\\s*\\S+\\n?/, "")',
    '      File.write(path, cleaned) if text != cleaned',
    '    end',
  ].join('\n');

  if (!contents.includes(oldScrub)) {
    return contents;
  }
  return contents.replace(oldScrub, '');
}

function injectSkipMlkitSimulator(contents) {
  let next = stripOldExcludedArchsScrub(contents);

  if (next.includes(MARKER)) {
    return next;
  }

  if (!next.includes('react_native_post_install(')) {
    return next;
  }

  return next.replace(
    /(react_native_post_install\([\s\S]*?\n    \))/,
    (_, matched) => `${matched}\n${SKIP_MLKIT_BLOCK}`
  );
}

function withTextRecognitionIosPods(config) {
  return withPodfile(config, (modConfig) => {
    console.log('mlkit_sim_skip_plugin');
    modConfig.modResults.contents = injectSkipMlkitSimulator(
      modConfig.modResults.contents
    );
    return modConfig;
  });
}

module.exports = withTextRecognitionIosPods;
