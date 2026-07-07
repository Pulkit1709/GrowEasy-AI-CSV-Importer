export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "BAD_REQUEST"
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      { error: { message: error.message, code: error.code } },
      { status: error.status }
    );
  }

  console.error("Unhandled API error", error);
  return Response.json(
    { error: { message: "Something went wrong while processing the import.", code: "INTERNAL_ERROR" } },
    { status: 500 }
  );
}
