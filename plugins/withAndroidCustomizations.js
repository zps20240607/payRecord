const { withProjectBuildGradle, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Load .env.local for signing credentials
function loadEnv(projectRoot) {
  const envPath = path.join(projectRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

module.exports = function withAndroidCustomizations(config) {
  // Load env vars early
  loadEnv(config._projectRoot || process.cwd());
  // 1. Add notifee maven repo
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      const notifeeRepo =
        'maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';
      if (!config.modResults.contents.includes('notifee/react-native/android/libs')) {
        config.modResults.contents = config.modResults.contents.replace(
          /allprojects\s*\{\s*repositories\s*\{/,
          (match) => match + '\n        ' + notifeeRepo
        );
      }
    }
    return config;
  });

  // 2. Inject release signing config from .env.local
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      let contents = config.modResults.contents;

      // 纯 release 发布：不区分 debug/.dev 包，两个构建类型共用同一 applicationId。
      // 幂等移除旧版本插件注入的 .dev 后缀（放在签名守卫之前，任何时候 prebuild 都生效）
      contents = contents.replace(/\n\s*applicationIdSuffix\s+["']\.dev["']/g, '');

      // Groovy 单引号字符串转义，防止密码含 \ 或 ' 破坏构建脚本
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const keystorePassword = esc(process.env.KEYSTORE_PASSWORD || '');
      const keyAlias = esc(process.env.KEY_ALIAS || '');
      const keyPassword = esc(process.env.KEY_PASSWORD || '');

      if (!keystorePassword) {
        console.log('[withAndroidCustomizations] No KEYSTORE_PASSWORD env, skipping signing config injection.');
        config.modResults.contents = contents;
        return config;
      }

      const signingBlock = `
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file('release.jks')
            storePassword '${keystorePassword}'
            keyAlias '${keyAlias}'
            keyPassword '${keyPassword}'
        }
    }`;

      // Replace existing signingConfigs block
      contents = contents.replace(
        /signingConfigs\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/s,
        signingBlock
      );

      // 只把 release 构建类型的签名引用指向 release 签名，
      // 不再整块替换 buildTypes——保留模板里的 minifyEnabled / shrinkResources / crunchPngs / proguardFiles
      contents = contents.replace(
        /(release\s*\{[^}]*?)signingConfig\s+signingConfigs\.\w+/,
        '$1signingConfig signingConfigs.release'
      );

      config.modResults.contents = contents;
    }
    return config;
  });

  // 3. Copy release.jks to android/app/ if it exists in project root
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const jksSource = path.join(config.modRequest.projectRoot, 'release.jks');
      const jksDest = path.join(config.modRequest.platformProjectRoot, 'app', 'release.jks');

      if (fs.existsSync(jksSource) && !fs.existsSync(jksDest)) {
        fs.copyFileSync(jksSource, jksDest);
        console.log('[withAndroidCustomizations] Copied release.jks to android/app/');
      }
      return config;
    },
  ]);

  return config;
};
