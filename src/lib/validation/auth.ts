import { z } from "zod";

// Registration is restricted to this exact domain -- see extractEmailDomain
// for why "exact" (not endsWith) matters.
export const ALLOWED_SIGNUP_DOMAIN = "goldisolar.com";

// Domain must match exactly, not just endsWith -- otherwise
// "name@goldisolar.com.evil.com" would pass an endsWith("goldisolar.com")
// check. Also rejects anything with more or fewer than one "@" outright,
// rather than guessing which segment is the real domain.
export function extractEmailDomain(email: string): string | null {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return parts[1];
}

export function isAllowedSignupEmail(email: string): boolean {
  return extractEmailDomain(email) === ALLOWED_SIGNUP_DOMAIN;
}

const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export const signUpSchema = z
  .object({
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
