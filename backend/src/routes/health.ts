import type { FastifyInstance } from "fastify";

interface HealthResponse {
    status: string;
    timestamp: string;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
    app.get<{ Reply: HealthResponse }>("/health", {
        schema: {
            tags: ["health"],
            summary: "Health check",
            description: "Returns server health status and current timestamp",
        },
    }, async (_request, _reply) => {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
        };
    });
}
