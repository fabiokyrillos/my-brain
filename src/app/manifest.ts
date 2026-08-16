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
    icons: [{ src: "/brain-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
