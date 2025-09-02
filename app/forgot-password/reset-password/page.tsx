"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { resetPasswordFunc } from "./action";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { EmailOtpType } from "@supabase/supabase-js";

const formSchema = z.object({
  password: z.string().min(6),
  passwordConfirm: z.string().min(6),
});

function ResetPasswordInner() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Add loading state
  const router = useRouter();
  const searchParams = useSearchParams();

  // Ensure we exchange the code for a session when user lands on the page
  useEffect(() => {
    const supabase = createClient();

    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    const code = searchParams.get("code");

    // 1) Support verifyOtp recovery flow (token_hash/type)
    if (token_hash && type === "recovery") {
      supabase.auth
        .verifyOtp({ type: "recovery", token_hash })
        .then(({ error }) => {
          if (error) {
            toast.error("Reset link expired or invalid", {
              description: "Please request a new reset email.",
            });
            router.replace("/forgot-password");
            return;
          }
          router.replace("/forgot-password/reset-password");
        });
      return;
    }

    // 2) Fallback to code exchange flow
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          toast.error("Reset link expired or invalid", {
            description: "Please request a new reset email.",
          });
          router.replace("/forgot-password");
          return;
        }
        router.replace("/forgot-password/reset-password");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      passwordConfirm: "",
    },
  });

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    setServerError(null);
    setIsLoading(true); // Set loading to true when submission starts

    try {
      const response = await resetPasswordFunc({
        password: data.password,
        passwordConfirm: data.passwordConfirm,
      });

      if (response.error) {
        setServerError(response.message);
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false); // Set loading to false when submission ends
    }
  };

  return (
    <main className="flex justify-center items-center min-h-screen">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle>Password Reset</CardTitle>
          <CardDescription>
            Enter your new password to update your password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="flex flex-col gap-2"
            >
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="passwordConfirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password confirm</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError && (
                <p className="text-red-500 text-sm mt-2">{serverError}</p>
              )}
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Please wait
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={
      <main className="flex justify-center items-center min-h-screen">
        <div className="text-white/70 flex items-center gap-2">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </div>
      </main>
    }>
      <ResetPasswordInner />
    </Suspense>
  );
}