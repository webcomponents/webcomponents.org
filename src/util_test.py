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
    self.assertEqual(util.generate_prefixes('andygreat'),
                     ['and', 'andy', 'andyg', 'andygr', 'andygre', 'andygrea'])
    self.assertEqual(util.generate_prefixes('andr'), ['and'])
    self.assertEqual(util.generate_prefixes('and'), [])

  def test_tokenise_more(self):
    self.assertEqual(util.tokenise_more('AndyGreat'), ['Andy', 'Great'])

  def test_generate_prefixes_from_list(self):
    self.assertEqual(util.generate_prefixes_from_list(['andygreat', 'AndyGreat']),
                     ['and', 'andygre', 'andygrea', 'andygr', 'andyg', 'gre', 'andy', 'grea'])

if __name__ == '__main__':
  unittest.main()
