# API
Before using the API, please file an issue with your intention of using the API.

You can access the API at `beta.webcomponents.org/api/<method>`. Example search API call: https://beta.webcomponents.org/api/search/input.

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
