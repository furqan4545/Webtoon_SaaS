"use client";

import ImportStory from "../import-story/page";
import { useEffect } from "react";

// Reuse the import-story UI but hide the file upload affordance via CSS
export default function CreateMyStory() {
  useEffect(() => {
    // Hide the upload row if present (defensive)
    const el = document.querySelector("input[type='file']") as HTMLInputElement | null;
    if (el) el.closest('div')?.classList.add('hidden');
  }, []);
  return <ImportStory />;
}



