const API_ORIGIN = "https://parkpulse-api.jamesp5297.workers.dev";

function shouldUseApi(pathname) {
  return pathname === "/health" ||
    pathname === "/vapid-key" ||
    pathname === "/subscriptions" ||
    pathname.startsWith("/subscriptions/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/");
}

async function proxyApi(request) {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set("X-ParkPulse-Preview-Proxy", "1");

  const init = {
    method: request.method,
    headers,
    redirect: "follow"
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(upstream, init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("X-ParkPulse-Preview-API", "direct-proxy");
  responseHeaders.set("Cache-Control", "no-store");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (shouldUseApi(url.pathname)) return proxyApi(request);
    return env.ASSETS.fetch(request);
  }
};
