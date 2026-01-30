export const createImage = (url) =>
    new Promise((resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () => {
            console.log("Image loaded successfully:", url);
            resolve(image);
        })
        image.addEventListener('error', (error) => {
            console.error("Image load error:", error);
            reject(error);
        })
        image.setAttribute('crossOrigin', 'anonymous') // needed to avoid cross-origin issues on CodeSandbox
        image.src = url
    })

export function getRadianAngle(degreeValue) {
    return (degreeValue * Math.PI) / 180
}

/**
 * Returns the new bounding area of a rotated rectangle.
 */
export function rotateSize(width, height, rotation) {
    const rotRad = getRadianAngle(rotation)

    return {
        width:
            Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
        height:
            Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    }
}

/**
 * This function was adapted from the one in the ReadMe of https://github.com/DominicTobias/react-image-crop
 */
export default async function getCroppedImg(
    imageSrc,
    pixelCrop,
    rotation = 0,
    flip = { horizontal: false, vertical: false },
    watermark = null
) {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
        return null
    }

    const rotRad = getRadianAngle(rotation)

    // calculate bounding box of the rotated image
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
        image.width,
        image.height,
        rotation
    )

    // set canvas size to match the bounding box
    canvas.width = bBoxWidth
    canvas.height = bBoxHeight

    // translate canvas context to a central location to allow rotating and flipping around the center
    ctx.translate(bBoxWidth / 2, bBoxHeight / 2)
    ctx.rotate(rotRad)
    ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1)
    ctx.translate(-image.width / 2, -image.height / 2)

    // draw rotated image
    ctx.drawImage(image, 0, 0)

    // croppedAreaPixels values are bounding-box relative
    // extract the cropped image using these values
    const data = ctx.getImageData(
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height
    )

    // set canvas width to final desired crop size - this will clear existing context
    canvas.width = pixelCrop.width
    canvas.height = pixelCrop.height

    // paste generated rotate image at the top left corner
    ctx.putImageData(data, 0, 0)

    // --- WATERMARK LOGIC ---
    // DEBUG:
    console.log("getCroppedImg: Checking Watermark...", watermark);

    if (watermark) {
        // Normalize 'image' to 'src' if needed (handle both state formats)
        // We do this check independently of whether .src exists yet
        if (watermark.image && !watermark.src) {
            console.log("Watermark has 'image' prop, fixing to 'src'...");
            watermark.src = watermark.image;
        }

        if (watermark.src) {
            console.log("getCroppedImg: Watermark found, applying...");

            try {
                const wmImg = await createImage(watermark.src);

                // 1. Calculate Watermark Size
                // Scale relative to the *output* canvas width
                const wmDisplayWidth = canvas.width * (watermark.scale || 0.2);
                const aspectRatio = wmImg.height / wmImg.width;
                const wmDisplayHeight = wmDisplayWidth * aspectRatio;

                // 2. Calculate Position
                const padding = canvas.width * 0.03; // 3% padding
                let x = 0;
                let y = 0;

                const pos = watermark.position || 'bottom-right';

                switch (pos) {
                    case 'top-left':
                        x = padding;
                        y = padding;
                        break;
                    case 'top-right':
                        x = canvas.width - wmDisplayWidth - padding;
                        y = padding;
                        break;
                    case 'center':
                        x = (canvas.width - wmDisplayWidth) / 2;
                        y = (canvas.height - wmDisplayHeight) / 2;
                        break;
                    case 'bottom-left':
                        x = padding;
                        y = canvas.height - wmDisplayHeight - padding;
                        break;
                    case 'bottom-right':
                    default:
                        x = canvas.width - wmDisplayWidth - padding;
                        y = canvas.height - wmDisplayHeight - padding;
                        break;
                }

                // 3. Draw Watermark
                ctx.save();
                ctx.globalAlpha = watermark.opacity ?? 0.8;
                ctx.drawImage(wmImg, x, y, wmDisplayWidth, wmDisplayHeight);
                ctx.restore();

            } catch (e) {
                console.error("Failed to apply watermark", e);
            }
        }
    }

    // As Base64 string
    return canvas.toDataURL('image/jpeg');
    // As Blob

    // As Blob
    // return new Promise((resolve, reject) => {
    //   canvas.toBlob((file) => {
    //     resolve(URL.createObjectURL(file))
    //   }, 'image/jpeg')
    // })
}
