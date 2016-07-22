import util
import unittest

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

if __name__ == '__main__':
  unittest.main()
