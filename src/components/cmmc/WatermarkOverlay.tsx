interface WatermarkOverlayProps {
  status: string;
}

export function WatermarkOverlay({ status }: WatermarkOverlayProps) {
  if (status === 'EFFECTIVE') return null;

  const watermarkText = status === 'DRAFT' ? 'DRAFT' : status === 'IN_REVIEW' ? 'IN REVIEW' : 'RETIRED';

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
      style={{
        opacity: 0.1,
      }}
    >
      <div
        className="text-6xl font-bold text-red-500 transform -rotate-45"
        style={{
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
        }}
      >
        {watermarkText}
      </div>
    </div>
  );
}