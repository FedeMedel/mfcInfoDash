import { AffinityFinder } from "./affinity-finder";

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="MFC Info home">
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <span>
              <strong>MFC Info</strong>
              <small>Community data tools</small>
            </span>
          </a>
          <div className="source-note">
            Live airport data from{" "}
            <a href="https://play.myfly.club/" target="_blank" rel="noreferrer">
              play.myfly.club
            </a>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Dashboards">
        <div className="tabs-inner">
          <a className="tab active" href="/" aria-current="page">
            Trade Affinities
          </a>
          <span className="tab disabled" aria-disabled="true">
            Airport Explorer <small>Coming soon</small>
          </span>
          <span className="tab disabled" aria-disabled="true">
            Network Insights <small>Coming soon</small>
          </span>
        </div>
      </nav>

      <AffinityFinder />
    </main>
  );
}
