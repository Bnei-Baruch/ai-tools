export default function ErrorAlert({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="alert alert--error" role="alert">
      <strong>שגיאה:</strong> <span dir="auto">{error}</span>
    </div>
  );
}
