import semver from 'semver';

type PackageJson = {
  dependencies?: {[key: string]: string},
  devDependencies?: {[key: string]: string}
};

/**
 * From a packageJson string, finds the valid semver associated with a package
 * name if it exists.
 */
export function semverForPackage(
    packageJson: PackageJson, name: string): string|null {
  if (packageJson.dependencies &&
      Object.keys(packageJson.dependencies).includes(name)) {
    const value = packageJson.dependencies[name];
    if (value && semver.valid(value)) {
      return value;
    }
  }

  if (packageJson.devDependencies &&
      Object.keys(packageJson.devDependencies).includes(name)) {
    const value = packageJson.devDependencies[name];
    if (value && semver.valid(value)) {
      return value;
    }
  }

  return null;
}

export function htmlRewrite(
    html: string, _packageJson: PackageJson = {}): string {
  return html;
}
