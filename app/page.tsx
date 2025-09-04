import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import HomeDashboardClient from "./home/HomeDashboardClient";

export default async function Home() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    redirect("/login");
  }
  return <HomeDashboardClient />;
}
