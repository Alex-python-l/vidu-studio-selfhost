export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function publicErrorDetails(error: unknown) {
  if (error instanceof AppError) {
    return { status: error.status, message: error.message };
  }
  return {
    status: 500,
    message: "服务暂时不可用，请稍后重试。",
  };
}

export function errorResponse(error: unknown) {
  const { status, message } = publicErrorDetails(error);

  return Response.json({ error: message }, { status });
}
