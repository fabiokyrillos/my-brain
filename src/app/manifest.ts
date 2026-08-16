import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Brain",
    short_name: "Brain",
    description: "Seu contexto, organizado e atento.",
    start_url: "/pt-BR/app",
    display: "standalone",
    background_color: "#fbfcfe",
    theme_color: "#14233b",
    lang: "pt-BR",
    icons: [{ src: "/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" }],
  };
}
