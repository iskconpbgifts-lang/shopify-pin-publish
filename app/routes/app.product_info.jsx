
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const productId = url.searchParams.get("id");

    if (!productId) {
        return json({ error: "Missing ID" }, { status: 400 });
    }

    const response = await admin.graphql(
        `#graphql
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        descriptionHtml
        onlineStoreUrl
        handle
        tags
        images(first: 20) {
          nodes {
            id
            originalSrc: url
            altText
          }
        }
      }
    }`,
        {
            variables: {
                id: productId,
            },
        }
    );

    const parsed = await response.json();
    return json(parsed.data.product);
};
