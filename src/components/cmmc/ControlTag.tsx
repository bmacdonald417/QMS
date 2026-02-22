interface ControlTagProps {
  id: string;
}

export function ControlTag({ id }: ControlTagProps) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-md bg-mactech-blue/20 text-mactech-blue text-xs font-mono font-semibold border border-mactech-blue/30">
      {id}
    </span>
  );
}