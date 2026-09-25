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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (shouldUseApi(url.pathname)) {
      const response = await env.PARKPULSE_API.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("X-ParkPulse-Preview-API", "service-binding");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return env.ASSETS.fetch(request);
  }
};
