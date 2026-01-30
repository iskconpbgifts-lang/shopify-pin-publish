import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { savePinnedProduct } from "../models/pinned-products.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId");

  if (!productId) {
    return json({ error: "Missing Product ID" }, { status: 400 });
  }

  // 1. Fetch Product Details for DB
  const productResponse = await admin.graphql(
    `#graphql
        query getProduct($id: ID!) {
          product(id: $id) {
            title
            handle
            featuredMedia {
              preview {
                image {
                  url
                }
              }
            }
          }
        }`,
    { variables: { id: productId } }
  );
  const productData = await productResponse.json();
  const product = productData.data?.product;

  if (product) {
    const imageUrl = product.featuredMedia?.preview?.image?.url || "";

    // 2. Save to Database
    await savePinnedProduct({
      shop: session.shop,
      productId: productId,
      productHandle: product.handle,
      title: product.title,
      imageUrl: imageUrl,
      status: "PUBLISHED"
    });
  }

  // 3. Add Tag to Shopify (Hybrid)
  const response = await admin.graphql(
    `#graphql
      mutation addTags($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        id: productId,
        tags: ["Pinterest Published"]
      }
    }
  );

  const data = await response.json();
  return json({ success: true, data });
};
