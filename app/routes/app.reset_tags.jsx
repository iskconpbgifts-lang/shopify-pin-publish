import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { deletePinnedProduct } from "../models/pinned-products.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId");

  if (!productId) {
    return json({ error: "Product ID is required" }, { status: 400 });
  }

  // 1. Delete from Database (Sync)
  await deletePinnedProduct(session.shop, productId);

  // 2. Fetch current tags
  const getTagsResponse = await admin.graphql(
    `#graphql
      query getTags($id: ID!) {
        product(id: $id) {
          tags
        }
      }`,
    { variables: { id: productId } }
  );

  const getTagsJson = await getTagsResponse.json();
  const currentTags = getTagsJson.data.product.tags;

  // 2. Filter out the "Pinterest Published" tag
  const newTags = currentTags.filter(tag => tag !== "Pinterest Published");

  // 3. Update product tags
  const updateResponse = await admin.graphql(
    `#graphql
      mutation updateTags($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        input: {
          id: productId,
          tags: newTags
        }
      }
    }
  );

  const updateJson = await updateResponse.json();

  if (updateJson.data.productUpdate.userErrors.length > 0) {
    return json({ error: updateJson.data.productUpdate.userErrors[0].message }, { status: 500 });
  }

  return json({ success: true, tags: newTags });
};
