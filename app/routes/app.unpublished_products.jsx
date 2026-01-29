import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getUnpublishedProducts {
        products(first: 50, query: "-tag:'Pinterest Published' status:active") {
          nodes {
            id
            title
            descriptionHtml
            onlineStoreUrl
            handle
            tags
            images(first: 10) {
              nodes {
                id
                originalSrc: url
                altText
              }
            }
          }
        }
      }`
  );

  const parsed = await response.json();
  const products = parsed.data.products.nodes.map(product => {
    // Normalize images
    if (product.images && product.images.nodes) {
      product.images = product.images.nodes;
    } else {
      product.images = [];
    }
    return product;
  }).filter(product => product.images && product.images.length > 0);

  return json({ products });
};
