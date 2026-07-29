import Link from "next/link";

type Dashboard = "affinities" | "charms" | "demographics";

export function SiteHeader({ active }: { active: Dashboard }) {
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="MFC Info home">
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <span>
              <strong>MFC Info</strong>
              <small>Community data tools</small>
            </span>
          </Link>
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
          <Link
            className={`tab${active === "affinities" ? " active" : ""}`}
            href="/"
            aria-current={active === "affinities" ? "page" : undefined}
          >
            Trade Affinities
          </Link>
          <Link
            className={`tab${active === "charms" ? " active" : ""}`}
            href="/charms"
            aria-current={active === "charms" ? "page" : undefined}
          >
            Airport Charms
          </Link>
          <Link
            className={`tab${active === "demographics" ? " active" : ""}`}
            href="/demographics"
            aria-current={active === "demographics" ? "page" : undefined}
          >
            Population &amp; Elites
          </Link>
        </div>
      </nav>
    </>
  );
}
