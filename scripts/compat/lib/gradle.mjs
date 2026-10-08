// The Android toolchain of a demo app's Android project. The React Native version dictates the
// Gradle version (its Android Gradle plugin refuses older ones) and the Android SDK its plugin can
// build against, so both are set to what the React Native app template for the target line uses, in
// every case: a demo app's committed values can be wrong even for its own React Native version, and
// a demo app written for a newer line asks for an SDK the target line's plugin cannot find. The
// Kotlin version is raised to the template's when the demo app's is older, and never lowered. The
// Android Gradle plugin opt-outs the template sets in gradle.properties are added when the demo app
// does not set them: a plugin that behaves differently by default from one line to the next breaks a
// demo app written for the previous line.

import { compareVersions, isVersion } from './semver.mjs';

export const WRAPPER_PROPERTIES = 'android/gradle/wrapper/gradle-wrapper.properties';
export const TEMPLATE_WRAPPER_PROPERTIES = `package/template/${WRAPPER_PROPERTIES}`;
export const BUILD_GRADLE = 'android/build.gradle';
export const TEMPLATE_BUILD_GRADLE = `package/template/${BUILD_GRADLE}`;
export const GRADLE_PROPERTIES = 'android/gradle.properties';
export const TEMPLATE_GRADLE_PROPERTIES = `package/template/${GRADLE_PROPERTIES}`;

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
// ndkVersion is not what the plugin's SDK lookup fails on.
export const SDK_VERSION_KEYS = ['compileSdkVersion', 'targetSdkVersion', 'buildToolsVersion'];

// The Kotlin Gradle plugin the demo app compiles with. It is raised to the template's so the demo app
// compiles its Kotlin with the version the line's own Kotlin code was built with, and never lowered:
// the library's own Kotlin code may need the newer one, and a newer plugin reads the older line fine.
export const KOTLIN_VERSION_KEY = 'kotlinVersion';

const VERSION_KEYS = [...SDK_VERSION_KEYS, KOTLIN_VERSION_KEY];

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
 * The SDK and Kotlin versions a root build.gradle names, by key, as values without quotes. Keys the
 * file does not set as a literal are absent.
 * @returns {Record<string, string>}
 */
export function sdkVersionsOf(buildGradle) {
  const versions = {};
  for (const key of VERSION_KEYS) {
    const literal = sdkVersionLine(key).exec(buildGradle ?? '')?.[2];
    if (literal !== undefined) versions[key] = sdkVersionValue(literal);
  }
  return versions;
}

/**
 * The changes to make so the demo app builds with the template's toolchain: one per SDK key the demo
 * app sets as a literal and the template sets differently, and kotlinVersion when the demo app's is a
 * version older than the template's. Empty when there is nothing to change or no template values.
 * @param {string} currentBuildGradle
 * @param {Record<string, string> | null | undefined} templateVersions as sdkVersionsOf returns them
 * @returns {{ name: string, from: string, to: string }[]}
 */
export function planSdkVersions(currentBuildGradle, templateVersions) {
  const current = sdkVersionsOf(currentBuildGradle);
  const differs = (key) => current[key] !== templateVersions[key];
  const older = (key) => isVersion(current[key]) && isVersion(templateVersions[key]) && compareVersions(current[key], templateVersions[key]) < 0;
  return VERSION_KEYS.filter((key) => key in current && templateVersions?.[key] != null && (key === KOTLIN_VERSION_KEY ? older(key) : differs(key))).map(
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
    if (!VERSION_KEYS.includes(key)) continue;
    text = text.replace(sdkVersionLine(key), (line, before, literal, after) => {
      const quote = /^["']/.exec(literal)?.[0] ?? (/^\d+$/.test(value) ? '' : '"');
      return `${before}${quote}${value}${quote}${after}`;
    });
  }
  return text;
}

// Android Gradle plugin behaviour the template opts out of in gradle.properties. AGP 9, which React
// Native 0.87 moved to, compiles Kotlin itself by default, and an app that applies the Kotlin plugin
// as well, as every template up to then did, fails: "Failed to apply plugin
// 'org.jetbrains.kotlin.android'. Cannot add extension with name 'kotlin'". The 0.87 template keeps
// applying the plugin and sets `android.builtInKotlin=false` (and `android.newDsl=false`); a demo app
// written for an earlier line has the plugin but not the opt-out. An opt-out the demo app sets, to
// either value, is its own choice and is kept.
export const AGP_OPT_OUT_KEYS = ['android.builtInKotlin', 'android.newDsl'];

function propertyLine(key) {
  return new RegExp(`^[ \\t]*${key.replace(/\./g, '\\.')}[ \\t]*=[ \\t]*(.*?)[ \\t]*$`, 'm');
}

/**
 * The opt-outs a gradle.properties sets, by key. Keys the file does not set are absent.
 * @returns {Record<string, string>}
 */
export function agpOptOutsOf(properties) {
  const values = {};
  for (const key of AGP_OPT_OUT_KEYS) {
    const value = propertyLine(key).exec(properties ?? '')?.[1];
    if (value !== undefined) values[key] = value;
  }
  return values;
}

/**
 * The opt-outs to add: one per key the template sets and the demo app does not. Empty when there is
 * nothing to add or no template values.
 * @param {string} currentProperties
 * @param {Record<string, string> | null | undefined} templateOptOuts as agpOptOutsOf returns them
 * @returns {{ name: string, to: string }[]}
 */
export function planAgpOptOuts(currentProperties, templateOptOuts) {
  const current = agpOptOutsOf(currentProperties);
  return AGP_OPT_OUT_KEYS.filter((key) => templateOptOuts?.[key] != null && !(key in current)).map((key) => ({ name: key, to: templateOptOuts[key] }));
}

/** The same gradle.properties with those keys appended, one per line; every existing line is kept. */
export function withAgpOptOuts(properties, optOuts) {
  const lines = Object.entries(optOuts)
    .filter(([key]) => AGP_OPT_OUT_KEYS.includes(key))
    .map(([key, value]) => `${key}=${value}`);
  if (lines.length === 0) return properties ?? '';
  const text = properties ?? '';
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  return `${text}${separator}${lines.join('\n')}\n`;
}
