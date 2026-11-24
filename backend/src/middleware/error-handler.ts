import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

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
  const invalid = error instanceof ZodError;
  const mongoDuplicate = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
  const mongoCast = typeof error === "object" && error !== null && "name" in error && error.name === "CastError";
  const status = known?.statusCode ?? (invalid || mongoCast ? 400 : mongoDuplicate ? 409 : 500);
  const message = known?.message ?? (invalid ? "Request validation failed" : mongoCast ? "Invalid resource identifier" : mongoDuplicate ? "A record with this value already exists" : "An unexpected error occurred");
  if (!known && !invalid && !mongoDuplicate && !mongoCast) console.error(error);

  res.status(status).json({
    error: {
      code: known?.code ?? (invalid ? "VALIDATION_ERROR" : mongoCast ? "INVALID_ID" : mongoDuplicate ? "DUPLICATE_RECORD" : "INTERNAL_SERVER_ERROR"),
      message
    }
  });
};
