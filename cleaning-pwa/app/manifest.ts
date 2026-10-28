import type { MetadataRoute } from "next";
import { BUSINESS_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BUSINESS_NAME,
    short_name: "Cleaning",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0d9488",
    orientation: "portrait",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
