

# astro-lunr

[Lunr](https://lunrjs.com) integration for [Astro](https://astro.build/).

See example usage in [astro-git-view](https://github.com/siverv/astro-git-view)

## Usage

```js
import { defineConfig } from 'astro/config';
import astroLunr from 'astro-lunr/plugin.mjs';
export default defineConfig({
  integrations: [
    astroLunr({})
  ]
});
```

## Config

pathFilter, subDir, documentFilter, initialize, mapDocument, verbose

| Config field     | Type                | Value                                        |
|:---------------- |:------------------  |:-------------------------------------------- |
| `subDir`         | string              | Subdirectory to store the created idx.json and docs.json files.  |
| `pathFilter`     | (string) => boolean | Filter for paths that should be searched for `<lunr-document/>`-elements |
| `documentFilter` | (string) => boolean | Filter for documents should be included in the final index, after they are found by searching the pre-generated pages |
| `initialize`     | (lunr.Builder, lunr) => void | Lunr-specific setup. E.g. fields to index and pipeline-adjustments |
| `mapDocument`    | (Object) => Object  | Transform the documents before storing them in docs.json |
| `verbose`        | boolean             | Debug log |

If using `subDir` or the astro-config `base`, set the env-variable `PUBLIC_LUNR_DIR` to be `/base/subDir/` 

### Example from astro-git-view

```js
astroLunr({
  subDir: "lunr",
  pathFilter: (pathname) => {
    return pathname.match(/\w+\/tree\//);
  },
  documentFilter: (doc) => {
    return doc.ref === "master" && !doc.canonicalUrl.includes("package-lock.json");
  },
  initialize: (builder, lunr) => {
    lunr.tokenizer.separator = /[^\w]+/;
    builder.pipeline.reset();
    builder.searchPipeline.reset();
    builder.field("ref", {boost: 0.01});
    builder.field("oid", {boost: 0.01});
    builder.field("path", {boost: 0.1});
    builder.field("name", {boost: 10});
    builder.field("content");
    builder.metadataWhitelist = ["position"];
  },
  mapDocument: (doc) => doc,
  verbose: false
})
```

## Indexing documents

Indexing is done automatically during build-time, by searching the genereated pages for the `<lunr-document/>`-element on any of the generated pages. These elements are removed from the final version of the build-output, and therefore only affects the two generated index-files `idx.json` and `docs.json`.

Multiple indexes are supported by supplying the index-attribute to the `<lunr-document/>`-elements. Each index will create their own `idx.json`/`docs.json` pair.

### Example from astro-git-view

```jsx
<lunr-document index={repo.getName()}>
    <lunr-field name="repo" value={repo.getName()}/>
    <lunr-field name="ref" value={ref}/>
    <lunr-field name="path" value={path}/>
    <lunr-field name="base" value={path.split("/").slice(0,-1).join("/")}/>
    <lunr-field name="name" value={name}/>
    <lunr-field name="oid" value={oid}/>
    <lunr-field name="type" value={"blob"}/>
    <lunr-field name="extension" value={name.split(".").pop()}/>
    <lunr-text name="content">{content}</lunr-text>
</lunr-document>
```

## Searching

`astro-lunr` gives two functions to search `search` and `enrich`. `async search(query, index)` loads and deserializes the `idx.json` file, performs the search, and returns the hits from lunr. `async enrich(hits, index)` loads the `docs.json` file and enriches the result from lunr with the documents that were matches.

As the two json-files often can be megabytes in size, it is recommended to not 

### Example

```js
import {search, enrich} from 'astro-lunr/client/lunr.js';

search("query", "index")
  .then(enrich)
  .then((result) => result.forEach(
    ({hit, doc}) => console.log(hit, doc)))
```

### Searching in Dev-mode

Due to the nature of indexing, to properly search in dev-mode, one needs to first build the pages at least once to create the index

### Searching in SSR-mode

To properly search files that are not usually genereated in the build-step, you would need to have a separate build-step that includes all pages that might be generated.

A potential future solution would be to include a way to index using static paths that are completely separate from the usual page-generation.