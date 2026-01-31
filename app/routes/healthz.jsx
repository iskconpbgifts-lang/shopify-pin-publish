import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }) => {
    try {
        // Optional: Check DB connection
        await prisma.$queryRaw`SELECT 1`;
        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("Healthcheck failed", error);
        return new Response("ERROR", { status: 500 });
    }
};
