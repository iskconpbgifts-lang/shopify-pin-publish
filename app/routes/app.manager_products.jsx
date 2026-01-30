import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "published"; // published, ignored, unpublished

    let query = "";
    if (view === "published") {
        query = "tag:'Pinterest Published' status:active";
    } else if (view === "ignored") {
        query = "tag:'Pinterest Ignored' status:active";
    } else {
        // unpublished (default fallback or explicit)
        // Note: This matches the 'dashboard' logic roughly but simplified for list view
        query = "-tag:'Pinterest Published' -tag:'Pinterest Ignored' status:active";
    }

    const response = await admin.graphql(
        `#graphql
      query getManagerProducts {
        products(first: 50, query: "${query}") {
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
