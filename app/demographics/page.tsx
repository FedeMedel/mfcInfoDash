import { SiteHeader } from "@/app/site-header";
import { DemographicFinder } from "./demographic-finder";

export default function DemographicsPage() {
  return (
    <main>
      <SiteHeader active="demographics" />
      <DemographicFinder />
    </main>
  );
}
