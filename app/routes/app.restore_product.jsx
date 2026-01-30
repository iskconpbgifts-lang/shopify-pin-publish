import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const productId = formData.get("productId");
    // Default to removing 'Pinterest Ignored' if not specified, or generic tag
    const tagToRemove = formData.get("tag") || "Pinterest Ignored";

    if (!productId) return json({ error: "Missing ID" }, { status: 400 });

    await admin.graphql(
        `#graphql
      mutation removeTags($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          userErrors {
             field
             message
          }
        }
      }`,
        {
            variables: {
                id: productId,
                tags: [tagToRemove]
            }
        }
    );

    return json({ success: true });
};
