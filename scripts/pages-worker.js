// Cloudflare Pages "advanced mode" worker. Copied to dist/_worker.js at deploy
// time (see scripts/deploy-pages.mjs). It gates the entire site behind HTTP
// Basic Auth, then hands the request to Pages' static asset server. The
// credentials live only here, server-side, so they are never sent to or
// readable by the browser. Change them in one place: below.
const USER = 'demo'
const PASS = 'demo'

export default {
  async fetch(request, env) {
    const expected = 'Basic ' + btoa(`${USER}:${PASS}`)
    if ((request.headers.get('Authorization') || '') !== expected) {
      return new Response('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Focus Reader demo", charset="UTF-8"',
        },
      })
    }
    return env.ASSETS.fetch(request)
  },
}
