import { errorResponse } from "@/server/errors";
import { processImport } from "@/server/controllers/import-controller";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ importId: string }> }
) {
  try {
    const { importId } = await params;
    return Response.json(await processImport(importId, request));
  } catch (error) {
    return errorResponse(error);
  }
}
