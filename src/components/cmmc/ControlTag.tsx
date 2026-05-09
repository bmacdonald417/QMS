interface ControlTagProps {
  id: string;
}

export function ControlTag({ id }: ControlTagProps) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-mono font-semibold border border-primary/30">
      {id}
    </span>
  );
}