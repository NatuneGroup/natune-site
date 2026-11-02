# Vendored third-party libraries

Pinned, self-hosted copies loaded by `/news/` (and the admin preview, if one is
added). Do NOT edit these files — update them by replacing with a new upstream
release and bumping the version below. Keeping them on `/assets/vendor/` lets
the site run under `script-src 'self'` with no CDN or SRI exceptions.

| File | Package | Version | License | Upstream |
| ---- | ------- | ------- | ------- | -------- |
| marked.umd.js | [marked](https://github.com/markedjs/marked) | 18.1.2 | MIT | `npm pack marked@18.1.2` -> `lib/marked.umd.js` |
| purify.min.js | [dompurify](https://github.com/cure53/DOMPurify) | 3.4.17 | MPL-2.0 OR Apache-2.0 | `npm pack dompurify@3.4.17` -> `dist/purify.min.js` |

License texts ship alongside each file (`*.LICENSE*.txt`).

Update procedure:

```sh
npm pack marked@<version> dompurify@<version>
tar -xzf marked-<version>.tgz  && cp package/lib/marked.umd.js public/assets/vendor/
tar -xzf dompurify-<version>.tgz && cp package/dist/purify.min.js public/assets/vendor/
```

Then bump the versions above and re-run `npm test` (which exercises the XSS
payloads against the real renderer).
