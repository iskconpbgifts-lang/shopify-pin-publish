import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);

    // 1. Fetch up to 50 products that HAVE the tag
    const queryResponse = await admin.graphql(
        `#graphql
      query getPublishedProducts {
        products(first: 50, query: "tag:'Pinterest Published'") {
          nodes {
            id
            tags
          }
        }
      }`
    );

    const queryJson = await queryResponse.json();
    const products = queryJson.data.products.nodes;

    if (products.length === 0) {
        return json({ success: true, count: 0, message: "No published products found to reset." });
    }

    // 2. Remove tag for each found product
    let successCount = 0;

    // We'll run these in parallel
    const updatePromises = products.map(async (product) => {
        const newTags = product.tags.filter(t => t !== "Pinterest Published");

        // Skip if for some reason it's already gone (double check)
        if (newTags.length === product.tags.length) return;

        const mutation = `#graphql
      mutation updateTags($input: ProductInput!) {
        productUpdate(input: $input) {
          userErrors {
            field
            message
          }
        }
      }`;

        const variables = {
            input: {
                id: product.id,
                tags: newTags
            }
        };

        const response = await admin.graphql(mutation, { variables });
        const jsonResp = await response.json();

        if (jsonResp.data.productUpdate.userErrors.length === 0) {
            successCount++;
        }
    });

    await Promise.all(updatePromises);

    return json({ success: true, count: successCount, remaining: products.length === 50 });
};
