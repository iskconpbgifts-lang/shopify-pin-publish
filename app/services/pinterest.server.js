export class PinterestService {
    constructor() {
        this.accessToken = process.env.PINTEREST_ACCESS_TOKEN;
        this.baseUrl = "https://api.pinterest.com/v5";
    }

    async getHeaders() {
        return {
            "Authorization": `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
        };
    }

    async getBoards() {
        const response = await fetch(`${this.baseUrl}/boards`, {
            method: "GET",
            headers: await this.getHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch boards: ${response.statusText}`);
        }

        const data = await response.json();
        return data.items;
    }

    async createPin(boardId, title, description, link, mediaId) {
        const payload = {
            board_id: boardId,
            title: title,
            description: description,
            link: link,
            media_source: {
                source_type: "image_id",
                cover_image_id: mediaId
            }
        };

        const response = await fetch(`${this.baseUrl}/pins`, {
            method: "POST",
            headers: await this.getHeaders(),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Failed to create pin: ${err}`);
        }

        return await response.json();
    }

    // Helper to upload image and get Media ID (if needed for v5)
    // Pinterest v5 usually asks for media_source type 'image_url' or 'image_base64' (if supported) or upload via creating a media container.
    // Docs say: Register media -> Get upload URL -> Upload -> Check Status.
    // For simplicity, let's see if we can use base64 or similar.
    // V5 spec: media_source has source_type "image_url", "video_id", "multiple_image_urls", etc.
    // Does it support base64? It seems not directly in 'create pin'.
    // We need to upload media first using /media endpoint if we have raw bytes.
    // Let's implement the 'Register Media' flow.

    async registerMedia() {
        const response = await fetch(`${this.baseUrl}/media`, {
            method: "POST",
            headers: await this.getHeaders(),
            body: JSON.stringify({
                media_type: "image"
            })
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Failed to register media: ${txt}`);
        }
        return await response.json();
    }

    async uploadImage(uploadUrl, uploadParameters, imageBuffer) {
        // Construct FormData for the upload
        // Note: In Node environment (Remix Loader/Action), we might need 'form-data' package or use native fetch with FormData compatibility.
        // Since we are in Node 18+ (likely), generic FormData might be available or we use 'undici' or similar. 
        // However, Remix usually polyfills web standards.
        // The imageBuffer is expected to be a Buffer or Blob.

        const formData = new FormData();
        // Parameters must be added first
        for (const [key, value] of Object.entries(uploadParameters)) {
            formData.append(key, value);
        }
        // Add file
        // If imageBuffer is a Buffer, we might need to wrap it in a Blob or similar depending on the environment.
        // Or just pass it if the fetch implementation supports it. 
        // Assuming imageBuffer is a Blob/File object passed from the frontend -> backend. 
        // Actually, in the action, we'll likely parse multipart/form-data and get a Node ReadableStream or Buffer.
        // Let's assume we convert it to a Blob.
        const file = new Blob([imageBuffer], { type: 'image/jpeg' });
        formData.append('file', file);

        const response = await fetch(uploadUrl, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Failed to upload media to S3: ${response.statusText}`);
        }
    }

    async checkMediaStatus(mediaId) {
        const response = await fetch(`${this.baseUrl}/media/${mediaId}`, {
            method: "GET",
            headers: await this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error("Failed to check media status");
        }
        return await response.json();
    }

    async waitForMedia(mediaId) {
        // Poll every 1 second
        let status = 'processing';
        while (status === 'registering' || status === 'processing') {
            await new Promise(r => setTimeout(r, 1000));
            const data = await this.checkMediaStatus(mediaId);
            status = data.status;
            if (status === 'succeeded') return true;
            if (status === 'failed') throw new Error("Media upload failed processing");
        }
        return true;
    }
}
