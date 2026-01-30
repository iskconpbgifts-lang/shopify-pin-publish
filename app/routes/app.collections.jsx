import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query getCollections {
        collections(first: 250, sortKey: TITLE) {
          nodes {
            id
            title
          }
        }
      }`
  );
  const data = await response.json();
  const collections = data.data.collections.nodes.map(c => ({
    label: c.title,
    value: c.id
  }));
  return json({ collections });
};
