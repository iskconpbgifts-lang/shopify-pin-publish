import prisma from "../db.server";

export async function getShopSettings(shop) {
    const config = await prisma.shopSettings.findUnique({
        where: { shop },
    });
    if (!config) return null;
    return JSON.parse(config.settings);
}

export async function updateShopSettings(shop, newSettings) {
    // 1. Fetch existing to merge
    const existing = await getShopSettings(shop) || {};
    const merged = { ...existing, ...newSettings };

    return await prisma.shopSettings.upsert({
        where: { shop },
        update: {
            settings: JSON.stringify(merged),
        },
        create: {
            shop,
            settings: JSON.stringify(merged),
        },
    });
}
