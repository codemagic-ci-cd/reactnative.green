// The Gradle wrapper of a demo app's Android project. The React Native version dictates the Gradle
// version (its Android Gradle plugin refuses older ones), so the wrapper is set to what the React
// Native app template for the target line uses, in every case: a demo app's committed wrapper can be
// wrong even for its own React Native version.

export const WRAPPER_PROPERTIES = 'android/gradle/wrapper/gradle-wrapper.properties';
export const TEMPLATE_WRAPPER_PROPERTIES = `package/template/${WRAPPER_PROPERTIES}`;

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

/**
 * The API level from Gradle's "Failed to find target with hash string 'android-37'", or null.
 * The last match wins: a retried build appends to the same log.
 */
export function missingAndroidApi(log) {
  const matches = [...(log ?? '').matchAll(/Failed to find target with hash string 'android-(\d+)'/g)];
  return matches.at(-1)?.[1] ?? null;
}

/**
 * The installed platform directory Gradle should ask for instead of `android-${api}`, or null when
 * the plain name is already there or no dotted platform (`android-37.0`) is. `android-N.0` wins when
 * several minors are installed. Names are the entries of `$ANDROID_SDK_ROOT/platforms`.
 * @param {string} api
 * @param {string[]} names
 * @returns {string | null}
 */
export function platformAlias(api, names) {
  if (!/^\d+$/.test(api ?? '')) return null;
  const plain = `android-${api}`;
  if (names.includes(plain)) return null;
  const dotted = names.filter((name) => name.startsWith(`${plain}.`) && /^\d+$/.test(name.slice(plain.length + 1)));
  if (dotted.includes(`${plain}.0`)) return `${plain}.0`;
  return dotted.sort((a, b) => Number(a.slice(plain.length + 1)) - Number(b.slice(plain.length + 1))).at(-1) ?? null;
}

/**
 * Compile SDK lines that ask for `api` (a literal, or a property this project sets to that integer),
 * rewritten to the installed platform's directory name. `compileSdkVersion = 37` in an `ext` block is
 * left as a number: library build files compare it. Returns the files whose text changed.
 * @param {{ path: string, text: string }[]} files
 * @param {string} api
 * @param {string} hash directory name, such as "android-37.0"
 * @returns {{ path: string, text: string }[]}
 */
export function planDottedCompileSdk(files, api, hash) {
  if (!/^\d+$/.test(api ?? '') || !/^android-\d+\.\d+$/.test(hash ?? '')) return [];
  const extMatches = files.some((file) => new RegExp(`(?:^|\\n)[ \\t]*compileSdkVersion\\s*=\\s*${api}\\b`).test(file.text));
  const changed = [];
  for (const file of files) {
    const text = rewriteCompileSdk(file.text, api, hash, extMatches, file.path.endsWith('.kts'));
    if (text !== file.text) changed.push({ path: file.path, text });
  }
  return changed;
}

function rewriteCompileSdk(text, api, hash, extMatches, kts) {
  const quoted = kts ? `compileSdkVersion("${hash}")` : `compileSdkVersion "${hash}"`;
  const uses = text.replace(/^([ \t]*)compileSdk(Version)?[ \t]+(.+?)[ \t]*$/gm, (line, indent, _suffix, rhs) => {
    if (rhs.startsWith('=')) return line;
    const literal = rhs === api;
    const viaExt = extMatches && /\bcompileSdk(?:Version)?\b/.test(rhs);
    return literal || viaExt ? `${indent}${quoted}` : line;
  });
  return uses.replace(/^([ \t]*)compileSdk[ \t]*=[ \t]*(\d+)[ \t]*$/gm, (line, indent, level) => (level === api ? `${indent}${quoted}` : line));
}
