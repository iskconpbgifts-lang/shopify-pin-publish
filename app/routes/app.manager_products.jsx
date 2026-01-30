import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getPinnedProducts } from "../models/pinned-products.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "published"; // published, ignored, unpublished

  // 1. Database Views (Fast, Persistent)
  if (view === "published" || view === "ignored") {
    const status = view === "published" ? "PUBLISHED" : "IGNORED";
    const dbProducts = await getPinnedProducts(session.shop, status);

    const nodes = dbProducts.map(p => ({
      id: p.productId,         // Map DB productId to 'id'
      title: p.title,
      handle: p.productHandle,
      image: p.imageUrl,       // Map DB imageUrl to 'image'
      status: p.status
    }));

    return json({ products: nodes });
  }

  // 2. Unpublished View (Shopify Search - Hybrid)
  // We still query Shopify for what is NOT tagged, as we don't store "everything" in DB.
  let query = "-tag:'Pinterest Published' -tag:'Pinterest Ignored' status:active";

  const response = await admin.graphql(
    `#graphql
      query getManagerProducts {
        products(first: 250, query: "${query}") {
          nodes {
            id
            title
            handle
            tags
            images(first: 1) {
              nodes {
                originalSrc: url
                altText
              }
            }
          }
        }
      }`
  );

  const data = await response.json();
  const products = data.data?.products?.nodes || [];

  // Normalize images
  const nodes = products.map(p => ({
    ...p,
    image: p.images?.nodes?.[0]?.originalSrc || null
  }));

  return json({ products: nodes });
};

export const action = async ({ request }) => {
  // Reuse existing actions for tag manipulation if possible, 
  // or we can add simple tag removal logic here if specific to manager.
  // For now we will use existing /app/reset_tags route from frontend.
  return null;
};
