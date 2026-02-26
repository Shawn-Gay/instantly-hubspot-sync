export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class RateLimitError extends ApiError {
  constructor(
    public retryAfterMs: number,
    message = "Rate limit exceeded",
  ) {
    super(message, 429);
    this.name = "RateLimitError";
  }
}
