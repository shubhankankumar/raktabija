// The old Workers copy (raktabija.onlyshubh.workers.dev) now only forwards visitors to the Pages site, keeping the path.
// Deploy: npx wrangler@4.157.0 deploy tools/redirect-worker.js --name raktabija --compatibility-date 2026-10-01
export default {
  fetch(req) {
    const { pathname, search } = new URL(req.url);
    return Response.redirect('https://raktabija.pages.dev' + pathname + search, 301);
  },
};
