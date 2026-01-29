import { useEffect, useState, useCallback } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Thumbnail,
  Modal,
  Select,
  Spinner,
  Banner
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { PinterestService } from "../services/pinterest.server";
import Cropper from "react-easy-crop";
import getCroppedImg from "../utils";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  try {
    const service = new PinterestService();
    const boards = await service.getBoards();
    return json({ boards, error: null });
  } catch (e) {
    console.error("Pinterest Loader Error:", e);
    return json({ boards: [], error: e.message });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const boardId = formData.get("boardId");
  const title = formData.get("title");
  const description = formData.get("description");
  const link = formData.get("link");
  const imageBase64 = formData.get("image"); // Data URL

  if (!boardId || !imageBase64) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // Convert Base64 Data URL to Buffer/Blob for upload
    // Format: "data:image/jpeg;base64,....."
    const base64Data = imageBase64.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const service = new PinterestService();

    // 1. Register Media
    const registration = await service.registerMedia();
    const { upload_url, upload_parameters, media_id } = registration;

    // 2. Upload to Pinterest S3
    await service.uploadImage(upload_url, upload_parameters, buffer);

    // 3. Wait for processing
    await service.waitForMedia(media_id);

    // 4. Create Pin
    const pin = await service.createPin(boardId, title, description, link, media_id);

    return json({ success: true, pin });
  } catch (e) {
    console.error("Pinterest Action Error:", e);
    return json({ error: e.message }, { status: 500 });
  }
};

export default function Index() {
  const { boards, error: loaderError } = useLoaderData();
  const fetcher = useFetcher();

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCropping, setIsCropping] = useState(false);

  // Cropper State
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Publishing State
  const [selectedBoard, setSelectedBoard] = useState(boards && boards.length > 0 ? boards[0].id : "");

  // Resource Picker
  const selectProduct = async () => {
    const selected = await window.shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false
    });

    if (selected) {
      setSelectedProduct(selected[0]);
      setSelectedImage(null);
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropAndPublish = async () => {
    if (!selectedImage || !croppedAreaPixels) return;

    try {
      const croppedImageBase64 = await getCroppedImg(
        selectedImage.originalSrc,
        croppedAreaPixels
      );

      // Submit to backend
      fetcher.submit(
        {
          boardId: selectedBoard,
          title: selectedProduct.title,
          description: selectedProduct.descriptionHtml ? selectedProduct.descriptionHtml.replace(/<[^>]+>/g, '') : selectedProduct.title, // Strip HTML
          link: selectedProduct.onlineStoreUrl || "",
          image: croppedImageBase64
        },
        { method: "POST" }
      );
      setIsCropping(false); // Close modal
    } catch (e) {
      console.error("Crop Error:", e);
    }
  };

  const boardOptions = boards.map(b => ({ label: b.name, value: b.id }));
  const isPublishing = fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Pin published successfully!");
      setSelectedProduct(null); // Reset
      setIsCropping(false);
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data]);

  return (
    <Page>
      <TitleBar title="Pin Publish" />
      <BlockStack gap="500">

        {loaderError && (
          <Banner tone="critical">
            <p>Failed to load Pinterest configuration. Please check your API Token.</p>
            <p>Error: {loaderError}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Pinterest Publisher</Text>

                {!selectedProduct ? (
                  <Button variant="primary" onClick={selectProduct}>
                    Select Product to Pin
                  </Button>
                ) : (
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingSm">{selectedProduct.title}</Text>
                      <Button onClick={selectProduct}>Change Product</Button>
                    </InlineStack>

                    <Text>Select an image to crop (2:3) and publish:</Text>

                    <InlineStack gap="300" wrap>
                      {selectedProduct.images.map((img) => (
                        <div
                          key={img.id}
                          onClick={() => {
                            setSelectedImage(img);
                            setIsCropping(true);
                          }}
                          style={{ cursor: 'pointer', border: '1px solid #ccc', padding: '2px' }}
                        >
                          <Thumbnail
                            source={img.originalSrc}
                            alt={img.altText || selectedProduct.title}
                            size="large"
                          />
                        </div>
                      ))}
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {fetcher.data?.pin && (
              <Card>
                <Banner tone="success" title="Pin Created">
                  <p>Pin ID: {fetcher.data.pin.id}</p>
                </Banner>
              </Card>
            )}

          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Cropper Modal */}
      <Modal
        open={isCropping}
        onClose={() => setIsCropping(false)}
        title="Crop Image for Pinterest (2:3)"
        primaryAction={{
          content: isPublishing ? <Spinner size="small" /> : "Crop & Publish",
          onAction: handleCropAndPublish,
          disabled: isPublishing
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsCropping(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <div style={{ position: 'relative', width: '100%', height: 400, background: '#333' }}>
              {selectedImage && (
                <Cropper
                  image={selectedImage.originalSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={2 / 3}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>

            <Select
              label="Select Pinterest Board"
              options={boardOptions}
              onChange={setSelectedBoard}
              value={selectedBoard}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

    </Page>
  );
}
