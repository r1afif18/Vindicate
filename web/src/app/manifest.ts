import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vindicate",
    short_name: "Vindicate",
    description:
      "Move what is left in a compromised BNB Chain wallet to a safe one in a single transaction.",
    start_url: "/app",
    display: "standalone",
    background_color: "#04080b",
    theme_color: "#04080b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  }
}
