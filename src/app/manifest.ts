import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Brain",
    short_name: "Brain",
    description: "Seu contexto, organizado e atento.",
    start_url: "/pt-BR/app",
    /*
     * Declared, not inherited.
     *
     * Without this key the specification assumes the directory of `start_url`,
     * which is `/pt-BR/` — and iOS does not navigate outside an installed
     * app's scope: it hands the URL to an embedded browser with its own cookie
     * store. That put the entire English product, and every path without a
     * locale prefix, outside the installed app, where it arrived signed out.
     *
     * `start_url` deliberately stays a literal. Deriving it from the visitor's
     * locale would need a request-time API, and this file is a Route Handler
     * that is cached by default until one is used.
     */
    scope: "/",
    display: "standalone",
    background_color: "#fbfcfe",
    theme_color: "#14233b",
    lang: "pt-BR",
    icons: [{ src: "/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" }],
  };
}
