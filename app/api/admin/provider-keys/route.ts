import {
  adminApiError,
  parseAdminProviderKeyActivation,
  parseAdminProviderKeyCreate,
  parseAdminProviderKeyDelete,
  requestIdFrom,
  requireSameOrigin,
} from "@/lib/admin-data";
import { requireAdminUser } from "@/lib/auth";
import {
  checkActiveProviderKeyAvailability,
  createManagedProviderKey,
  deleteManagedProviderKey,
  inspectActiveProviderKey,
  listProviderKeyStatuses,
  setActiveProviderKey,
} from "@/lib/provider-keys";
import { getProviderUsage } from "@/lib/provider-usage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    await requireAdminUser();
    const [providers, quotas, usage] = await Promise.all([
      listProviderKeyStatuses(),
      Promise.all([
        inspectActiveProviderKey("vidu"),
        inspectActiveProviderKey("gemini"),
      ]),
      getProviderUsage(),
    ]);
    return Response.json(
      { providers, quotas, usage },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const input = await parseAdminProviderKeyActivation(request);
    const provider = await setActiveProviderKey({
      ...input,
      actorUserId: actor.id,
      requestId,
    });
    const validation = await checkActiveProviderKeyAvailability(input.provider);
    return Response.json(
      { provider, validation, requestId },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const input = await parseAdminProviderKeyCreate(request);
    const provider = await createManagedProviderKey({
      ...input,
      actorUserId: actor.id,
      requestId,
    });
    const validation = await checkActiveProviderKeyAvailability(input.provider);
    return Response.json(
      { provider, validation, requestId },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    requireSameOrigin(request);
    const actor = await requireAdminUser({ write: true });
    const input = await parseAdminProviderKeyDelete(request);
    const provider = await deleteManagedProviderKey({
      ...input,
      actorUserId: actor.id,
      requestId,
    });
    return Response.json(
      { provider, requestId },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return adminApiError(error, requestId);
  }
}
