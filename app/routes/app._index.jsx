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
  Icon,
  Tabs
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

  // Queue State
  const [productQueue, setProductQueue] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const selectedProduct = productQueue[currentQueueIndex] || null;
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
  const unpublishedFetcher = useFetcher();
  const resetFetcher = useFetcher();

  const [selectedTab, setSelectedTab] = useState(1); // Default to AI Publisher (Index 1)

  const handleResetStatus = () => {
    if (!selectedProduct) return;
    resetFetcher.submit(
      { productId: selectedProduct.id },
      { method: "POST", action: "/app/reset_tags" }
    );

    // Optimistic Update: Remove "Pinterest Published" tag from current product in queue
    setProductQueue(prev => prev.map(p => {
      if (p.id === selectedProduct.id) {
        const newTags = p.tags ? p.tags.filter(t => t !== "Pinterest Published") : [];
        return { ...p, tags: newTags };
      }
      return p;
    }));
    shopify.toast.show("Resetting status...");
  };

  const handleResetAll = () => {
    resetFetcher.submit(
      {},
      { method: "POST", action: "/app/reset_all_tags" }
    );
    // Clear storage on full reset
    localStorage.removeItem("pin-publish-queue");
    localStorage.removeItem("pin-publish-index");
    localStorage.removeItem("pin-publish-modal-open");
    localStorage.removeItem("pin-publish-selected-image");
    localStorage.removeItem("pin-publish-pinterest-url");
    setProductQueue([]);
    shopify.toast.show("Resetting ALL published statuses...");
  };

  const handleTabChange = useCallback(
    (selectedTabIndex) => {
      setSelectedTab(selectedTabIndex);
      if (selectedTabIndex === 1) {
        // Clear queue to allow effect to repopulate
        setProductQueue([]);
        setCurrentQueueIndex(0);
        setSelectedImage(null);

        // Load unpublished products
        unpublishedFetcher.load("/app/unpublished_products");
      }
    },
    [],
  );

  // Initial Load for AI Publisher if default (and Restore State)
  // REMOVED INITIAL LOAD FROM HERE -- MOVED DOWN

  // Persist State
  // REMOVED PERSISTENCE FROM HERE -- MOVED DOWN

  const tabs = [
    {
      id: 'manual-tab',
      content: 'Manual Selection',
      accessibilityLabel: 'Manually select products',
      panelID: 'manual-panel',
    },
    {
      id: 'ai-tab',
      content: 'AI Publisher',
      accessibilityLabel: 'Auto-fetch unpublished products',
      panelID: 'ai-panel',
    },
  ];

  // Auto-populate queue from unpublished fetcher
  useEffect(() => {
    if (unpublishedFetcher.data && unpublishedFetcher.data.products) {
      const products = unpublishedFetcher.data.products;

      // Only initialize if queue is empty to avoid overwriting active session
      // This prevents "background iteration" if fetcher revalidates
      if (products.length > 0) {
        setProductQueue(prev => {
          if (prev.length === 0) {
            setCurrentQueueIndex(0);
            shopify.toast.show(`Loaded ${products.length} unpublished products`);
            return products;
          }
          return prev; // Keep existing queue
        });
      } else {
        if (productQueue.length === 0) {
          shopify.toast.show("No unpublished products found!");
        }
      }
    }
  }, [unpublishedFetcher.data]);

  const selectProduct = async () => {
    const selected = await window.shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      query: "status:active"
    });

    console.log("ResourcePicker Selected:", selected);

    if (selected) {
      // Initialize Queue
      setProductQueue(selected);
      setCurrentQueueIndex(0);

      const firstProduct = selected[0];
      setSelectedImage(null);
      // Reset Pinterest State
      setPinterestUrl(null);
      setUploadingForProductId(null);

      // Fetch full details for the first product
      console.log("Loading details for:", firstProduct.id);
      productFetcher.load(`/app/product_info?id=${firstProduct.id}`);
    }
  };

  // ... (useEffect hook for productFetcher) ...

  useEffect(() => {
    if (productFetcher.data && productQueue.length > 0) {
      // We need to update the SPECIFIC product in the queue that matches the ID
      // OR if we are just loading the current one.
      // Attempt to merge data into the current item in queue
      setProductQueue(prevQueue => {
        return prevQueue.map(p => {
          if (productFetcher.data.id === p.id) {
            return { ...p, ...productFetcher.data };
          }
          return p;
        });
      });
    }
  }, [productFetcher.data]);

  const handleNext = () => {
    console.log("handleNext called");
    if (!selectedProduct) {
      console.log("No selected product");
      return;
    }

    // 1. Try Next Image
    const images = selectedProduct.images || [];
    const currentImgIndex = images.findIndex(img => img.id === selectedImage?.id);

    console.log("DEBUG IMAGES:");
    console.log("Selected Image ID:", selectedImage?.id);
    console.log("Product Images List:", images.map(i => i.id));
    console.log("Current Index:", currentImgIndex);

    if (images && currentImgIndex >= 0 && currentImgIndex < images.length - 1) {
      console.log("Switching to next image index:", currentImgIndex + 1);
      setSelectedImage(images[currentImgIndex + 1]);
      setIsCropping(true);
      setPinterestUrl(null);
      return;
    }

    // 2. Try Next Product
    if (currentQueueIndex < productQueue.length - 1) {
      const nextIndex = currentQueueIndex + 1;
      setCurrentQueueIndex(nextIndex);

      const nextProduct = productQueue[nextIndex];
      console.log("Switching to next product:", nextProduct.id);

      // Auto-copy title
      if (nextProduct.title) {
        navigator.clipboard.writeText(nextProduct.title)
          .then(() => shopify.toast.show("Title copied!"))
          .catch(err => console.error("Failed to copy title", err));
      }

      if (nextProduct.images && nextProduct.images.length > 0) {
        setSelectedImage(nextProduct.images[0]);
        setIsCropping(true);
      } else {
        setSelectedImage(null);
        setIsCropping(false);
      }

      productFetcher.load(`/app/product_info?id=${nextProduct.id}`);

      setPinterestUrl(null);
      setUploadingForProductId(null);
    } else {
      shopify.toast.show("All products processed!");
      setIsCropping(false);
      setPinterestUrl(null);
      setSelectedImage(null);
    }
  };

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
      setProductQueue(prevQueue => {
        return prevQueue.map((p, idx) => {
          if (p.id === uploadingForProductId) {
            // Check if already tagged to avoid infinite loop (ref stability)
            if (p.tags && p.tags.includes("Pinterest Published")) {
              return p;
            }

            const newTags = p.tags ? [...p.tags] : [];
            newTags.push("Pinterest Published");
            return { ...p, tags: newTags };
          }
          return p;
        });
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

  // --- EFFECT HOISTING FIX ---
  // Initial Load for AI Publisher if default (and Restore State)
  useEffect(() => {
    const savedQueue = localStorage.getItem("pin-publish-queue");
    const savedIndex = localStorage.getItem("pin-publish-index");
    const savedTab = localStorage.getItem("pin-publish-tab");

    // Modal State
    const savedModalOpen = localStorage.getItem("pin-publish-modal-open");
    const savedImage = localStorage.getItem("pin-publish-selected-image");
    const savedPinUrl = localStorage.getItem("pin-publish-pinterest-url");

    if (savedQueue) {
      try {
        const parsedQueue = JSON.parse(savedQueue);
        if (parsedQueue.length > 0) {
          setProductQueue(parsedQueue);
          if (savedIndex) setCurrentQueueIndex(parseInt(savedIndex, 10));
          if (savedTab) setSelectedTab(parseInt(savedTab, 10));

          // Restore Modal
          if (savedModalOpen === "true" && savedImage) {
            setSelectedImage(JSON.parse(savedImage));
            setIsCropping(true);
            if (savedPinUrl) setPinterestUrl(savedPinUrl);
          }

          shopify.toast.show("Session restored!");
          return; // Skip fetch if restoring
        }
      } catch (e) {
        console.error("Failed to parse saved queue", e);
      }
    }

    if (selectedTab === 1) {
      unpublishedFetcher.load("/app/unpublished_products");
    }
  }, []); // Run once on mount

  // Persist State
  useEffect(() => {
    if (productQueue.length > 0) {
      localStorage.setItem("pin-publish-queue", JSON.stringify(productQueue));
      localStorage.setItem("pin-publish-index", currentQueueIndex.toString());
    }
    localStorage.setItem("pin-publish-tab", selectedTab.toString());

    // Persist Modal State
    localStorage.setItem("pin-publish-modal-open", isCropping.toString());
    if (selectedImage) {
      localStorage.setItem("pin-publish-selected-image", JSON.stringify(selectedImage));
    } else {
      localStorage.removeItem("pin-publish-selected-image");
    }
    if (pinterestUrl) {
      localStorage.setItem("pin-publish-pinterest-url", pinterestUrl);
    } else {
      localStorage.removeItem("pin-publish-pinterest-url");
    }

  }, [productQueue, currentQueueIndex, selectedTab, isCropping, selectedImage, pinterestUrl]);
  // ---------------------------

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
        <Card>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
            <Box paddingBlockStart="400">

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
                              {selectedProduct.tags && selectedProduct.tags.includes("Pinterest Published") && (
                                <Button size="micro" onClick={handleResetStatus} tone="critical" variant="plain">Reset</Button>
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

                            <Divider />
                            <Text fontWeight="bold">Danger Zone</Text>
                            <Button tone="critical" onClick={handleResetAll} fullWidth>
                              Reset ALL Published Tags (Batch)
                            </Button>
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
            </Box>
          </Tabs>
        </Card>
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
            content: "Load Next Product",
            onAction: handleNext,
          },
          {
            content: pinterestUrl ? "Close" : "Cancel",
            onAction: () => { setIsCropping(false); setPinterestUrl(null); },
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {pinterestUrl ? (
              <Banner tone="success" title="Image Uploaded">
                <p>Click "Open Pinterest" to finish. Or load the next item.</p>
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

    </Page >
  );
}
