# cutsom-elements-manifest-tools

A collection of utilities for working with [Custom Element Manifest](https://github.com/webcomponents/custom-elements-manifest) files.

```bash
npm i @webcomponents/cutsom-elements-manifest-tools
```

### `lib/validate.js`

An npm package validator. Checks a package and its custom elements manifest for structural validity and common errors.

Checks:
 - `package.json` contains `"customElements"` field
 - Custom elements manifest file exists
 - Custom elements manifest file is valid JSON
 - Custom elements manifest schema version is supported
 - TODO: Custom elements manifest validates against the JSON schema
 - TODO: Package contains at least one custom element
 - TODO: Every module in the manifest exists in the package and is a standard JavaScript module (ie, package.json has type:module, file extension is .mjs, and/or file is listed in package exports default/import condition)
 - TODO: Every reference in the manifest succesfully resolves
 - TODO: Every export in the manifest succesfully resolves to a declaration
 - TODO: Every export in the manifest is exported by their respective JavaScript module
 - TODO: (warning) variables, parameters, properties, etc., have types
 - TODO: (warning) type strings have type references
 - TODO: (warning) Global type references are known (ie, check against `lib.d.ts` and `lib.dom.d.ts` or MDN)
 - TODO: (warning) Each element (possibly other exports) has a description
 - TODO: All names that need to be unique within a scope are unique: exports, declarations, class members, function parameters, etc.

### `index.js`

 - `getCustomElements()`: Gets all the custom element exports of a package
 - `getModule()`: Gets a module by path
 - `referenceString()`: Serialize a CEM reference to a string
 - `parseReferenceString()`: Deserialize a CEM reference from a string
