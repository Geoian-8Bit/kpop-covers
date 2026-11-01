/**
 * REQ-13 · YouTube thumbnails are requested with CORS so the service worker can cache them as plain 200 responses
 * (an opaque one is billed as several MB of quota). i.ytimg.com answers `Access-Control-Allow-Origin: *`, so nothing
 * changes on screen. Any other source (an uploaded poster as `data:`, a blob, another host) keeps a normal request:
 * `crossOrigin` on a host without CORS headers would stop the image from loading.
 */
export function thumbCors(src: string | null | undefined): 'anonymous' | undefined {
  return src?.startsWith('https://i.ytimg.com/') ? 'anonymous' : undefined;
}
