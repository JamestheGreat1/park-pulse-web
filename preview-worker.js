function shouldUseApi(pathname) {
  return pathname === "/health" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (shouldUseApi(url.pathname)) return env.PARKPULSE_API.fetch(request);
    return env.ASSETS.fetch(request);
  }
};
