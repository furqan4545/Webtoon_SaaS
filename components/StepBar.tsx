"use client";

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
  StepperDescription,
} from "@/components/ui/stepper";
import { Check, LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = {
  title: string;
  description: string;
  href: string;
};

const STEPS: Step[] = [
  { title: "Import story", description: "Paste or upload", href: "/import-story" },
  { title: "Art style", description: "Describe look", href: "/choose-art-style" },
  { title: "Characters", description: "Generate refs", href: "/generate-characters" },
  { title: "Builder", description: "Assemble scenes", href: "/webtoon-builder" },
];

interface StepBarProps {
  currentStep: number; // 1..4
  className?: string;
}

export default function StepBar({ currentStep, className }: StepBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const active = useMemo(() => {
    // Validate and bound step to [1, STEPS.length]
    if (!Number.isFinite(currentStep)) return 1;
    return Math.min(Math.max(1, Math.floor(currentStep)), STEPS.length);
  }, [currentStep]);

  return (
    <div className={cn("w-full", className)}>
      <Stepper
        value={active}
        indicators={{
          completed: <Check className="size-3.5" />,
          loading: <LoaderCircleIcon className="size-3.5 animate-spin" />,
        }}
        className="space-y-4"
      >
        <StepperNav className="items-start">
          {STEPS.map((s, index) => (
            <StepperItem key={s.href} step={index + 1} className="relative flex-1 items-start">
              <StepperTrigger
                className="flex flex-col items-center gap-2 text-center"
                onClick={(e) => {
                  e.preventDefault();
                  if (pathname !== s.href) router.push(s.href);
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <StepperIndicator>{index + 1}</StepperIndicator>
                </div>
                <div className="leading-tight">
                  <StepperTitle>{s.title}</StepperTitle>
                  <StepperDescription>{s.description}</StepperDescription>
                </div>
              </StepperTrigger>

              {STEPS.length > index + 1 && (
                <StepperSeparator className="absolute top-3 inset-x-0 left-[calc(50%+0.875rem)] m-0 group-data-[orientation=horizontal]/stepper-nav:w-[calc(100%-2rem+0.225rem)] group-data-[orientation=horizontal]/stepper-nav:flex-none group-data-[state=completed]/step:bg-primary" />
              )}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>
    </div>
  );
}


