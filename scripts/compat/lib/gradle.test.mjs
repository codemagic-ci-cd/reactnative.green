import { describe, expect, it } from 'vitest';
import { distributionUrlOf, gradleVersionOf, missingAndroidApi, plainPlatformIdentity, planGradleWrapper, platformAlias, withDistributionUrl } from './gradle.mjs';

// The committed wrapper of react-native-screenshot-aware 1.3.21's demo app, and the template's for 0.84.
const committed = [
  'distributionBase=GRADLE_USER_HOME',
  'distributionPath=wrapper/dists',
  'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.12-all.zip',
  'networkTimeout=10000',
  'validateDistributionUrl=true',
  '',
].join('\n');
const template84 = 'https\\://services.gradle.org/distributions/gradle-9.0.0-bin.zip';

describe('Gradle wrapper', () => {
  it('reads and replaces distributionUrl, keeping every other line', () => {
    expect(distributionUrlOf(committed)).toBe('https\\://services.gradle.org/distributions/gradle-8.12-all.zip');
    const next = withDistributionUrl(committed, template84);
    expect(distributionUrlOf(next)).toBe(template84);
    expect(next.replace(template84, '')).toBe(committed.replace(distributionUrlOf(committed), ''));
  });

  it('changes the wrapper to the template value, and only when it differs', () => {
    expect(planGradleWrapper(committed, template84)).toEqual({ from: distributionUrlOf(committed), to: template84 });
    expect(planGradleWrapper(withDistributionUrl(committed, template84), template84)).toBeNull();
  });

  it('leaves the wrapper alone without a template value or a wrapper file', () => {
    expect(planGradleWrapper(committed, null)).toBeNull();
    expect(planGradleWrapper('', template84)).toBeNull();
  });

  it('names versions for the log', () => {
    expect(gradleVersionOf(template84)).toBe('9.0.0');
    expect(gradleVersionOf('https\\://services.gradle.org/distributions/gradle-8.12-all.zip')).toBe('8.12');
  });
});

describe('Android SDK platform alias', () => {
  const failure = "Failed to find target with hash string 'android-37' in: /usr/local/share/android-sdk";

  it('reads the missing API level, and the last one when the log was appended', () => {
    expect(missingAndroidApi(failure)).toBe('37');
    expect(missingAndroidApi(`${failure}\nFailed to find target with hash string 'android-36'`)).toBe('36');
    expect(missingAndroidApi('BUILD FAILED')).toBeNull();
  });

  it('picks the dotted platform only when the plain name is missing, preferring .0', () => {
    expect(platformAlias('37', ['android-37.0', 'android-37.1'])).toBe('android-37.0');
    expect(platformAlias('36', ['android-36.1'])).toBe('android-36.1');
    expect(platformAlias('36', ['android-36', 'android-36.1'])).toBeNull();
    expect(platformAlias('37', ['android-36.1'])).toBeNull();
    expect(platformAlias('37', [])).toBeNull();
  });

  it('renames the dotted platform identity and leaves a build-tools revision', () => {
    const source = ['AndroidVersion.ApiLevel=37.0', 'Pkg.Revision=2', 'Build.Tools=37.0.0'].join('\n');
    const xml = '<localPackage path="platforms;android-37.0"><api-level>37.0</api-level></localPackage>';
    expect(plainPlatformIdentity(source, 'android-37.0', 'android-37')).toBe(
      ['AndroidVersion.ApiLevel=37', 'Pkg.Revision=2', 'Build.Tools=37.0.0'].join('\n'),
    );
    expect(plainPlatformIdentity(xml, 'android-37.0', 'android-37')).toBe(
      '<localPackage path="platforms;android-37"><api-level>37</api-level></localPackage>',
    );
    expect(plainPlatformIdentity(source, 'android-37', 'android-37')).toBe(source);
  });
});
