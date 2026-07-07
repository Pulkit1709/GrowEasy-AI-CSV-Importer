import { errorResponse } from "@/server/errors";
import { uploadImport } from "@/server/controllers/import-controller";

export async function POST(request: Request) {
  try {
    return Response.json(await uploadImport(request), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
