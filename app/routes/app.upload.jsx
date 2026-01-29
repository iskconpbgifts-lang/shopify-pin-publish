
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { uploadImageToShopify } from "../services/shopify-files.server";

export const action = async ({ request }) => {
    console.log("Upload Action: Request received");

    try {
        const { admin } = await authenticate.admin(request);
        console.log("Upload Action: Authenticated successfully");

        const formData = await request.formData();
        const imageBase64 = formData.get("image");

        console.log("Upload Action: Image data present?", !!imageBase64);
        if (imageBase64) {
            console.log("Upload Action: Image Base64 length:", imageBase64.length);
        }

        if (!imageBase64) {
            console.error("Upload Action: No image provided");
            return json({ error: "No image provided" }, { status: 400 });
        }

        const base64Data = imageBase64.split(',')[1];
        if (!base64Data) {
            console.error("Upload Action: Invalid Base64 format");
            return json({ error: "Invalid image format" }, { status: 400 });
        }

        const buffer = Buffer.from(base64Data, 'base64');
        console.log("Upload Action: Image decoded, buffer size:", buffer.length);

        const filename = `pinterest-crop-${Date.now()}.jpg`;

        console.log("Upload Action: Starting Shopify upload for", filename);
        const file = await uploadImageToShopify(admin, buffer, filename);
        console.log("Upload Action: File uploaded successfully:", file);

        return json({
            success: true,
            imageUrl: file.url,
            fileId: file.id
        });

    } catch (e) {
        console.error("Upload Action Error:", e);
        return json({ error: e.message }, { status: 500 });
    }
};
