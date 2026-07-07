import { errorResponse } from "@/server/errors";
import { getImportStatus } from "@/server/controllers/import-controller";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> }
) {
  try {
    const { importId } = await params;
    return Response.json(await getImportStatus(importId));
  } catch (error) {
    return errorResponse(error);
  }
}
