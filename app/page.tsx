import { LandingContent } from "@/app/LandingContent";
import { getAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAppUser();
  const studioHref = user ? "/studio" : loginPath("/studio");
  const replacementHref = user
    ? "/studio?mode=replacement"
    : loginPath("/studio?mode=replacement");
  const motionHref = user
    ? "/studio?mode=motion"
    : loginPath("/studio?mode=motion");

  return (
    <LandingContent
      isSignedIn={Boolean(user)}
      studioHref={studioHref}
      replacementHref={replacementHref}
      motionHref={motionHref}
    />
  );
}

function loginPath(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}
