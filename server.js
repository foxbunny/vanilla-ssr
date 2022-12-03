let // NodeJS imports
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  zlib = require('node:zlib'),
  { promisify } = require('node:util'),
  http = require('node:http')

let // Constants
  PORT = process.env.PORT || 8080,
  HOST = process.env.HOST || '127.0.0.1',
  PUBLIC_DIR = path.resolve(__dirname, 'public'),
  MIME_TYPES = require('./mime-types.json'),
  DEFAULT_MIME_TYPE = 'application/octet-stream'

let // Server state (caches)
  staticFiles = {}

let // Server business logic
  brotliCompress = promisify(zlib.brotliCompress),
  toRelativeUrl = path.sep === '/'
    ? x => path.relative(PUBLIC_DIR, x)
    : x => path.relative(PUBLIC_DIR, x).replace(/\\/g, '/'),
  addFileToCache = filePath =>
    fs.promises.readFile(filePath)
      .then(buffer =>
        brotliCompress(buffer)
          .then(compressedBuffer => ({ compressedBuffer, buffer })),
      )
      .then(({ compressedBuffer, buffer }) => {
        let hexdigest = crypto.createHash('sha256').update(buffer).digest('hex')
        let mimeType = MIME_TYPES[path.extname(filePath)] || DEFAULT_MIME_TYPE
        let url = toRelativeUrl(filePath)
        staticFiles[url] = {
          mimeType,
          hexdigest,
          etag: `"${hexdigest}"`,
          buffer,
          compressedBuffer,
        }
      }),
  cacheStaticFiles = start =>
    fs.promises.readdir(start, { withFileTypes: true })
      .then(entries => {
        let children = []
        for (let ent of entries) {
          if (ent.isDirectory()) children.push(cacheStaticFiles(path.resolve(start, ent.name)))
          else if (ent.isFile()) children.push(addFileToCache(path.resolve(start, ent.name)))
          else console.warn(`Unsupported directory entry ${ent.name}: files in ${start} must be files or directories`)
        }
        return Promise.all(children)
      })

let // HTML generators
  renderPage = ({ title, content, styles = [], scripts = [] }) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SSR example - ${title}</title>
  ${styles.map(x => `<link rel="stylesheet" media="screen" href="/public/${x}" crossorigin="anonymous">`).join('')}
  ${scripts.map(x => `<script defer src="/public/${x}"></script>`).join('')}
</head>
<body>
  <h1>${title}</h1>
  
  ${content}
</body>
</html>
`,
  renderHome = () =>
    renderPage({
      title: 'Current time',
      styles: ['client.css'],
      scripts: ['client.js'],
      content: `<time id="time">${new Date().toISOString()}</time>`,
    }),
  missingPageHTML = renderPage({ // This page does not change, so we pre-render it
    title: '404: Page not found',
    styles: ['client.css'],
    content: `<p>There is no page at this address. You can go back to the <a href="/">main page</a> from here, though.</p>`,
  })

let // Request handlers
  handlePublic = (req, res) => {
    let file = staticFiles[req.url.slice(8)]
    if (!file) return
    if (req.headers['if-none-match'] === file.etag) // Handle Etag?
      res.writeHead(304).end()
    else {
      let // Can we send the Brotli version?
        acceptedEncodings = req.headers['accept-encoding']?.split(',').map(x => x.trim().split(';')[0]),
        willUseCompression = acceptedEncodings.includes('br') || acceptedEncodings.includes('*'),
        buffer = willUseCompression ? file.compressedBuffer : file.buffer
      res
        .writeHead(200, Object.assign({
          'content-type': file.mimeType,
          'content-length': buffer.length,
          'etag': file.etag,
        }, willUseCompression ? {
          'content-encoding': 'br',
        } : {}))
        .end(buffer)
    }
  },
  sendHTML = (res, html, status = 200) => {
    let buffer = Buffer.from(html, 'utf-8')
    res
      .writeHead(status, {
        'content-type': MIME_TYPES['.html'],
        'content-length': buffer.length,
      })
      .end(buffer)
  },
  handleHome = (req, res) => {
    sendHTML(res, renderHome())
  },
  handleMissing = (req, res) => {
    sendHTML(res, missingPageHTML, 404)
  },
  handleNoMethod = (req, res) => {
    res.writeHead(405).end()
  }

// Cache the static files and start the server
cacheStaticFiles(PUBLIC_DIR).then(() =>
  http
    .createServer((req, res) => {
      // Use path segments to match routes
      let pathSegments = req.url.slice(1).split('/')
      switch (pathSegments[0]) {
        case 'public':
          if (req.method !== 'GET') handleNoMethod(req, res)
          else handlePublic(req, res)
          break
        case '':
          if (req.method !== 'GET') handleNoMethod(req, res)
          else handleHome(req, res)
          break
      }

      if (!res.writableEnded) // No handlers were called, so it's a 404
        handleMissing(req, res)
    })
    .listen(PORT, HOST, () => {
      console.log(`Server listening on http://${HOST}:${PORT}`)
    }),
)
