import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const productId = formData.get("productId");

    if (!productId) {
        return json({ error: "Missing Product ID" }, { status: 400 });
    }

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
