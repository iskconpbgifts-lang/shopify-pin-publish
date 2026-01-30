import prisma from "../db.server";

export async function savePinnedProduct({
    shop,
    productId,
    productHandle,
    status,
    title,
    imageUrl
}) {
    // Upsert ensuring we don't duplicate state for same shop+product
    // Since we don't have a unique constraint on shop+productId (only index), we should use findFirst or a unique constraint.
    // However, Prisma upsert requires a unique constraint.
    // Let's use simple check-then-create/update logic or relying on the code flow.
    // A better approach for "Upsert" without unique constraint is deleteMany + create, or findFirst.

    // Let's stick to simple create because "status" might change (e.g. from Ignored to Published).
    // Actually, we should clean up old entries for this product to keep it clean.

    // Transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
        // Delete any existing entry for this product (Published OR Ignored)
        await tx.pinnedProduct.deleteMany({
            where: {
                shop: shop,
                productId: productId
            }
        });

        // Create new entry
        return await tx.pinnedProduct.create({
            data: {
                shop,
                productId,
                productHandle,
                status,
                title,
                imageUrl
            }
        });
    });
}

export async function getPinnedProducts(shop, status) {
    return await prisma.pinnedProduct.findMany({
        where: {
            shop: shop,
            status: status
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

export async function deletePinnedProduct(shop, productId) {
    return await prisma.pinnedProduct.deleteMany({
        where: {
            shop: shop,
            productId: productId
        }
    });
}
