import unittest
import util

class InlineDemoTransformTest(unittest.TestCase):
  def test_comment_strip(self):
    codesnippet = '''```html
<custom-element-demo width="500" height="500">
  <template>
    <link rel=import polymer-foo>
    <next-code-block></next-code-block>
  </template>
</custom-element-demo>
```
'''
    prefix = '== some markdown ==\n'
    suffix = '=== more markdown ===\n'
    markdown = prefix + '<!---\n' + codesnippet + '-->\n' + suffix
    expected = prefix + codesnippet + suffix
    self.assertEqual(util.inline_demo_transform(markdown), expected)

  def test_generate_prefixes(self):
    self.assertEqual(util.generate_prefixes('thisisword'),
                     ['thi', 'this', 'thisi', 'thisis', 'thisisw', 'thisiswo', 'thisiswor'])
    self.assertEqual(util.generate_prefixes('this'), ['thi'])
    self.assertEqual(util.generate_prefixes('thi'), [])

  def test_tokenise_more(self):
    self.assertEqual(util.tokenise_more('ThisIsWord'), ['This', 'Is', 'Word'])

  def test_generate_prefixes_from_list(self):
    self.assertEqual(util.generate_prefixes_from_list(['ThisIsWord', 'moon']),
                     ['thisiswo', 'thisiswor', 'this', 'thisisw', 'wor', 'thisi', 'thisis', 'moo', 'thi'])

  def test_generate_prefixes_split(self):
    self.assertEqual(sorted(util.generate_prefixes_from_list(util.safe_split_strip('material-toggle/button'))),
                     ['but', 'butt', 'butto', 'mat', 'mate', 'mater', 'materi', 'materia', 'tog', 'togg', 'toggl'])

if __name__ == '__main__':
  unittest.main()
