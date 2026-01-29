
export const uploadImageToShopify = async (admin, imageBuffer, filename) => {
  // 1. Request Staged Upload URL
  const stagedUploadQuery = `#graphql
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

  // Estimate size or just guess (Shopify check isn't super strict usually, but good to be close)
  const fileSize = imageBuffer.length.toString();

  const stagedResponse = await admin.graphql(stagedUploadQuery, {
    variables: {
      input: [
        {
          resource: "FILE",
          filename: filename,
          mimeType: "image/jpeg",
          fileSize: fileSize,
          httpMethod: "POST"
        }
      ]
    }
  });

  const stagedData = await stagedResponse.json();
  if (stagedData.data.stagedUploadsCreate.userErrors.length > 0) {
    throw new Error(`Staged Upload Error: ${JSON.stringify(stagedData.data.stagedUploadsCreate.userErrors)}`);
  }

  const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];

  // 2. Upload to the Target URL
  const formData = new FormData();
  target.parameters.forEach(({ name, value }) => {
    formData.append(name, value);
  });
  // For Node environment upload, we need to pass a Blob/File compatible object
  const fileBlob = new Blob([imageBuffer], { type: "image/jpeg" });
  formData.append("file", fileBlob);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    // Google Cloud Storage sometimes returns XML errors
    const text = await uploadResponse.text();
    throw new Error(`Failed to upload to staging URL: ${uploadResponse.status} - ${text}`);
  }

  // 3. Create File Resource in Shopify
  const fileCreateQuery = `#graphql
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            alt
            createdAt
            fileStatus
            id
            ... on MediaImage {
              image {
                url
              }
            }
            ... on GenericFile {
              url
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

  const fileCreateResponse = await admin.graphql(fileCreateQuery, {
    variables: {
      files: [
        {
          originalSource: target.resourceUrl,
          alt: "Pinterest Cropped Image",
          contentType: "IMAGE"
        }
      ]
    }
  });

  const fileData = await fileCreateResponse.json();
  if (fileData.data.fileCreate.userErrors.length > 0) {
    throw new Error(`File Create Error: ${JSON.stringify(fileData.data.fileCreate.userErrors)}`);
  }

  const createdFile = fileData.data.fileCreate.files[0];

  // Normalize URL based on type
  let publicUrl = createdFile.image?.url || createdFile.url;

  console.log("File Created (Initial):", JSON.stringify(createdFile));

  // 4. Poll if URL is missing (Async processing)
  if (!publicUrl) {
    console.log("URL missing, polling for readiness...");
    const fileId = createdFile.id;

    const pollQuery = `#graphql
        query getFile($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              fileStatus
              image {
                url
              }
            }
            ... on GenericFile {
              fileStatus
              url
            }
          }
        }
      `;

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000)); // Wait 1s

      const pollResponse = await admin.graphql(pollQuery, { variables: { id: fileId } });
      const pollData = await pollResponse.json();
      const node = pollData.data.node;

      console.log(`Poll Attempt ${i + 1}:`, node);

      if (node) {
        const url = node.image?.url || node.url;
        if (url) {
          publicUrl = url;
          break;
        }
        if (node.fileStatus === 'FAILED') {
          throw new Error("File processing failed on Shopify side.");
        }
      }
    }
  }

  console.log("Final Extracted URL:", publicUrl);

  // Return a consistent object
  return { ...createdFile, url: publicUrl };
};
