export function WorkspaceSection({
  title,
  description,
  placeholder,
}: {
  title: string;
  description: string;
  placeholder: string;
}) {
  return (
    <section aria-labelledby="workspace-title">
      <div className="workspace-section-heading">
        <h1 id="workspace-title">{title}</h1>
        <p>{description}</p>
      </div>
      <div className="workspace-panel workspace-placeholder">
        <p>{placeholder}</p>
      </div>
    </section>
  );
}
