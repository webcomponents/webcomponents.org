import {test} from 'ava';
import {resolveToUnpkg} from '../proxy';

test('unscoped package', (t) => {
  const incoming = '/package@1.0.0/demo/index.html';
  const outgoing = 'https://unpkg.com/package@1.0.0/demo/index.html';
  t.is(resolveToUnpkg(incoming), outgoing);
});

test('scoped package', (t) => {
  const incoming = '/@polymer/paper-button@3.0.0/demo/index.html';
  const outgoing =
      'https://unpkg.com/@polymer/paper-button@3.0.0/demo/index.html';
  t.is(resolveToUnpkg(incoming), outgoing);
});

test('scoped package with prerelease tag', (t) => {
  const incoming = '/@polymer/paper-button@3.0.0-pre.23/demo/index.html';
  const outgoing =
      'https://unpkg.com/@polymer/paper-button@3.0.0-pre.23/demo/index.html';
  t.is(resolveToUnpkg(incoming), outgoing);
});

test('scoped package with no path', (t) => {
  const incoming = '/@polymer/paper-button@2.0.0';
  const outgoing = 'https://unpkg.com/@polymer/paper-button@2.0.0';
  t.is(resolveToUnpkg(incoming), outgoing);
});

test('scoped package with no path, no leading /', (t) => {
  const incoming = '@polymer/paper-button@2.0.0';
  const outgoing = 'https://unpkg.com/@polymer/paper-button@2.0.0';
  t.is(resolveToUnpkg(incoming), outgoing);
});
