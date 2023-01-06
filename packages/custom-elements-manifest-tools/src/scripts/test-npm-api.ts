import {NpmAndUnpkgFiles} from '../lib/npm-and-unpkg-files.js';

const files = new NpmAndUnpkgFiles();
try {
  const result = await files.getPackageMetadata('aksjhasdhoashdakjsdh');
  console.log('result', result);
} catch (e) {
  console.log('error', e);
}
