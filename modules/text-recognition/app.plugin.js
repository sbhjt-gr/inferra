const { withPodfile } = require('@expo/config-plugins');

const MARKER = 'inferrlm_mlkit_sim_patch';
const OLD_MARKER = 'inferrlm_skip_mlkit_simulator';

const REQUIRE_LINE =
  `require File.expand_path('../node_modules/@react-native-ml-kit/text-recognition/ios/scripts/apple_silicon_simulator', __dir__) # ${MARKER}`;

const CALL_BLOCK = [
  `    # ${MARKER}`,
  '    mlkit_apple_silicon_simulator_patch(installer)',
].join('\n');

const OLD_SKIP_BLOCK = [
  `    # ${OLD_MARKER}`,
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
  '      if File.basename(path).start_with?("Pods-")',
  '        cleaned.gsub!(/^OTHER_LDFLAGS\\[sdk=iphonesimulator\\*\\]\\s*=\\s*.*\\n?/, "")',
  '        cleaned.gsub!(/^OTHER_LDFLAGS\\[sdk=iphoneos\\*\\]\\s*=\\s*.*\\n?/, "")',
  '        if cleaned =~ /^OTHER_LDFLAGS\\s*=\\s*(.*)$/',
  '          ldflags = $1.strip',
  '          device_extras = []',
  '          sim_ldflags = ldflags.dup',
  '          mlkit_frameworks.each do |fw|',
  '            if sim_ldflags.match?(/-framework\\s+"?#{Regexp.escape(fw)}"?\\b/)',
  '              device_extras << "-framework \\"#{fw}\\""',
  '            end',
  '            sim_ldflags.gsub!(/\\s*-framework\\s+"#{Regexp.escape(fw)}"/, "")',
  '            sim_ldflags.gsub!(/\\s*-framework\\s+#{Regexp.escape(fw)}\\b/, "")',
  '          end',
  '          sim_ldflags.gsub!(/\\s*-l"GoogleMLKit"/, "")',
  '          sim_ldflags.gsub!(/\\s*-lGoogleMLKit\\b/, "")',
  '          sim_ldflags = sim_ldflags.gsub(/\\s+/, " ").strip',
  '          cleaned.sub!(/^OTHER_LDFLAGS\\s*=\\s*.*$/, "OTHER_LDFLAGS = #{sim_ldflags}")',
  '          if device_extras.any?',
  '            cleaned << "\\nOTHER_LDFLAGS[sdk=iphoneos*] = $(inherited) #{device_extras.join(" ")}\\n"',
  '          end',
  '        end',
  '      end',
  '      File.write(path, cleaned) if text != cleaned',
  '    end',
].join('\n');

function stripOldSkipMlkitBlock(contents) {
  if (!contents.includes(OLD_MARKER)) {
    return contents;
  }

  if (contents.includes(OLD_SKIP_BLOCK)) {
    return contents.replace(`${OLD_SKIP_BLOCK}\n`, '').replace(OLD_SKIP_BLOCK, '');
  }

  return contents;
}

function injectMlkitSimPatch(contents) {
  let next = stripOldSkipMlkitBlock(contents);

  if (!next.includes(MARKER)) {
    if (next.includes('platform :ios')) {
      next = next.replace(/(platform :ios[^\n]*\n)/, `$1\n${REQUIRE_LINE}\n`);
    } else if (next.includes('prepare_react_native_project!')) {
      next = next.replace(
        'prepare_react_native_project!',
        `${REQUIRE_LINE}\n\nprepare_react_native_project!`
      );
    } else {
      next = `${REQUIRE_LINE}\n${next}`;
    }
  }

  if (!next.includes('mlkit_apple_silicon_simulator_patch(installer)')) {
    if (!next.includes('react_native_post_install(')) {
      return next;
    }

    next = next.replace(
      /(react_native_post_install\([\s\S]*?\n    \))/,
      (_, matched) => `${matched}\n${CALL_BLOCK}`
    );
  }

  return next;
}

function withTextRecognitionIosPods(config) {
  return withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = injectMlkitSimPatch(
      modConfig.modResults.contents
    );
    return modConfig;
  });
}

module.exports = withTextRecognitionIosPods;
module.exports.injectMlkitSimPatch = injectMlkitSimPatch;
module.exports.injectSkipMlkitSimulator = injectMlkitSimPatch;
module.exports.MARKER = MARKER;
