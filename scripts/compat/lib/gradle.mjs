// The Android toolchain of a demo app's Android project. The React Native version dictates the
// Gradle version (its Android Gradle plugin refuses older ones) and the Android SDK its plugin can
// build against, so both are set to what the React Native app template for the target line uses, in
// every case: a demo app's committed values can be wrong even for its own React Native version, and
// a demo app written for a newer line asks for an SDK the target line's plugin cannot find.

export const WRAPPER_PROPERTIES = 'android/gradle/wrapper/gradle-wrapper.properties';
export const TEMPLATE_WRAPPER_PROPERTIES = `package/template/${WRAPPER_PROPERTIES}`;
export const BUILD_GRADLE = 'android/build.gradle';
export const TEMPLATE_BUILD_GRADLE = `package/template/${BUILD_GRADLE}`;

/** The distributionUrl value as written in the file ("https\://services.gradle.org/..."), or null. */
export function distributionUrlOf(properties) {
  return /^distributionUrl=(.+?)\s*$/m.exec(properties)?.[1] ?? null;
}

/** The same file with distributionUrl replaced; every other line is kept as it was. */
export function withDistributionUrl(properties, url) {
  return properties.replace(/^distributionUrl=.*$/m, `distributionUrl=${url}`);
}

/** "https\://services.gradle.org/distributions/gradle-9.4.1-bin.zip" -> "9.4.1", for logs. */
export function gradleVersionOf(url) {
  return /gradle-([\w.-]+?)-(?:bin|all)\.zip/.exec(url ?? '')?.[1] ?? url;
}

/**
 * The change to make, or null when there is nothing to change or no template value to take.
 * @returns {{ from: string, to: string } | null}
 */
export function planGradleWrapper(currentProperties, templateUrl) {
  const from = distributionUrlOf(currentProperties ?? '');
  if (!from || !templateUrl || from === templateUrl) return null;
  return { from, to: templateUrl };
}

// The SDK the template builds against, as the template's root build.gradle names it in
// `buildscript { ext { ... } }`. minSdkVersion is the library's requirement and is left alone;
// ndkVersion and kotlinVersion are not what the plugin's SDK lookup fails on.
export const SDK_VERSION_KEYS = ['compileSdkVersion', 'targetSdkVersion', 'buildToolsVersion'];

function sdkVersionLine(key) {
  // A literal value only: `compileSdkVersion = 36` or `buildToolsVersion = "36.0.0"`. An expression
  // is the demo app's own logic and is left as it is.
  return new RegExp(`^(\\s*${key}\\s*=\\s*)("[^"]*"|'[^']*'|\\d+)([ \\t]*)$`, 'm');
}

/** "36" for `36`, "36.0.0" for `"36.0.0"`: the value without its quotes, for comparing and logs. */
function sdkVersionValue(literal) {
  return literal.replace(/^["']|["']$/g, '');
}

/**
 * The SDK versions a root build.gradle names, by key, as values without quotes. Keys the file does not
 * set as a literal are absent.
 * @returns {Record<string, string>}
 */
export function sdkVersionsOf(buildGradle) {
  const versions = {};
  for (const key of SDK_VERSION_KEYS) {
    const literal = sdkVersionLine(key).exec(buildGradle ?? '')?.[2];
    if (literal !== undefined) versions[key] = sdkVersionValue(literal);
  }
  return versions;
}

/**
 * The changes to make so the demo app builds against the template's SDK: one per key the demo app
 * sets as a literal and the template sets differently. Empty when there is nothing to change or no
 * template values.
 * @param {string} currentBuildGradle
 * @param {Record<string, string> | null | undefined} templateVersions as sdkVersionsOf returns them
 * @returns {{ name: string, from: string, to: string }[]}
 */
export function planSdkVersions(currentBuildGradle, templateVersions) {
  const current = sdkVersionsOf(currentBuildGradle);
  return SDK_VERSION_KEYS.filter((key) => key in current && templateVersions?.[key] != null && current[key] !== templateVersions[key]).map(
    (key) => ({ name: key, from: current[key], to: templateVersions[key] }),
  );
}

/**
 * The same build.gradle with those keys set to the given values; every other line is kept as it was.
 * A number stays a number and a quoted value keeps its quotes.
 * @param {string} buildGradle
 * @param {Record<string, string>} versions
 */
export function withSdkVersions(buildGradle, versions) {
  let text = buildGradle ?? '';
  for (const [key, value] of Object.entries(versions)) {
    if (!SDK_VERSION_KEYS.includes(key)) continue;
    text = text.replace(sdkVersionLine(key), (line, before, literal, after) => {
      const quote = /^["']/.exec(literal)?.[0] ?? (/^\d+$/.test(value) ? '' : '"');
      return `${before}${quote}${value}${quote}${after}`;
    });
  }
  return text;
}
