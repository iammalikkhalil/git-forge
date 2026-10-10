export const creator = {
  name: "Muhammad Khalil",
  portfolio: "https://mkhalil.vercel.app",
  github: "https://github.com/iammalikkhalil",
  linkedin: "https://www.linkedin.com/in/iammalikkhalil",
};

export function CreatorLinks() {
  return (
    <nav className="creator-links" aria-label="Connect with Muhammad Khalil">
      {[
        ["Portfolio", creator.portfolio],
        ["GitHub", creator.github],
        ["LinkedIn", creator.linkedin],
      ].map(([label, url]) => (
        <a key={label} href={url} target="_blank" rel="noopener noreferrer">
          {label}
          <span aria-hidden="true"> ↗</span>
          <span className="creator-sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </nav>
  );
}
