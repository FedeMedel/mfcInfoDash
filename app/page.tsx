import { AffinityFinder } from "./affinity-finder";
import { SiteHeader } from "./site-header";

export default function Home() {
  return (
    <main>
      <SiteHeader active="affinities" />
      <AffinityFinder />
    </main>
  );
}
