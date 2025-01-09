export default {
    async fetch(request, env) {
      try {
        return await env.ASSETS.fetch(request);
      } catch (e) {
        return new Response(`${request.method} ${request.url} - ${e.message}`, { status: 500 });
      }
    },
  };