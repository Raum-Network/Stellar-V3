import type { Metadata } from "next";

export const SITE_URL = "https://clmm.raum.network";
export const OG_IMAGE_URL = `${SITE_URL}/og/raum-clmm-og.svg`;
export const SITE_NAME = "RAUM CLMM DEX";

type CreateMetadataArgs = {
  title: string;
  description: string;
  path: `/${string}` | "/";
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
};

export function createPageMetadata({
  title,
  description,
  path,
  type = "website",
  publishedTime,
  modifiedTime,
}: CreateMetadataArgs): Metadata {
  const url = path === "/" ? SITE_URL : `${SITE_URL}${path}`;

  const openGraphBase = {
    title,
    description,
    url,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "RAUM CLMM DEX interface preview",
      },
    ],
  };

  const openGraph: NonNullable<Metadata["openGraph"]> =
    type === "article"
      ? {
          ...openGraphBase,
          type: "article",
          publishedTime,
          modifiedTime,
        }
      : {
          ...openGraphBase,
          type: "website",
        };

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE_URL],
    },
    ...(publishedTime && modifiedTime
      ? {
          other: {
            "article:published_time": publishedTime,
            "article:modified_time": modifiedTime,
          },
        }
      : {}),
  };
}
