import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { updateShopSettings, getShopSettings } from "../models/settings.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const settings = await getShopSettings(session.shop);
    return json(settings || {});
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const data = await request.json();

    await updateShopSettings(session.shop, data);

    return json({ success: true });
};
