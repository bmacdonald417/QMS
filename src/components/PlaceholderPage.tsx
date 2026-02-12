interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      <p className="mt-4 text-gray-400 max-w-2xl">{description}</p>
    </div>
  );
}
