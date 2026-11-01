// REQ-10 · Starts the library's featured thumbnail (the LCP image) before the entry JS has run, on repeat visits.
// LibraryPage stores its URL under this key; the same key is written there. Plain external script: the CSP has no
// inline hashes. Everything is best-effort: blocked storage or a stale URL only wastes (or skips) one download.
// `self` (not bare globals): eslint treats public/*.js as a service worker scope, where `document` is undefined.
(function () {
  try {
    // Only the library (/) shows that thumbnail first: on any other deep link the preload would be wasted bandwidth.
    if (self.location.pathname !== '/') return;
    var url = self.localStorage.getItem('oneshoot.lcpThumb.v1');
    if (!url || !/^https?:\/\//i.test(url)) return;
    var link = self.document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    link.setAttribute('fetchpriority', 'high');
    // The <img> asks for i.ytimg.com with CORS (REQ-13): the preload must match to be reused.
    if (/^https:\/\/i\.ytimg\.com\//.test(url)) link.crossOrigin = 'anonymous';
    self.document.head.appendChild(link);
  } catch {
    // Nothing to do without storage.
  }
})();
