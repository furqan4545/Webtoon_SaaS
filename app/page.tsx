import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import HomeDashboardClient from "./home/HomeDashboardClient";

export default async function Home() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    redirect("/login");
  }

  // Server-side fetch to avoid initial client fetch and reduce re-renders
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id,title,status,updated_at')
    .eq('user_id', data.user.id)
    .order('updated_at', { ascending: false });

  const initialProjects = (projects || []).map((p: any) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    chapters: 0,
    modifiedAt: p.updated_at,
  }));

  return <HomeDashboardClient initialProjects={initialProjects} />;
}
