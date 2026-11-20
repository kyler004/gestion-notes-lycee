export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly retryAfterSeconds?: number;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    retryAfterSeconds?: number;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Impossible de joindre le serveur.') {
    super(message);
    this.name = 'NetworkError';
  }
}
