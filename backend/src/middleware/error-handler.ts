import type { ErrorRequestHandler, RequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "REQUEST_ERROR"
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const known = error instanceof ApiError ? error : null;
  const status = known?.statusCode ?? 500;
  const message = known?.message ?? "An unexpected error occurred";
  if (!known) console.error(error);

  res.status(status).json({
    error: {
      code: known?.code ?? "INTERNAL_SERVER_ERROR",
      message
    }
  });
};
