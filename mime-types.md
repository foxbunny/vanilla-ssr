# How to generate mime-types.json

To generate the contents of the `mime-types.json` file, go to the following
URL and run the script below in the developer tools' console.

https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types

```javascript
JSON.stringify(
  Array.from(document.querySelectorAll('.main-page-content tbody tr'))
    .reduce((map, $tr) => {
      let
        exts = $tr.children[0].textContent.split(',').map(x => x.trim()),
        type = $tr.children[2].textContent.trim()
      for (let ext of exts) map[ext] = type
      return map
    }, {}),
  null,
  2,
)
```
