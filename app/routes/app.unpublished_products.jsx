import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collection_id");
  const productType = url.searchParams.get("product_type"); // Keep support for type if needed later

  // If a collection is selected, we query products WITHIN that collection
  if (collectionId) {
    const response = await admin.graphql(
      `#graphql
        query getCollectionProducts($id: ID!) {
          collection(id: $id) {
            products(first: 250, sortKey: CREATED, reverse: true) {
              nodes {
                id
                title
                handle
                status
                descriptionHtml
                onlineStoreUrl
                tags
                productType
                images(first: 10) {
                  nodes {
                    id
                    originalSrc
                    altText
                    width
                    height
                  }
                }
              }
            }
          }
        }
      `,
      { variables: { id: collectionId } }
    );

    const data = await response.json();
    const allProducts = data.data?.collection?.products?.nodes || [];

    // Client-side filtering because Collection.products doesn't support 'query' param
    const products = allProducts.filter(p => {
      const isPublished = p.tags && p.tags.includes("Pinterest Published");
      const isIgnored = p.tags && p.tags.includes("Pinterest Ignored");
      const isActive = p.status === 'ACTIVE';
      return !isPublished && !isIgnored && isActive && p.images?.nodes?.length > 0;
    }).slice(0, 50); // Limit to 50 results after filtering

    return json({ products: products.map(p => ({ ...p, images: p.images.nodes })) });

  } else {
    // Default Query (All Products)
    let query = "-tag:'Pinterest Published' -tag:'Pinterest Ignored' status:active";
    // Optional: Keep product type support
    if (productType) {
      query += ` product_type:'${productType}'`;
    }

    const response = await admin.graphql(
      `#graphql
        query getUnpublishedProducts {
          products(first: 250, query: "${query}", sortKey: CREATED_AT, reverse: true) {
            nodes {
              id
              title
              descriptionHtml
              onlineStoreUrl
              handle
              tags
              images(first: 10) {
                nodes {
                  originalSrc: url
                  altText
                  width
                  height
                }
              }
            }
          }
        }`
    );

    const parsed = await response.json();
    const nodes = parsed.data?.products?.nodes || [];

    // Normalize images (GraphQL returns edges/nodes, but we want array)
    // Actually API v2024+ returns images.nodes array directly usually, but let's be safe
    const products = nodes.map(product => {
      const imageUrls = product.images?.nodes || [];
      return {
        ...product,
        images: imageUrls
      };
    }).filter(p => p.images.length > 0);

    return json({ products });
  }
};
