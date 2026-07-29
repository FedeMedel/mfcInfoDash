import { CharmFinder } from "@/app/charm-finder";
import { SiteHeader } from "@/app/site-header";

export default function CharmsPage() {
  return (
    <main>
      <SiteHeader active="charms" />
      <CharmFinder />
    </main>
  );
}
