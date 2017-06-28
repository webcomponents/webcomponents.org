# API
Before using the API, please file an issue with your intention of using the API.

You can access the API at `www.webcomponents.org/api/<method>`. Example search API call: https://www.webcomponents.org/api/search/input.

## NPM packages
For relevant endpoints, owner and repo can be replaced my the NPM's scope and package
name. For packages without a scope, specify the scope `@@npm`.

## Get data for an author
```
GET /api/meta/:author
```

## Get latest data for a component
```
GET /api/meta/:owner/:repo
```

Optionally, you can provide a specific tagged release version
```
GET /api/meta/:owner/:repo/:version
```

## Get analysis data for a component
```
GET /api/docs/:owner/:repo
```

Optionally, you can specify a specific version:
```
GET /api/docs/:owner/:repo/:version
```

## Get custom page for a component
In cases where a component specificies custom markdown files, the corresponding HTML is served via this API. Note version is not optional. The paths can be discovered from the `meta` response.
```
GET /api/page/:owner/:repo/:version/:path
```

## Get collection dependencies
```
GET /api/dependencies/:owner/:repo
```

## List collections referencing a component or collection
```
GET /api/collections/:owner/:repo
```

## Search all components & collections
```
GET /api/search/:query
```

There are several parameter options:

name       | description
---        | ---
noscore    | If specified, results are not scored. Use when sorting is not important.
noresults  | If specified, no results are returned. Use when only counts are required.
limit      | A number specifying a maximum number of results in response. Default: 20
count      | If specified, requests an accurate count to be made
cursor     | Cursor string from a previous search API query to get the next page of results
