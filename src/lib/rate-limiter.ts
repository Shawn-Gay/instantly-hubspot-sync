/**
 * Token-bucket rate limiter. Blocks caller with Bun.sleep() rather than throwing.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per interval
    private refillIntervalMs: number, // interval in ms
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs) * this.refillRate;
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  async acquire(): Promise<void> {
    this.refill();

    while (this.tokens < 1) {
      const waitMs = this.refillIntervalMs - (Date.now() - this.lastRefill);
      await Bun.sleep(Math.max(waitMs, 100));
      this.refill();
    }

    this.tokens -= 1;
  }
}

// HubSpot: ~90 requests per 10 seconds (conservative)
export const hubspotLimiter = new RateLimiter(90, 90, 10_000);

// Instantly: ~10 requests per 10 seconds (conservative for shared workspace)
export const instantlyLimiter = new RateLimiter(10, 10, 10_000);
