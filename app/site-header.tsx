type Dashboard = "affinities" | "charms";

export function SiteHeader({ active }: { active: Dashboard }) {
  return (
    <>
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
          <a
            className={`tab${active === "affinities" ? " active" : ""}`}
            href="/"
            aria-current={active === "affinities" ? "page" : undefined}
          >
            Trade Affinities
          </a>
          <a
            className={`tab${active === "charms" ? " active" : ""}`}
            href="/charms"
            aria-current={active === "charms" ? "page" : undefined}
          >
            Airport Charms
          </a>
          <span className="tab disabled" aria-disabled="true">
            Airport Explorer <small>Coming soon</small>
          </span>
          <span className="tab disabled" aria-disabled="true">
            Network Insights <small>Coming soon</small>
          </span>
        </div>
      </nav>
    </>
  );
}
