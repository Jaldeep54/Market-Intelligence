import Link from "next/link";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  if (!email) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-foreground">
            Missing email address.{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Sign up again
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <VerifyEmailForm email={email} />
    </main>
  );
}
