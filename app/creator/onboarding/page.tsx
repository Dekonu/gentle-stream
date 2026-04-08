import { redirect } from "next/navigation";
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { getCreatorProfile } from "@/lib/db/creator";
import { CreatorOnboardingForm } from "@/components/creator/CreatorOnboardingForm";
import { CREATOR_ONBOARDING_ENABLED } from "@/lib/feature-flags/regulatory";

export const dynamic = "force-dynamic";

export default async function CreatorOnboardingPage() {
  if (!CREATOR_ONBOARDING_ENABLED) {
    return (
      <LegalDocumentShell
        title="Creator onboarding"
        description="Status update for creator access."
      >
        <p style={{ marginTop: 0 }}>
          Creator onboarding is a work in progress and is temporarily disabled pending approval
          from the appropriate regulatory agencies.
        </p>
      </LegalDocumentShell>
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/creator/onboarding");

  const userProfile = await getOrCreateUserProfile(user.id);
  const creatorProfile = await getCreatorProfile(user.id);
  if (userProfile.userRole === "creator" && creatorProfile?.onboardingCompletedAt) {
    redirect("/creator");
  }

  const phoneConfirmedAt = (user as { phone_confirmed_at?: string | null }).phone_confirmed_at ?? null;
  const initialPhoneConfirmed = Boolean(user.phone && phoneConfirmedAt);

  return (
    <CreatorOnboardingForm
      initialPhone={user.phone ?? ""}
      initialPhoneConfirmed={initialPhoneConfirmed}
    />
  );
}
