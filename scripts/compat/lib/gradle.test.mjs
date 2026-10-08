import { describe, expect, it } from 'vitest';
import { distributionUrlOf, gradleVersionOf, planGradleWrapper, planSdkVersions, sdkVersionsOf, withDistributionUrl, withSdkVersions } from './gradle.mjs';

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

// The buildscript ext block of react-native-screens 4.28.0's FabricExample (written for 0.87), and
// the template's for 0.86.3.
const demoBuildGradle = `buildscript {
    ext {
        buildToolsVersion = "37.0.0"
        minSdkVersion = 25
        compileSdkVersion = 37
        targetSdkVersion = 36
        ndkVersion = "27.1.12297006"
        kotlinVersion = "2.3.21"
    }
    repositories {
        google()
    }
}
`;
const templateBuildGradle = `buildscript {
    ext {
        buildToolsVersion = "36.0.0"
        minSdkVersion = 24
        compileSdkVersion = 36
        targetSdkVersion = 36
        ndkVersion = "27.1.12297006"
        kotlinVersion = "2.1.20"
    }
}
`;

const template = { buildToolsVersion: '36.0.0', compileSdkVersion: '36', targetSdkVersion: '36', kotlinVersion: '2.1.20' };

describe('Android SDK versions', () => {

  it('reads literal values without quotes and skips expressions', () => {
    expect(sdkVersionsOf(templateBuildGradle)).toEqual(template);
    expect(sdkVersionsOf('compileSdkVersion = rootProject.ext.has("x") ? 36 : 35\nbuildToolsVersion = "35.0.0"')).toEqual({
      buildToolsVersion: '35.0.0',
    });
    expect(sdkVersionsOf('')).toEqual({});
  });

  it('plans one change per key the demo app sets differently from the template', () => {
    expect(planSdkVersions(demoBuildGradle, template)).toEqual([
      { name: 'compileSdkVersion', from: '37', to: '36' },
      { name: 'buildToolsVersion', from: '37.0.0', to: '36.0.0' },
    ]);
    expect(planSdkVersions(templateBuildGradle, template)).toEqual([]);
    expect(planSdkVersions(demoBuildGradle, null)).toEqual([]);
    expect(planSdkVersions('android {}', template)).toEqual([]);
  });

  it('rewrites only those lines, keeping numbers and quotes as they were', () => {
    const next = withSdkVersions(demoBuildGradle, { compileSdkVersion: '36', buildToolsVersion: '36.0.0' });
    expect(next).toBe(demoBuildGradle.replace('compileSdkVersion = 37', 'compileSdkVersion = 36').replace('"37.0.0"', '"36.0.0"'));
    expect(withSdkVersions("buildToolsVersion = '37.0.0'\n", { buildToolsVersion: '36.0.0' })).toBe("buildToolsVersion = '36.0.0'\n");
    expect(withSdkVersions(demoBuildGradle, { minSdkVersion: '24', ndkVersion: '1' })).toBe(demoBuildGradle);
    expect(sdkVersionsOf(next)).toEqual({ ...template, kotlinVersion: '2.3.21' });
  });
});

// The buildscript ext block of react-native-bootsplash 7.3.3's example (written for 0.86), and the
// template's for 0.87.1, whose React Native Gradle plugin applies Kotlin 2.2.0 itself.
const bootsplashBuildGradle = `buildscript {
    ext {
        buildToolsVersion = "36.0.0"
        minSdkVersion = 24
        compileSdkVersion = 36
        targetSdkVersion = 36
        ndkVersion = "27.1.12297006"
        kotlinVersion = "2.1.20"
    }
}
`;

describe('Kotlin version', () => {
  const template87 = { buildToolsVersion: '36.0.0', compileSdkVersion: '36', targetSdkVersion: '36', kotlinVersion: '2.2.0' };

  it('raises an older kotlinVersion to the template value', () => {
    expect(planSdkVersions(bootsplashBuildGradle, template87)).toEqual([{ name: 'kotlinVersion', from: '2.1.20', to: '2.2.0' }]);
    const next = withSdkVersions(bootsplashBuildGradle, { kotlinVersion: '2.2.0' });
    expect(next).toBe(bootsplashBuildGradle.replace('"2.1.20"', '"2.2.0"'));
    expect(planSdkVersions(next, template87)).toEqual([]);
  });

  it('never lowers a newer kotlinVersion', () => {
    // screens 4.28.0's demo app pins 2.3.21 and builds on 0.86, whose template has 2.1.20.
    expect(planSdkVersions(demoBuildGradle, template).map((c) => c.name)).not.toContain('kotlinVersion');
    expect(planSdkVersions(bootsplashBuildGradle, { kotlinVersion: '2.1.20' })).toEqual([]);
  });

  it('leaves a kotlinVersion alone when either value is not a version', () => {
    expect(planSdkVersions(bootsplashBuildGradle, { kotlinVersion: 'latest' })).toEqual([]);
    expect(planSdkVersions('kotlinVersion = "2.1"\n', { kotlinVersion: '2.2.0' })).toEqual([]);
    expect(planSdkVersions('kotlinVersion = project.kotlin\n', { kotlinVersion: '2.2.0' })).toEqual([]);
  });
});
