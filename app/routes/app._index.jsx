import { json } from "@remix-run/node";
import { useEffect, useState, useCallback } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Modal,
  Spinner,
  Banner,
  Badge,
  EmptyState,
  InlineGrid,
  Box,
  Divider,
  CalloutCard,
  Icon
} from "@shopify/polaris";
import {
  SettingsIcon,
  DuplicateIcon
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { uploadImageToShopify } from "../services/shopify-files.server";
import Cropper from "react-easy-crop";
import getCroppedImg from "../utils";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export const action = async ({ request }) => {
  console.log("Index Action: Request received");

  try {
    const { admin } = await authenticate.admin(request);
    // Use JSON parsing for better large payload handling
    const { image: imageBase64, productId } = await request.json();

    if (!imageBase64) {
      return json({ error: "No image provided" }, { status: 400 });
    }

    const base64Data = imageBase64.split(',')[1];
    if (!base64Data) {
      return json({ error: "Invalid image format" }, { status: 400 });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `pinterest-crop-${Date.now()}.jpg`;

    console.log("Index Action: Uploading...");
    const file = await uploadImageToShopify(admin, buffer, filename);
    console.log("Index Action: Success", file.url);

    // Tag the product as Pinned
    if (productId) {
      console.log("Index Action: Tagging product", productId);
      await admin.graphql(
        `#graphql
        mutation addTags($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            node {
              id
            }
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
    }

    return json({
      success: true,
      imageUrl: file.url,
      fileId: file.id
    });

  } catch (e) {
    console.error("Index Action Error:", e);
    return json({ error: e.message }, { status: 500 });
  }
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const { shop } = useLoaderData();

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  // State to track which product the image upload belongs to
  const [uploadingForProductId, setUploadingForProductId] = useState(null);

  // Cropper State
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Product Info Fetcher
  const productFetcher = useFetcher();

  const selectProduct = async () => {
    const selected = await window.shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
      query: "status:active"
    });

    if (selected) {
      const product = selected[0];
      setSelectedProduct(product);
      setSelectedImage(null);
      // Reset Pinterest State
      setPinterestUrl(null);
      setUploadingForProductId(null);

      // Fetch full details (description)
      productFetcher.load(`/app/product_info?id=${product.id}`);
    }
  };

  // ... (useEffect hook for productFetcher) ...

  useEffect(() => {
    if (productFetcher.data && selectedProduct) {
      setSelectedProduct(prev => ({ ...prev, ...productFetcher.data }));
    }
  }, [productFetcher.data]);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCropAndPublish = async () => {
    console.log("handleCropAndPublish called");
    console.log("selectedImage:", selectedImage);
    console.log("croppedAreaPixels:", croppedAreaPixels);

    if (!selectedImage || !croppedAreaPixels) {
      console.warn("Missing image or crop data");
      return;
    }

    // Set the current product ID as the target for this upload
    setUploadingForProductId(selectedProduct.id);

    try {
      console.log("Getting cropped image...");
      const croppedImageBase64 = await getCroppedImg(
        selectedImage.originalSrc,
        croppedAreaPixels
      );
      // ... (rest of function) ...
      console.log("Submitting to index action (JSON)...");
      fetcher.submit(
        { image: croppedImageBase64, productId: selectedProduct.id },
        { method: "POST", encType: "application/json", action: "/app?index" }
      );
      // ...
    } catch (e) {
      // ...
    }
  };

  const [pinterestUrl, setPinterestUrl] = useState(null);
  const isUploading = fetcher.state === "submitting" || fetcher.state === "loading";

  // URL Preferences State
  const [urlMode, setUrlMode] = useState("default"); // 'default' or 'custom'
  const [customDomainInput, setCustomDomainInput] = useState("https://www.iskconpbgifts.com");

  // Toggle for settings visibility
  const [showSettings, setShowSettings] = useState(false);

  // URL Generation Logic
  useEffect(() => {
    // Check if upload was successful AND if it belongs to the CURRENT selected product
    if (fetcher.data?.success && fetcher.data?.imageUrl && uploadingForProductId === selectedProduct?.id) {
      shopify.toast.show("Image uploaded!");

      // Optimistically update tags to show "Published" badge immediately
      setSelectedProduct(prev => {
        const newTags = prev.tags ? [...prev.tags] : [];
        if (!newTags.includes("Pinterest Published")) {
          newTags.push("Pinterest Published");
        }
        return { ...prev, tags: newTags };
      });

      const mediaUrl = fetcher.data.imageUrl;
      let productUrl;

      // Determine Base URL based on user choice
      if (urlMode === "custom" && customDomainInput) {
        // Validation: remove trailing slash
        const domain = customDomainInput.replace(/\/$/, "");
        if (selectedProduct.handle) {
          productUrl = `${domain}/products/${selectedProduct.handle}`;
        } else {
          productUrl = domain;
        }
      } else {
        // Default (Shopify Store URL)
        productUrl = selectedProduct.onlineStoreUrl;

        // Fallback for default
        if (!productUrl && selectedProduct.handle) {
          productUrl = `https://${shop}/products/${selectedProduct.handle}`;
        }
        if (!productUrl) {
          productUrl = `https://${shop}`;
        }
      }

      // Description logic
      const rawDesc = selectedProduct.descriptionHtml ? selectedProduct.descriptionHtml.replace(/<[^>]+>/g, '').trim() : "";
      const description = (rawDesc || selectedProduct.title || "Check out this product!").substring(0, 490);

      console.log("Generating Pinterest URL with:", { productUrl, mediaUrl });
      const url = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(productUrl)}&media=${encodeURIComponent(mediaUrl)}&description=${encodeURIComponent(description)}`;

      setPinterestUrl(url);
    } else if (fetcher.data?.error) {
      shopify.toast.show(`Upload Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data, selectedProduct, urlMode, customDomainInput, shop]);

  const openPinterest = () => {
    if (pinterestUrl) {
      window.open(pinterestUrl, '_blank');
      setIsCropping(false);
      setPinterestUrl(null);
      setSelectedImage(null);
    }
  };

  // ... (render) ...

  return (
    <Page>
      <TitleBar title="Pin Publish" />
      <BlockStack gap="500">

        {/* State: No Product Selected */}
        {!selectedProduct ? (
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Start Pinning your Products"
                  action={{
                    content: 'Select Product',
                    onAction: selectProduct,
                    id: 'btn-select-product-empty'
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Select a product from your catalog to create a Pinterest-optimized pin (2:3 aspect ratio).</p>
                </EmptyState>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Configuration</Text>
                  <Button id="btn-show-settings-empty" variant="plain" onClick={() => setShowSettings(!showSettings)}>
                    {showSettings ? "Hide Settings" : "Configure App Settings"}
                  </Button>
                  {showSettings && (
                    <BlockStack gap="200">
                      <Divider />
                      <Text variant="bodySm" fontWeight="bold">Link Destination</Text>
                      <InlineStack gap="200">
                        <Button size="micro" pressed={urlMode === 'default'} onClick={() => setUrlMode('default')} id="btn-mode-default-sm">Store URL</Button>
                        <Button size="micro" pressed={urlMode === 'custom'} onClick={() => setUrlMode('custom')} id="btn-mode-custom-sm">Custom</Button>
                      </InlineStack>
                      {urlMode === 'custom' && (
                        <input
                          id="input-custom-domain-sm"
                          placeholder="https://mysite.com"
                          value={customDomainInput}
                          onChange={(e) => setCustomDomainInput(e.target.value)}
                          style={{ width: '100%', padding: '4px' }}
                        />
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : (
          <Layout>
            {/* Main Application Area */}
            <Layout.Section>
              <Card>
                <BlockStack gap="500">
                  {/* Header Area */}
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" align="center">
                        <Text as="h2" variant="headingXl">{selectedProduct.title}</Text>
                        {selectedProduct.tags && selectedProduct.tags.includes("Pinterest Published") && (
                          <Badge tone="success" size="large">Published</Badge>
                        )}
                      </InlineStack>
                      <InlineStack gap="200">
                        <Button
                          id="btn-copy-title"
                          variant="plain"
                          icon={DuplicateIcon}
                          onClick={() => {
                            navigator.clipboard.writeText(selectedProduct.title);
                            shopify.toast.show("Title copied");
                          }}
                        >
                          Copy Title
                        </Button>
                      </InlineStack>
                    </BlockStack>
                    <Button id="btn-change-product" onClick={selectProduct}>Change Product</Button>
                  </InlineStack>

                  <Divider />

                  {/* Image Selection Area */}
                  <BlockStack gap="300">
                    <Text variant="headingMd">Select an image to Pin</Text>
                    <Text variant="bodySm" tone="subdued">Click an image to open the cropper.</Text>

                    <InlineGrid columns={['oneThird', 'oneThird', 'oneThird', 'oneThird']} gap="400">
                      {selectedProduct.images.map((img, index) => (
                        <div
                          key={img.id}
                          id={`img-thumbnail-${index}`}
                          style={{
                            cursor: 'pointer',
                            border: '1px solid #e1e3e5',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            position: 'relative',
                            aspectRatio: '1 / 1'
                          }}
                          onClick={() => {
                            setSelectedImage(img);
                            setIsCropping(true);
                          }}
                        >
                          <img
                            src={img.originalSrc}
                            alt={img.altText || selectedProduct.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.03)', padding: '4px', textAlign: 'center' }}>
                            <Text variant="bodyXs" tone="subdued">Select</Text>
                          </div>
                        </div>
                      ))}
                    </InlineGrid>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Sidebar Configuration */}
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingSm">Settings</Text>
                    <Button
                      icon={SettingsIcon}
                      variant="plain"
                      onClick={() => setShowSettings(!showSettings)}
                      id="btn-toggle-settings"
                      aria-label="Toggle Settings"
                    />
                  </InlineStack>

                  {showSettings ? (
                    <BlockStack gap="300">
                      <Divider />
                      <Text fontWeight="bold">Link Preference</Text>
                      <BlockStack gap="200">
                        <Button
                          id="btn-mode-default"
                          pressed={urlMode === 'default'}
                          onClick={() => setUrlMode('default')}
                          fullWidth
                          textAlign="left"
                        >
                          Use Store URL (Default)
                        </Button>
                        <Button
                          id="btn-mode-custom"
                          pressed={urlMode === 'custom'}
                          onClick={() => setUrlMode('custom')}
                          fullWidth
                          textAlign="left"
                        >
                          Use Custom Domain
                        </Button>
                      </BlockStack>

                      {urlMode === 'custom' && (
                        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                          <BlockStack gap="200">
                            <Text variant="bodySm">Base URL:</Text>
                            <input
                              id="input-custom-domain"
                              value={customDomainInput}
                              onChange={(e) => setCustomDomainInput(e.target.value)}
                              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                            />
                          </BlockStack>
                        </Box>
                      )}
                    </BlockStack>
                  ) : (
                    <Text tone="subdued" variant="bodySm">
                      Linking to: {urlMode === 'default' ? 'Online Store' : 'Custom Domain'}
                    </Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>

      {/* Cropper Modal */}
      <Modal
        open={isCropping}
        onClose={() => setIsCropping(false)}
        title={pinterestUrl ? "Ready to Pin!" : "Crop Image for Pinterest (2:3)"}
        primaryAction={{
          id: "btn-modal-primary",
          content: pinterestUrl ? "Open Pinterest" : (isUploading ? <Spinner size="small" /> : "Next: Upload Image"),
          onAction: pinterestUrl ? openPinterest : handleCropAndPublish,
          disabled: isUploading && !pinterestUrl
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => { setIsCropping(false); setPinterestUrl(null); },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {pinterestUrl ? (
              <Banner tone="success" title="Image Uploaded">
                <p>Click "Open Pinterest" to finish posting on Pinterest.</p>
              </Banner>
            ) : (
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
            )}

            {/* AI Agent Controls for Cropping */}
            {!pinterestUrl && (
              <BlockStack gap="300">
                <Text variant="bodyMd" fontWeight="bold">Manual Adjustments (AI Friendly):</Text>
                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <Text>Zoom:</Text>
                    <input
                      id="input-crop-zoom"
                      type="number"
                      step="0.1"
                      min="1"
                      max="3"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      style={{ width: '100%', padding: '5px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text>Crop X:</Text>
                    <input
                      id="input-crop-x"
                      type="number"
                      value={crop.x}
                      onChange={(e) => setCrop({ ...crop, x: parseFloat(e.target.value) })}
                      style={{ width: '100%', padding: '5px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text>Crop Y:</Text>
                    <input
                      id="input-crop-y"
                      type="number"
                      value={crop.y}
                      onChange={(e) => setCrop({ ...crop, y: parseFloat(e.target.value) })}
                      style={{ width: '100%', padding: '5px' }}
                    />
                  </div>
                </InlineStack>
                <Text variant="bodySm" tone="subdued">
                  Use these inputs to precisely adjust the crop if drag-and-drop is difficult.
                </Text>
              </BlockStack>
            )}
            {!pinterestUrl && (
              <Text variant="bodySm" tone="subdued">
                Clicking 'Next' will upload this image.
              </Text>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

    </Page>
  );
}
